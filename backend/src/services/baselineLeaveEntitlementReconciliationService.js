const crypto = require("crypto");
const prisma = require("../config/prisma");
const { buildProvisioningPreview } = require("./leaveEntitlementProvisioningService");

const CORPORATEHR_NETWORK_ORGANIZATION_ID = "f50e3a3f-1153-48b6-88ba-a4ea5ef445fb";
const BASELINE_KEYS = new Set(["ANNUAL", "SICK", "UNPAID"]);

function baselineKey(policy) {
  const value = `${policy?.leaveType?.code || ""} ${policy?.leaveType?.name || ""}`.toUpperCase();
  if (value.includes("ANNUAL")) return "ANNUAL";
  if (value.includes("SICK")) return "SICK";
  if (value.includes("UNPAID")) return "UNPAID";
  return null;
}

function number(value) { return Number(value || 0); }
function normalized(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalized);
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = normalized(value[key]);
      return result;
    }, {});
  }
  if (typeof value === "bigint") return value.toString();
  return value;
}
function tokenFor(snapshot) {
  return crypto.createHash("sha256").update(JSON.stringify(normalized(snapshot))).digest("hex");
}
function fingerprint(value) { return tokenFor(value); }
function projectedAvailable({ entitlement, balance, pending }) {
  return number(entitlement) + number(balance?.accrued) + number(balance?.carriedForward) +
    number(balance?.adjusted) - number(balance?.used) - number(pending);
}

async function buildBaselineReconciliationDryRun({
  organizationId, leaveYear, actorUserId, tx = prisma,
}) {
  const year = Number(leaveYear);
  if (organizationId !== CORPORATEHR_NETWORK_ORGANIZATION_ID) throw new Error("EXACT_ORGANIZATION_ID_REQUIRED");
  if (year !== 2026) throw new Error("EXACT_LEAVE_YEAR_2026_REQUIRED");
  if (!actorUserId) throw new Error("ACTOR_USER_ID_REQUIRED");
  const actor = await tx.user.findFirst({
    where: { id: actorUserId, organizationId },
    select: { id: true, organizationId: true, email: true, updatedAt: true },
  });
  if (!actor) throw new Error("TENANT_ACTOR_NOT_FOUND");

  const preview = await buildProvisioningPreview({
    organizationId, leaveYear: year, baselineOnly: true, rebaseExisting: true, tx,
  });
  const policies = preview.policies.filter((policy) => BASELINE_KEYS.has(baselineKey(policy)));
  for (const key of BASELINE_KEYS) {
    if (policies.filter((policy) => baselineKey(policy) === key).length !== 1) {
      throw new Error(`EXACTLY_ONE_CURRENT_BASELINE_POLICY_REQUIRED: ${key}`);
    }
  }
  const policyIds = policies.map((policy) => policy.id);
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const nextYearStart = new Date(Date.UTC(year + 1, 0, 1));

  const [allocations, requests, adjustments, matrixRules, optionalPolicies] = await Promise.all([
    tx.leaveEntitlementAllocation.findMany({
      where: { organizationId, leaveYear: year, leavePolicyId: { in: policyIds } },
      orderBy: [{ employeeId: "asc" }, { leavePolicyId: "asc" }, { effectiveDate: "desc" }, { createdAt: "desc" }],
    }),
    tx.leaveRequest.findMany({
      where: { organizationId, leavePolicyId: { in: policyIds } },
      select: {
        id: true, employeeId: true, leavePolicyId: true, leaveTypeId: true, status: true,
        requestedUnits: true, startDate: true, endDate: true, submittedAt: true,
        reviewedAt: true, cancelledAt: true, commencedAt: true, returnedAt: true, updatedAt: true,
      },
      orderBy: { id: "asc" },
    }),
    tx.leaveEntitlementAdjustment.findMany({
      where: { organizationId, leaveYear: year, leavePolicyId: { in: policyIds } },
      orderBy: { id: "asc" },
    }),
    tx.leaveEntitlementMatrixRule.findMany({
      where: {
        organizationId, leavePolicyId: { in: policyIds }, isActive: true,
        effectiveFrom: { lt: nextYearStart }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: yearStart } }],
      },
      orderBy: [{ leavePolicyId: "asc" }, { levelNumber: "asc" }, { effectiveFrom: "asc" }],
    }),
    tx.leavePolicy.findMany({
      where: { organizationId, id: { notIn: policyIds } },
      select: { id: true, code: true, status: true, isActive: true, effectiveFrom: true, effectiveTo: true, updatedAt: true },
      orderBy: { id: "asc" },
    }),
  ]);
  const latestAllocation = new Map();
  for (const allocation of allocations) {
    const key = `${allocation.employeeId}:${allocation.leavePolicyId}`;
    if (!latestAllocation.has(key)) latestAllocation.set(key, allocation);
  }

  const rows = preview.rows.map((row) => {
    const balance = row.existingBalance;
    const allocation = latestAllocation.get(`${row.employeeId}:${row.policyId}`) || null;
    const beforeEntitlement = balance == null ? null : number(balance.openingBalance);
    const afterEntitlement = row.proposedOpeningBalance == null ? null : number(row.proposedOpeningBalance);
    const allocationMatches = allocation && number(allocation.allocatedEntitlement) === afterEntitlement &&
      allocation.levelNumber === row.employmentLevel?.levelNumber;
    let action = "NO_CHANGE";
    if (row.status === "READY") action = "CREATE_ENTITLEMENT_AND_ALLOCATION";
    else if (row.status === "REBASE_READY" && beforeEntitlement !== afterEntitlement) action = "REBASE_AND_ALLOCATE";
    else if (row.status === "REBASE_READY" && !allocationMatches) action = "CREATE_MISSING_ALLOCATION";
    return {
      employeeId: row.employeeId, employeeNumber: row.employeeNumber, employeeName: row.employeeName,
      employeeStatus: preview.employees.find((employee) => employee.id === row.employeeId)?.status,
      designation: row.designation?.name || null,
      careerLevel: row.employmentLevel?.levelNumber || null,
      policyId: row.policyId, policyCode: row.policyCode, policyName: row.policyName,
      leaveTypeId: row.leaveTypeId, leaveType: row.leaveType?.name, leaveYear: year,
      previewStatus: row.status, action, source: row.matrixSource,
      before: {
        balanceId: balance?.id || null, entitlement: beforeEntitlement,
        used: number(balance?.used), pending: number(row.retainedPending),
        accrued: number(balance?.accrued), carryover: number(balance?.carriedForward),
        adjustments: number(balance?.adjusted),
        available: balance == null ? null : projectedAvailable({ entitlement: beforeEntitlement, balance, pending: row.retainedPending }),
        latestAllocationId: allocation?.id || null,
        latestAllocatedEntitlement: allocation ? number(allocation.allocatedEntitlement) : null,
      },
      after: {
        entitlement: afterEntitlement, used: number(balance?.used), pending: number(row.retainedPending),
        accrued: number(balance?.accrued), carryover: number(balance?.carriedForward),
        adjustments: number(balance?.adjusted),
        available: afterEntitlement == null ? null : projectedAvailable({ entitlement: afterEntitlement, balance, pending: row.retainedPending }),
      },
      exceptionCodes: row.exceptionCodes || [], message: row.message,
    };
  });
  const blockingStatuses = new Set([
    "POLICY_CONFLICT", "ENTITLEMENT_DEFICIT_REVIEW_REQUIRED", "ENTITLEMENT_MATRIX_REQUIRED",
    "EMPLOYMENT_LEVEL_MAPPING_REQUIRED", "MANUAL_ALLOCATION_REQUIRED",
  ]);
  const blockers = rows.filter((row) => blockingStatuses.has(row.previewStatus));
  const affectedRows = rows.filter((row) => row.action !== "NO_CHANGE" && !blockingStatuses.has(row.previewStatus));
  const balances = preview.rows.filter((row) => row.existingBalance).map((row) => row.existingBalance)
    .filter((balance, index, values) => values.findIndex((candidate) => candidate.id === balance.id) === index)
    .sort((a, b) => a.id.localeCompare(b.id));
  const employeeSnapshot = preview.employees.map((employee) => ({
    id: employee.id, employeeNumber: employee.employeeNumber, status: employee.status,
    designationId: employee.designationId, updatedAt: employee.updatedAt,
    careerLevel: employee.designation?.careerLevel,
  })).sort((a, b) => a.id.localeCompare(b.id));
  const snapshot = {
    organizationId, leaveYear: year, actor,
    policies: policies.map((policy) => ({
      id: policy.id, code: policy.code, leaveTypeId: policy.leaveTypeId, status: policy.status,
      isActive: policy.isActive, effectiveFrom: policy.effectiveFrom, effectiveTo: policy.effectiveTo,
      versionNumber: policy.versionNumber, updatedAt: policy.updatedAt,
    })).sort((a, b) => a.id.localeCompare(b.id)),
    employees: employeeSnapshot, balances, requests, allocations, adjustments, matrixRules, optionalPolicies,
    affectedRows: affectedRows.map((row) => ({
      employeeId: row.employeeId, policyId: row.policyId, leaveTypeId: row.leaveTypeId,
      action: row.action, before: row.before, after: row.after, careerLevel: row.careerLevel, source: row.source,
    })),
  };
  const affectedEmployeePolicyFingerprints = affectedRows.map((row) => ({
    employeeId: row.employeeId, employeeNumber: row.employeeNumber,
    policyId: row.policyId, policyCode: row.policyCode, leaveTypeId: row.leaveTypeId,
    action: row.action,
    employeeFingerprint: fingerprint({
      organizationId, employeeId: row.employeeId, employeeNumber: row.employeeNumber,
      employeeStatus: row.employeeStatus, designation: row.designation, careerLevel: row.careerLevel,
    }),
    policyFingerprint: fingerprint({
      organizationId, policyId: row.policyId, policyCode: row.policyCode,
      policyName: row.policyName, leaveTypeId: row.leaveTypeId, leaveYear: year,
    }),
    balanceFingerprint: fingerprint({
      organizationId, leaveYear: year, employeeId: row.employeeId,
      leaveTypeId: row.leaveTypeId, balance: row.before,
    }),
    allocationFingerprint: fingerprint({
      organizationId, leaveYear: year, employeeId: row.employeeId,
      policyId: row.policyId, latestAllocationId: row.before.latestAllocationId,
      latestAllocatedEntitlement: row.before.latestAllocatedEntitlement,
    }),
    affectedRecordFingerprint: fingerprint({
      organizationId, leaveYear: year, actorUserId: actor.id,
      employeeId: row.employeeId, employeeNumber: row.employeeNumber,
      employeeStatus: row.employeeStatus, designation: row.designation, careerLevel: row.careerLevel,
      policyId: row.policyId, policyCode: row.policyCode, leaveTypeId: row.leaveTypeId,
      previewStatus: row.previewStatus, action: row.action, source: row.source,
      before: row.before, after: row.after,
    }),
  }));
  const actionCounts = {
    CREATE_ENTITLEMENT_AND_ALLOCATION: affectedRows.filter((row) => row.action === "CREATE_ENTITLEMENT_AND_ALLOCATION").length,
    REBASE_AND_ALLOCATE: affectedRows.filter((row) => row.action === "REBASE_AND_ALLOCATE").length,
    CREATE_MISSING_ALLOCATION: affectedRows.filter((row) => row.action === "CREATE_MISSING_ALLOCATION").length,
    SKIPPED: rows.filter((row) => row.action === "NO_CHANGE").length,
    BLOCKED: blockers.length,
  };
  const assertions = {
    policyConflicts: preview.summary.conflicts,
    entitlementDeficits: preview.summary.deficits,
    employeeExceptions: preview.summary.exceptions,
    usedValuesUnchanged: true,
    pendingValuesUnchanged: true,
    employeeStatusesUnchanged: true,
    leaveRequestsUnchanged: true,
    optionalPoliciesUnchanged: true,
  };
  return {
    mode: "DRY_RUN_PREFLIGHT", organizationId, leaveYear: year, actorUserId: actor.id,
    confirmationToken: blockers.length ? null : tokenFor(snapshot),
    readyForApply: blockers.length === 0,
    fingerprints: {
      affectedEmployeePolicies: affectedEmployeePolicyFingerprints,
      affectedEmployeePolicyCount: affectedEmployeePolicyFingerprints.length,
    },
    actionCounts,
    assertions,
    actor,
    baselinePolicies: policies.map((policy) => ({ id: policy.id, code: policy.code, name: policy.name, leaveType: policy.leaveType?.name })),
    summary: {
      employees: preview.employees.length, rows: rows.length, affectedRows: affectedRows.length,
      rebaseAndAllocate: affectedRows.filter((row) => row.action === "REBASE_AND_ALLOCATE").length,
      createEntitlementAndAllocation: affectedRows.filter((row) => row.action === "CREATE_ENTITLEMENT_AND_ALLOCATION").length,
      createMissingAllocation: affectedRows.filter((row) => row.action === "CREATE_MISSING_ALLOCATION").length,
      noChange: rows.filter((row) => row.action === "NO_CHANGE").length,
      blockers: blockers.length, optionalPoliciesFingerprinted: optionalPolicies.length,
      leaveRequestsFingerprinted: requests.length, existingAllocationsFingerprinted: allocations.length,
    },
    preservationAssertions: {
      policyConflicts: preview.summary.conflicts,
      entitlementDeficits: preview.summary.deficits,
      employeeExceptions: preview.summary.exceptions,
      leaveRequestsWillChange: 0, usedAmountsWillChange: 0, pendingAmountsWillChange: 0,
      employeeStatusesWillChange: 0, optionalPoliciesWillChange: 0, recordsWillBeDeleted: 0,
      employeeEntitlementReconciliationApplied: false,
    },
    blockers, rows,
  };
}

async function loadPreservationState(tx, { organizationId, leaveYear, rows, policyIds }) {
  const employeeIds = [...new Set(rows.map((row) => row.employeeId))];
  const leaveTypeIds = [...new Set(rows.map((row) => row.leaveTypeId))];
  const yearStart = new Date(Date.UTC(leaveYear, 0, 1));
  const nextYearStart = new Date(Date.UTC(leaveYear + 1, 0, 1));
  const [requests, employees, usedBalances, optionalPolicies, adjustments, matrixRules, allocationCount] = await Promise.all([
    tx.leaveRequest.findMany({
      where: { organizationId, leavePolicyId: { in: policyIds } },
      select: { id: true, employeeId: true, leavePolicyId: true, status: true, requestedUnits: true, startDate: true, endDate: true, updatedAt: true },
      orderBy: { id: "asc" },
    }),
    tx.employee.findMany({
      where: { organizationId, id: { in: employeeIds } },
      select: { id: true, employeeNumber: true, status: true, designationId: true, updatedAt: true },
      orderBy: { id: "asc" },
    }),
    tx.leaveBalance.findMany({
      where: { organizationId, leaveYear, employeeId: { in: employeeIds }, leaveTypeId: { in: leaveTypeIds } },
      select: { id: true, employeeId: true, leaveTypeId: true, used: true, accrued: true, carriedForward: true, adjusted: true },
      orderBy: { id: "asc" },
    }),
    tx.leavePolicy.findMany({
      where: { organizationId, id: { notIn: policyIds } },
      select: { id: true, code: true, status: true, isActive: true, effectiveFrom: true, effectiveTo: true, updatedAt: true },
      orderBy: { id: "asc" },
    }),
    tx.leaveEntitlementAdjustment.findMany({
      where: { organizationId, leaveYear, leavePolicyId: { in: policyIds } },
      orderBy: { id: "asc" },
    }),
    tx.leaveEntitlementMatrixRule.findMany({
      where: { organizationId, leavePolicyId: { in: policyIds } },
      orderBy: { id: "asc" },
    }),
    tx.leaveEntitlementAllocation.count({ where: { organizationId, leaveYear, leavePolicyId: { in: policyIds } } }),
  ]);
  const pending = requests.filter((request) => request.status === "PENDING" && request.startDate >= yearStart && request.startDate < nextYearStart)
    .reduce((values, request) => {
      const key = `${request.employeeId}:${request.leavePolicyId}`;
      values[key] = number(values[key]) + number(request.requestedUnits);
      return values;
    }, {});
  return {
    hashes: {
      requests: fingerprint(requests), employees: fingerprint(employees),
      pending: fingerprint(pending),
      optionalPolicies: fingerprint(optionalPolicies), adjustments: fingerprint(adjustments),
      matrixRules: fingerprint(matrixRules),
    },
    usedBalances,
    counts: { requests: requests.length, employees: employees.length, usedBalances: usedBalances.length, allocationCount },
  };
}

function assertPreserved(before, after) {
  for (const key of ["requests", "employees", "pending", "optionalPolicies", "adjustments", "matrixRules"]) {
    if (before.hashes[key] !== after.hashes[key]) throw new Error(`PRESERVATION_CHECK_FAILED: ${key}`);
  }
  const afterById = new Map(after.usedBalances.map((balance) => [balance.id, balance]));
  const beforeIds = new Set(before.usedBalances.map((balance) => balance.id));
  for (const existing of before.usedBalances) {
    const current = afterById.get(existing.id);
    if (!current || current.employeeId !== existing.employeeId || current.leaveTypeId !== existing.leaveTypeId ||
      number(current.used) !== number(existing.used) || number(current.accrued) !== number(existing.accrued) ||
      number(current.carriedForward) !== number(existing.carriedForward) || number(current.adjusted) !== number(existing.adjusted)) {
      throw new Error("PRESERVATION_CHECK_FAILED: usedBalances");
    }
  }
  for (const created of after.usedBalances.filter((balance) => !beforeIds.has(balance.id))) {
    if (number(created.used) !== 0) throw new Error("PRESERVATION_CHECK_FAILED: usedBalances");
  }
}

async function applyBaselineReconciliation({ organizationId, leaveYear, actorUserId, confirmationToken, reason }) {
  if (!confirmationToken) throw new Error("CONFIRMATION_TOKEN_REQUIRED");
  const explanation = String(reason || "").trim();
  if (!explanation) throw new Error("RECONCILIATION_REASON_REQUIRED");
  return prisma.$transaction(async (tx) => {
    const dryRun = await buildBaselineReconciliationDryRun({ organizationId, leaveYear, actorUserId, tx });
    if (!dryRun.readyForApply || !dryRun.confirmationToken) throw new Error("RECONCILIATION_PREFLIGHT_BLOCKED");
    if (dryRun.confirmationToken !== confirmationToken) throw new Error("RECONCILIATION_STATE_CHANGED_SINCE_DRY_RUN");
    if (dryRun.preservationAssertions.policyConflicts !== 0 || dryRun.preservationAssertions.entitlementDeficits !== 0 ||
      dryRun.preservationAssertions.employeeExceptions !== 0) throw new Error("RECONCILIATION_PREFLIGHT_ASSERTION_FAILED");

    const affectedRows = dryRun.rows.filter((row) => [
      "CREATE_ENTITLEMENT_AND_ALLOCATION", "REBASE_AND_ALLOCATE", "CREATE_MISSING_ALLOCATION",
    ].includes(row.action));
    const policyIds = dryRun.baselinePolicies.map((policy) => policy.id);
    const before = await loadPreservationState(tx, { organizationId, leaveYear, rows: dryRun.rows, policyIds });
    const allocations = [];
    for (const row of affectedRows) {
      let balance;
      if (row.action === "CREATE_ENTITLEMENT_AND_ALLOCATION") {
        balance = await tx.leaveBalance.create({
          data: { organizationId, employeeId: row.employeeId, leaveTypeId: row.leaveTypeId, leaveYear, openingBalance: row.after.entitlement },
        });
      } else if (row.action === "REBASE_AND_ALLOCATE") {
        const updated = await tx.leaveBalance.updateMany({
          where: { id: row.before.balanceId, organizationId, employeeId: row.employeeId, leaveTypeId: row.leaveTypeId, leaveYear },
          data: { openingBalance: row.after.entitlement },
        });
        if (updated.count !== 1) throw new Error(`AUTHORITATIVE_BALANCE_CHANGED: ${row.employeeNumber}:${row.policyCode}`);
        balance = await tx.leaveBalance.findFirst({ where: { id: row.before.balanceId, organizationId } });
      } else {
        balance = await tx.leaveBalance.findFirst({ where: { id: row.before.balanceId, organizationId, employeeId: row.employeeId, leaveTypeId: row.leaveTypeId, leaveYear } });
        if (!balance) throw new Error(`AUTHORITATIVE_BALANCE_NOT_FOUND: ${row.employeeNumber}:${row.policyCode}`);
      }
      const allocation = await tx.leaveEntitlementAllocation.create({
        data: {
          organizationId, employeeId: row.employeeId, leaveBalanceId: balance.id,
          leavePolicyId: row.policyId, leaveTypeId: row.leaveTypeId,
          levelNumber: row.careerLevel, leaveYear,
          baseEntitlement: row.after.entitlement, allocatedEntitlement: row.after.entitlement,
          method: "BASELINE_REPROVISION", effectiveDate: new Date(),
          reason: `[${row.source || "TENANT_CONFIGURED"}] ${explanation}`, createdByUserId: actorUserId,
        },
      });
      allocations.push({ id: allocation.id, employeeId: row.employeeId, employeeNumber: row.employeeNumber, policyId: row.policyId, policyCode: row.policyCode, action: row.action, before: row.before.entitlement, after: row.after.entitlement });
    }
    const auditEventIds = [];
    for (const policy of dryRun.baselinePolicies) {
      const policyRows = allocations.filter((allocation) => allocation.policyId === policy.id);
      if (!policyRows.length) continue;
      const audit = await tx.leavePolicyAudit.create({
        data: {
          organizationId, leavePolicyId: policy.id, actorUserId, action: "ENTITLEMENT_CHANGED",
          previousValue: { operation: "2026_BASELINE_ENTITLEMENT_RECONCILIATION", rows: policyRows.map((row) => ({ employeeId: row.employeeId, employeeNumber: row.employeeNumber, entitlement: row.before })) },
          newValue: { operation: "2026_BASELINE_ENTITLEMENT_RECONCILIATION", leaveYear, source: "DESIGNATION_CAREER_LEVEL_MATRIX", rows: policyRows.map((row) => ({ employeeId: row.employeeId, employeeNumber: row.employeeNumber, entitlement: row.after, allocationId: row.id, action: row.action })) },
          reason: explanation,
        },
      });
      auditEventIds.push(audit.id);
    }
    const after = await loadPreservationState(tx, { organizationId, leaveYear, rows: dryRun.rows, policyIds });
    assertPreserved(before, after);
    if (after.counts.allocationCount - before.counts.allocationCount !== affectedRows.length) throw new Error("ALLOCATION_COUNT_POSTCONDITION_FAILED");

    const verification = [];
    for (const row of affectedRows) {
      const balance = await tx.leaveBalance.findUnique({
        where: { organizationId_employeeId_leaveTypeId_leaveYear: { organizationId, employeeId: row.employeeId, leaveTypeId: row.leaveTypeId, leaveYear } },
      });
      const available = projectedAvailable({ entitlement: balance.openingBalance, balance, pending: row.after.pending });
      if (number(balance.used) !== row.before.used || row.after.pending !== row.before.pending || available !== row.after.available) {
        throw new Error(`AUTHORITATIVE_BALANCE_POSTCONDITION_FAILED: ${row.employeeNumber}:${row.policyCode}`);
      }
      verification.push({ employeeNumber: row.employeeNumber, policyCode: row.policyCode, entitlement: number(balance.openingBalance), used: number(balance.used), pending: row.after.pending, available });
    }
    return {
      mode: "APPLIED", organizationId, leaveYear, actorUserId, confirmationToken,
      actionCounts: dryRun.actionCounts, allocationsCreated: allocations,
      auditEventIds, preservation: { before: before.counts, after: after.counts, hashesUnchanged: true },
      verification, recordsDeleted: 0, optionalPoliciesChanged: 0,
      leaveRequestsChanged: 0, usedValuesChanged: 0, pendingValuesChanged: 0, employeeStatusesChanged: 0,
    };
  }, { isolationLevel: "Serializable" });
}

module.exports = {
  CORPORATEHR_NETWORK_ORGANIZATION_ID,
  buildBaselineReconciliationDryRun,
  applyBaselineReconciliation,
  assertPreserved,
};
