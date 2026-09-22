require("dotenv").config();

const prisma = require("../src/config/prisma");

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function baselineKey(policy) {
  const value = `${policy.leaveType?.code || ""} ${policy.leaveType?.name || ""}`.toUpperCase();
  if (value.includes("ANNUAL")) return "ANNUAL";
  if (value.includes("SICK")) return "SICK";
  if (value.includes("UNPAID")) return "UNPAID";
  return null;
}

function applicable(policy, asOf) {
  return policy.status === "ACTIVE" && policy.isActive === true &&
    new Date(policy.effectiveFrom) <= asOf &&
    (!policy.effectiveTo || new Date(policy.effectiveTo) >= asOf);
}

function recommendation(policies, asOf) {
  const current = policies.filter((policy) => applicable(policy, asOf));
  if (current.length === 1) {
    return { recommendedPolicyId: current[0].id, decision: "CURRENT_GOVERNING_POLICY_CONFIRMED", rationale: "Only one policy is currently applicable." };
  }
  if (!current.length) {
    return { recommendedPolicyId: null, decision: "NO_CURRENT_GOVERNING_POLICY", rationale: "No ACTIVE/effective policy currently governs this leave type." };
  }
  const groups = new Set(current.map((policy) => policy.versionGroupId || policy.id));
  if (groups.size === 1) {
    const newest = [...current].sort((a, b) => b.versionNumber - a.versionNumber || new Date(b.effectiveFrom) - new Date(a.effectiveFrom))[0];
    return {
      recommendedPolicyId: newest.id,
      decision: "SUPERSEDED_ACTIVE_VERSIONS_REQUIRE_NORMALIZATION",
      rationale: "All conflicts are in one version group. The highest current version is the governing candidate; older versions should be effective-ended and RETIRED after verification.",
    };
  }
  const operational = current.filter((policy) => policy.usage.requests > 0 || policy.usage.allocations > 0 || policy.usage.adjustments > 0);
  if (operational.length === 1) {
    return {
      recommendedPolicyId: operational[0].id,
      decision: "OPERATIONALLY_REFERENCED_POLICY_REQUIRES_HR_CONFIRMATION",
      rationale: "Only one current policy has employee operational references. Confirm its intended coverage before normalizing the unused policy families.",
    };
  }
  return {
    recommendedPolicyId: null,
    decision: "MANUAL_GOVERNING_POLICY_DECISION_REQUIRED",
    rationale: "Multiple current policy families exist. Coverage/assignment intent must be confirmed; no policy was selected automatically.",
  };
}

async function main() {
  const organizationId = argument("--organization-id") || process.env.CHRIS_ORGANIZATION_ID;
  const asOf = new Date(argument("--as-of") || new Date());
  if (!organizationId) throw new Error("Provide --organization-id <tenant-id> or CHRIS_ORGANIZATION_ID.");
  if (Number.isNaN(asOf.getTime())) throw new Error("INVALID_AS_OF_DATE");

  const policies = (await prisma.leavePolicy.findMany({
    where: { organizationId },
    include: {
      leaveType: true,
      _count: { select: { requests: true, audits: true, entitlementAdjustments: true, entitlementAllocations: true, entitlementMatrixRules: true } },
    },
    orderBy: [{ leaveType: { name: "asc" } }, { versionGroupId: "asc" }, { versionNumber: "asc" }],
  })).filter((policy) => baselineKey(policy));

  const [requestStatuses, balanceCounts] = await Promise.all([
    prisma.leaveRequest.groupBy({
      by: ["leavePolicyId", "status"],
      where: { organizationId, leavePolicyId: { in: policies.map((policy) => policy.id) } },
      _count: { _all: true },
    }),
    prisma.leaveBalance.groupBy({
      by: ["leaveTypeId"],
      where: { organizationId, leaveTypeId: { in: [...new Set(policies.map((policy) => policy.leaveTypeId))] } },
      _count: { _all: true },
    }),
  ]);
  const statusMap = new Map();
  for (const row of requestStatuses) {
    const value = statusMap.get(row.leavePolicyId) || {};
    value[row.status] = row._count._all;
    statusMap.set(row.leavePolicyId, value);
  }
  const balanceMap = new Map(balanceCounts.map((row) => [row.leaveTypeId, row._count._all]));

  const detail = policies.map((policy) => ({
    baselineLeaveType: baselineKey(policy),
    leaveTypeId: policy.leaveTypeId,
    leaveType: policy.leaveType.name,
    policyId: policy.id,
    policyCode: policy.code,
    policyName: policy.name,
    versionNumber: policy.versionNumber,
    versionGroupId: policy.versionGroupId,
    status: policy.status,
    isActive: policy.isActive,
    effectiveFrom: policy.effectiveFrom,
    effectiveTo: policy.effectiveTo,
    createdAt: policy.createdAt,
    currentlyApplicable: applicable(policy, asOf),
    usage: {
      requests: policy._count.requests,
      requestStatuses: statusMap.get(policy.id) || {},
      leaveTypeBalances: balanceMap.get(policy.leaveTypeId) || 0,
      allocations: policy._count.entitlementAllocations,
      adjustments: policy._count.entitlementAdjustments,
      matrixRules: policy._count.entitlementMatrixRules,
      auditEvents: policy._count.audits,
      hasExistingRequestsBalancesOrHistory: policy._count.requests > 0 || (balanceMap.get(policy.leaveTypeId) || 0) > 0 || policy._count.entitlementAllocations > 0 || policy._count.entitlementAdjustments > 0 || policy._count.audits > 0,
    },
  }));

  const report = ["ANNUAL", "SICK", "UNPAID"].map((key) => {
    const matching = detail.filter((policy) => policy.baselineLeaveType === key);
    return { baselineLeaveType: key, policies: matching, recommendation: recommendation(matching, asOf) };
  });

  console.table(detail.map((policy) => ({
    leaveTypeId: policy.leaveTypeId,
    leaveType: policy.leaveType,
    policyId: policy.policyId,
    policyCode: policy.policyCode,
    policyName: policy.policyName,
    version: policy.versionNumber,
    versionGroup: policy.versionGroupId,
    status: policy.status,
    isActive: policy.isActive,
    effectiveFrom: policy.effectiveFrom?.toISOString(),
    effectiveTo: policy.effectiveTo?.toISOString() || "—",
    createdAt: policy.createdAt?.toISOString(),
    applicable: policy.currentlyApplicable,
    requests: policy.usage.requests,
    balancesForType: policy.usage.leaveTypeBalances,
    allocations: policy.usage.allocations,
    adjustments: policy.usage.adjustments,
    audits: policy.usage.auditEvents,
  })));
  console.log(JSON.stringify({ organizationId, asOf, report }, null, 2));
  console.log("DIAGNOSTIC ONLY: no policy or entitlement record was changed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
