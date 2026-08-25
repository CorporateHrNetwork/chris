require("dotenv").config();

const crypto = require("crypto");
const prisma = require("../src/config/prisma");

const GOVERNING = { id: "a1686721-e701-4800-aa3d-d1727455fee8", code: "ANNUAL", name: "Annual Leave" };
const STANDARD_CODE = "ANNUAL_STD_053367";
const SENIOR_CODE = "ANNUAL_SENIOR_STAFF";
const STANDARD_EFFECTIVE_TO = new Date("2026-08-22T23:59:59.999Z");

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}
function hasFlag(name) { return process.argv.includes(name); }
function isCurrent(policy, asOf) {
  return policy.status === "ACTIVE" && policy.isActive === true && new Date(policy.effectiveFrom) <= asOf &&
    (!policy.effectiveTo || new Date(policy.effectiveTo) >= asOf);
}
function validInterval(effectiveFrom, effectiveTo) {
  return effectiveTo == null || new Date(effectiveTo) >= new Date(effectiveFrom);
}
function exactPolicy(policies, { id, code, name }) {
  const matches = policies.filter((policy) => policy.id === id && policy.code === code && (!name || policy.name === name));
  if (matches.length !== 1) throw new Error(`EXACT_POLICY_IDENTITY_MISMATCH: ${code}`);
  return matches[0];
}
function fingerprintPolicy(policy) {
  return {
    id: policy.id, organizationId: policy.organizationId, leaveTypeId: policy.leaveTypeId,
    code: policy.code, name: policy.name, status: policy.status, isActive: policy.isActive,
    effectiveFrom: policy.effectiveFrom?.toISOString() || null,
    effectiveTo: policy.effectiveTo?.toISOString() || null,
    updatedAt: policy.updatedAt?.toISOString() || null,
    requests: policy._count.requests, audits: policy._count.audits,
    entitlementAdjustments: policy._count.entitlementAdjustments,
    entitlementAllocations: policy._count.entitlementAllocations,
    entitlementMatrixRules: policy._count.entitlementMatrixRules,
  };
}
function reportPolicyState(policy) {
  return {
    policyId: policy.id, policyCode: policy.code, policyName: policy.name,
    status: policy.status, isActive: policy.isActive,
    effectiveFrom: policy.effectiveFrom, effectiveTo: policy.effectiveTo,
    updatedAt: policy.updatedAt,
  };
}
function confirmationToken({ organizationId, asOf, policies }) {
  const payload = JSON.stringify({
    organizationId, asOf: asOf.toISOString(),
    policies: policies.map(fingerprintPolicy).sort((a, b) => a.id.localeCompare(b.id)),
  });
  return crypto.createHash("sha256").update(payload).digest("hex");
}
function proposedState(policy) {
  if (policy.id === GOVERNING.id) {
    return { status: policy.status, isActive: policy.isActive, effectiveFrom: policy.effectiveFrom, effectiveTo: policy.effectiveTo };
  }
  if (policy.code === STANDARD_CODE) {
    return { status: "RETIRED", isActive: false, effectiveFrom: policy.effectiveFrom, effectiveTo: STANDARD_EFFECTIVE_TO };
  }
  if (policy.code === SENIOR_CODE) {
    return { status: "RETIRED", isActive: false, effectiveFrom: policy.effectiveFrom, effectiveTo: policy.effectiveTo };
  }
  throw new Error(`UNEXPECTED_POLICY: ${policy.id}`);
}
async function loadPolicies(client, { organizationId, standardPolicyId, seniorPolicyId }) {
  return client.leavePolicy.findMany({
    where: { organizationId, id: { in: [GOVERNING.id, standardPolicyId, seniorPolicyId] } },
    include: {
      leaveType: true,
      _count: { select: { requests: true, audits: true, entitlementAdjustments: true, entitlementAllocations: true, entitlementMatrixRules: true } },
    },
    orderBy: [{ code: "asc" }, { versionNumber: "desc" }],
  });
}
async function loadAnnualPolicyFamily(client, { organizationId, leaveTypeId }) {
  return client.leavePolicy.findMany({
    where: { organizationId, leaveTypeId },
    select: { id: true, status: true, isActive: true, effectiveFrom: true, effectiveTo: true },
  });
}
function validateAndResolve({ policies, organizationId, standardPolicyId, seniorPolicyId, asOf }) {
  if (new Set([GOVERNING.id, standardPolicyId, seniorPolicyId]).size !== 3) throw new Error("ANNUAL_POLICY_IDS_MUST_BE_DISTINCT");
  if (policies.length !== 3 || policies.some((policy) => policy.organizationId !== organizationId)) {
    throw new Error("EXACT_TENANT_ANNUAL_POLICY_SET_NOT_FOUND");
  }
  const governing = exactPolicy(policies, GOVERNING);
  const standard = exactPolicy(policies, { id: standardPolicyId, code: STANDARD_CODE });
  const senior = exactPolicy(policies, { id: seniorPolicyId, code: SENIOR_CODE });
  if (!isCurrent(governing, asOf)) throw new Error("GOVERNING_ANNUAL_POLICY_IS_NOT_CURRENT");
  if (policies.some((policy) => policy.leaveTypeId !== governing.leaveTypeId)) throw new Error("ANNUAL_POLICY_LEAVE_TYPE_MISMATCH");
  for (const policy of policies) {
    const next = proposedState(policy);
    if (!validInterval(next.effectiveFrom, next.effectiveTo)) throw new Error(`INVALID_EFFECTIVE_DATE_INTERVAL: ${policy.code}`);
  }
  return { governing, standard, senior };
}
function buildPreflight({ policies, annualPolicyFamily, organizationId, asOf, token }) {
  const changes = policies.map((policy) => {
    const next = proposedState(policy);
    return {
      policyId: policy.id, policyCode: policy.code, policyName: policy.name,
      versionNumber: policy.versionNumber, versionGroupId: policy.versionGroupId,
      before: { status: policy.status, isActive: policy.isActive, effectiveFrom: policy.effectiveFrom, effectiveTo: policy.effectiveTo, updatedAt: policy.updatedAt },
      after: next,
      intervalValid: validInterval(next.effectiveFrom, next.effectiveTo),
      action: policy.id === GOVERNING.id ? "UNCHANGED_GOVERNING_POLICY" : "RETIRE_FOR_NEW_REQUESTS_PRESERVE_HISTORY",
      preserved: {
        requests: policy._count.requests, audits: policy._count.audits,
        entitlementAdjustments: policy._count.entitlementAdjustments,
        entitlementAllocations: policy._count.entitlementAllocations,
        entitlementMatrixRules: policy._count.entitlementMatrixRules,
      },
    };
  });
  const proposedById = new Map(changes.map((item) => [item.policyId, item.after]));
  const currentAfter = annualPolicyFamily.filter((policy) => isCurrent(proposedById.get(policy.id) || policy, asOf));
  return {
    mode: "DRY_RUN_PREFLIGHT", organizationId, asOf, confirmationToken: token, changes,
    assertions: {
      governingCurrentAnnualPoliciesAfterProposedTransaction: currentAfter.length,
      invalidEffectiveDateIntervals: changes.filter((item) => !item.intervalValid).length,
      historicalRequestsPreserved: true, entitlementRecordsChanged: 0,
      leaveBalancesChanged: 0, leaveRequestsChanged: 0, recordsDeleted: 0,
    },
  };
}
async function applyNormalization({ organizationId, asOf, standardPolicyId, seniorPolicyId, expectedToken, actorUserId, reason }) {
  if (!expectedToken || !actorUserId || !reason) throw new Error("APPLY_REQUIRES_REVIEWED_TOKEN_ACTOR_AND_REASON");
  return prisma.$transaction(async (tx) => {
    const actor = await tx.user.findFirst({ where: { id: actorUserId, organizationId }, select: { id: true } });
    if (!actor) throw new Error("TENANT_ACTOR_NOT_FOUND");
    const policies = await loadPolicies(tx, { organizationId, standardPolicyId, seniorPolicyId });
    const { standard, senior } = validateAndResolve({ policies, organizationId, standardPolicyId, seniorPolicyId, asOf });
    const actualToken = confirmationToken({ organizationId, asOf, policies });
    if (actualToken !== expectedToken) throw new Error("POLICY_STATE_CHANGED_SINCE_REVIEWED_PREFLIGHT");
    const policyIds = policies.map((policy) => policy.id);
    const leaveTypeId = policies[0].leaveTypeId;
    const beforeStates = policies.map(reportPolicyState);
    const [requestCountBefore, balanceCountBefore, allocationCountBefore, adjustmentCountBefore, matrixCountBefore] = await Promise.all([
      tx.leaveRequest.count({ where: { organizationId, leavePolicyId: { in: policyIds } } }),
      tx.leaveBalance.count({ where: { organizationId, leaveTypeId } }),
      tx.leaveEntitlementAllocation.count({ where: { organizationId, leavePolicyId: { in: policyIds } } }),
      tx.leaveEntitlementAdjustment.count({ where: { organizationId, leavePolicyId: { in: policyIds } } }),
      tx.leaveEntitlementMatrixRule.count({ where: { organizationId, leavePolicyId: { in: policyIds } } }),
    ]);
    const changed = [];
    const auditEventIds = [];
    for (const policy of [standard, senior]) {
      const next = proposedState(policy);
      if (!validInterval(next.effectiveFrom, next.effectiveTo)) throw new Error(`INVALID_EFFECTIVE_DATE_INTERVAL: ${policy.code}`);
      const updated = await tx.leavePolicy.update({
        where: { organizationId_id: { organizationId, id: policy.id } },
        data: { status: next.status, isActive: next.isActive, effectiveTo: next.effectiveTo },
      });
      const audit = await tx.leavePolicyAudit.create({
        data: {
          organizationId, leavePolicyId: policy.id, actorUserId, action: "RETIRED",
          previousValue: { operation: "ANNUAL_POLICY_NORMALIZATION", policy: fingerprintPolicy(policy) },
          newValue: { operation: "ANNUAL_POLICY_NORMALIZATION", status: updated.status, isActive: updated.isActive, effectiveFrom: updated.effectiveFrom, effectiveTo: updated.effectiveTo },
          reason,
        },
      });
      changed.push(updated.id);
      auditEventIds.push(audit.id);
    }
    const after = await loadPolicies(tx, { organizationId, standardPolicyId, seniorPolicyId });
    const annualPolicyFamilyAfter = await loadAnnualPolicyFamily(tx, { organizationId, leaveTypeId: after[0].leaveTypeId });
    const currentAfter = annualPolicyFamilyAfter.filter((policy) => isCurrent(policy, asOf));
    const afterStates = after.map(reportPolicyState);
    const [requestCountAfter, balanceCountAfter, allocationCountAfter, adjustmentCountAfter, matrixCountAfter] = await Promise.all([
      tx.leaveRequest.count({ where: { organizationId, leavePolicyId: { in: policyIds } } }),
      tx.leaveBalance.count({ where: { organizationId, leaveTypeId } }),
      tx.leaveEntitlementAllocation.count({ where: { organizationId, leavePolicyId: { in: policyIds } } }),
      tx.leaveEntitlementAdjustment.count({ where: { organizationId, leavePolicyId: { in: policyIds } } }),
      tx.leaveEntitlementMatrixRule.count({ where: { organizationId, leavePolicyId: { in: policyIds } } }),
    ]);
    if (currentAfter.length !== 1 || currentAfter[0].id !== GOVERNING.id) throw new Error("NORMALIZATION_POSTCONDITION_FAILED");
    if (after.some((policy) => !validInterval(policy.effectiveFrom, policy.effectiveTo))) throw new Error("INVALID_EFFECTIVE_DATE_INTERVAL");
    if (requestCountAfter !== requestCountBefore || balanceCountAfter !== balanceCountBefore ||
      allocationCountAfter !== allocationCountBefore || adjustmentCountAfter !== adjustmentCountBefore ||
      matrixCountAfter !== matrixCountBefore) throw new Error("PRESERVATION_POSTCONDITION_FAILED");
    return {
      mode: "TRANSACTION_APPLIED", organizationId, asOf,
      changedPolicyIds: changed, auditEventIds,
      policies: { before: beforeStates, after: afterStates },
      governingCurrentAnnualPolicies: currentAfter.length, invalidEffectiveDateIntervals: 0,
      counts: {
        requests: { before: requestCountBefore, after: requestCountAfter, changed: requestCountAfter - requestCountBefore },
        balances: { before: balanceCountBefore, after: balanceCountAfter, changed: balanceCountAfter - balanceCountBefore },
        allocations: { before: allocationCountBefore, after: allocationCountAfter, changed: allocationCountAfter - allocationCountBefore },
        adjustments: { before: adjustmentCountBefore, after: adjustmentCountAfter, changed: adjustmentCountAfter - adjustmentCountBefore },
        matrixRules: { before: matrixCountBefore, after: matrixCountAfter, changed: matrixCountAfter - matrixCountBefore },
      },
      historicalRequestsPreserved: requestCountAfter === requestCountBefore,
      entitlementRecordsChanged: 0, leaveBalancesChanged: 0,
      leaveRequestsChanged: 0, recordsDeleted: 0,
    };
  }, { isolationLevel: "Serializable" });
}
async function main() {
  const organizationId = argument("--organization-id") || process.env.CHRIS_ORGANIZATION_ID;
  const asOf = new Date(argument("--as-of") || new Date());
  const standardPolicyId = argument("--standard-policy-id");
  const seniorPolicyId = argument("--senior-policy-id");
  if (!organizationId || !standardPolicyId || !seniorPolicyId) {
    throw new Error("Provide --organization-id, --standard-policy-id and --senior-policy-id. No tenant or competitor policy is selected implicitly.");
  }
  if (Number.isNaN(asOf.getTime())) throw new Error("INVALID_AS_OF_DATE");
  if (hasFlag("--apply")) {
    const result = await applyNormalization({
      organizationId, asOf, standardPolicyId, seniorPolicyId,
      expectedToken: argument("--confirmation-token"), actorUserId: argument("--actor-user-id"),
      reason: String(argument("--reason") || "").trim(),
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  const policies = await loadPolicies(prisma, { organizationId, standardPolicyId, seniorPolicyId });
  const { governing } = validateAndResolve({ policies, organizationId, standardPolicyId, seniorPolicyId, asOf });
  const annualPolicyFamily = await loadAnnualPolicyFamily(prisma, { organizationId, leaveTypeId: governing.leaveTypeId });
  const token = confirmationToken({ organizationId, asOf, policies });
  console.log(JSON.stringify(buildPreflight({ policies, annualPolicyFamily, organizationId, asOf, token }), null, 2));
  console.log("DRY RUN ONLY: no policy, request, balance or entitlement record was changed.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
