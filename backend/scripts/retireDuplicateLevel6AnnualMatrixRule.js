const crypto = require("crypto");
const prisma = require("../src/config/prisma");

const EXPECTED_ORGANIZATION_ID = "f50e3a3f-1153-48b6-88ba-a4ea5ef445fb";

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : null;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value.toJSON === "function") return stable(value.toJSON());
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function hash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function ruleState(rule) {
  return {
    id: rule.id,
    organizationId: rule.organizationId,
    levelNumber: rule.levelNumber,
    leavePolicyId: rule.leavePolicyId,
    leaveTypeId: rule.leaveTypeId,
    entitlement: Number(rule.defaultEntitlement),
    unit: rule.unit,
    effectiveFrom: rule.effectiveFrom.toISOString(),
    effectiveTo: rule.effectiveTo?.toISOString() || null,
    isActive: rule.isActive,
    updatedAt: rule.updatedAt.toISOString(),
  };
}

async function readCandidateState(tx, organizationId) {
  const rules = await tx.leaveEntitlementMatrixRule.findMany({
    where: {
      organizationId,
      levelNumber: 6,
      isActive: true,
      effectiveFrom: { lte: new Date() },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
      leaveType: { name: { equals: "Annual Leave", mode: "insensitive" } },
    },
    include: { leavePolicy: true, leaveType: true },
    orderBy: [{ defaultEntitlement: "asc" }, { id: "asc" }],
  });
  const states = rules.map(ruleState);
  const keep = rules.filter((rule) => Number(rule.defaultEntitlement) === 28);
  const retire = rules.filter((rule) => Number(rule.defaultEntitlement) === 30);
  if (rules.length !== 2 || keep.length !== 1 || retire.length !== 1) {
    throw new Error("EXPECTED_EXACTLY_ONE_CURRENT_28_AND_ONE_CURRENT_30_LEVEL_6_ANNUAL_RULE");
  }
  if (keep[0].leavePolicyId !== retire[0].leavePolicyId) {
    throw new Error("DUPLICATE_RULES_DO_NOT_REFERENCE_THE_SAME_POLICY");
  }
  return { rules, states, keep: keep[0], retire: retire[0], fingerprint: hash(states) };
}

async function preservationSnapshot(tx, organizationId) {
  const [balances, requests, allocations, employees] = await Promise.all([
    tx.leaveBalance.findMany({ where: { organizationId }, orderBy: { id: "asc" } }),
    tx.leaveRequest.findMany({ where: { organizationId }, orderBy: { id: "asc" } }),
    tx.leaveEntitlementAllocation.findMany({ where: { organizationId }, orderBy: { id: "asc" } }),
    tx.employee.findMany({ where: { organizationId }, select: { id: true, status: true, updatedAt: true }, orderBy: { id: "asc" } }),
  ]);
  return {
    balances: hash(balances),
    requests: hash(requests),
    allocations: hash(allocations),
    employeeStatuses: hash(employees),
    counts: { balances: balances.length, requests: requests.length, allocations: allocations.length, employees: employees.length },
  };
}

function tokenFor({ organizationId, actorUserId, fingerprint }) {
  return hash({ operation: "RETIRE_DUPLICATE_LEVEL_6_ANNUAL_30", organizationId, actorUserId, fingerprint });
}

async function main() {
  const organizationId = arg("organization-id");
  const actorUserId = arg("actor-user-id");
  const apply = process.argv.includes("--apply");
  const suppliedToken = arg("confirmation-token");
  if (organizationId !== EXPECTED_ORGANIZATION_ID) throw new Error("EXACT_ORGANIZATION_ID_REQUIRED");
  if (!actorUserId) throw new Error("ACTOR_USER_ID_REQUIRED");
  const actor = await prisma.user.findFirst({ where: { id: actorUserId, organizationId, isActive: true }, select: { id: true } });
  if (!actor) throw new Error("ACTIVE_TENANT_ACTOR_NOT_FOUND");

  if (!apply) {
    const state = await readCandidateState(prisma, organizationId);
    const preservation = await preservationSnapshot(prisma, organizationId);
    console.log(JSON.stringify({
      mode: "DRY_RUN_PREFLIGHT",
      organizationId,
      actorUserId,
      confirmationToken: tokenFor({ organizationId, actorUserId, fingerprint: state.fingerprint }),
      fingerprint: state.fingerprint,
      before: state.states,
      proposedAfter: state.states.map((row) => row.id === state.retire.id ? { ...row, isActive: false } : row),
      assertions: {
        governingCurrentLevel6AnnualRulesAfter: 1,
        governingEntitlementAfter: 28,
        balancesUnchanged: true,
        requestsUnchanged: true,
        allocationsUnchanged: true,
        employeeStatusesUnchanged: true,
        baselineReconciliationWillRun: false,
      },
      preservation,
    }, null, 2));
    return;
  }

  if (!suppliedToken) throw new Error("CONFIRMATION_TOKEN_REQUIRED");
  const report = await prisma.$transaction(async (tx) => {
    const beforeState = await readCandidateState(tx, organizationId);
    const expectedToken = tokenFor({ organizationId, actorUserId, fingerprint: beforeState.fingerprint });
    if (suppliedToken !== expectedToken) throw new Error("STALE_OR_INVALID_CONFIRMATION_TOKEN");
    const beforePreservation = await preservationSnapshot(tx, organizationId);
    const retired = await tx.leaveEntitlementMatrixRule.update({ where: { id: beforeState.retire.id }, data: { isActive: false } });
    const audit = await tx.leavePolicyAudit.create({ data: {
      organizationId,
      leavePolicyId: beforeState.retire.leavePolicyId,
      actorUserId,
      action: "ENTITLEMENT_CHANGED",
      previousValue: { operation: "RETIRE_DUPLICATE_MATRIX_RULE", rule: ruleState(beforeState.retire) },
      newValue: { operation: "RETIRE_DUPLICATE_MATRIX_RULE", rule: ruleState(retired) },
      reason: "Retire redundant current Level 6 Annual 30-day matrix rule; retain CHRIS 28-day recommendation",
    } });
    const current = await tx.leaveEntitlementMatrixRule.findMany({
      where: { organizationId, levelNumber: 6, leavePolicyId: beforeState.keep.leavePolicyId, isActive: true, effectiveFrom: { lte: new Date() }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }] },
    });
    if (current.length !== 1 || Number(current[0].defaultEntitlement) !== 28) throw new Error("POST_WRITE_CURRENT_RULE_VERIFICATION_FAILED");
    const afterPreservation = await preservationSnapshot(tx, organizationId);
    for (const key of ["balances", "requests", "allocations", "employeeStatuses"]) {
      if (beforePreservation[key] !== afterPreservation[key]) throw new Error(`PRESERVATION_CHECK_FAILED:${key}`);
    }
    return { before: beforeState.states, after: [ruleState(current[0]), ruleState(retired)], auditEventId: audit.id, preservation: afterPreservation };
  }, { isolationLevel: "Serializable" });
  console.log(JSON.stringify({ mode: "APPLIED", organizationId, actorUserId, ...report }, null, 2));
}

main().catch((error) => { console.error(JSON.stringify({ mode: "FAILED", error: error.message }, null, 2)); process.exitCode = 1; }).finally(() => prisma.$disconnect());
