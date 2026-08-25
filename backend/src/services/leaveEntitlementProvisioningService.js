const prisma = require("../config/prisma");
const { ensureEmploymentLevels } = require("./designationEmploymentLevelService");

const CURRENT_EMPLOYEE_STATUSES = ["ACTIVE", "PROBATION", "LEAVE"];
const BASELINE_CODES = new Set(["ANNUAL", "SICK", "UNPAID"]);
const ANNUAL_BY_LEVEL = new Map([[1, 14], [2, 16], [3, 18], [4, 21], [5, 24], [6, 28]]);

function validYear(value) {
  const year = Number(value || new Date().getFullYear());
  if (!Number.isInteger(year) || year < 2000 || year > 2200) throw new Error("INVALID_LEAVE_YEAR");
  return year;
}
function normalizedList(value) {
  return Array.isArray(value) ? [...new Set(value.map(String).map((item) => item.trim()).filter(Boolean))] : [];
}
function typeKey(policy) {
  const value = `${policy?.leaveType?.code || ""} ${policy?.leaveType?.name || ""}`.toUpperCase();
  if (value.includes("ANNUAL")) return "ANNUAL";
  if (value.includes("SICK")) return "SICK";
  if (value.includes("UNPAID")) return "UNPAID";
  return policy?.leaveType?.code || policy?.leaveTypeId;
}

function explicitlyAppliesToEmployee({ policy, employee, allocatedPolicyIds }) {
  const eligibility = policy?.eligibilityRules && typeof policy.eligibilityRules === "object"
    ? policy.eligibilityRules
    : {};
  const employeeNumbers = Array.isArray(eligibility.employeeNumbers) ? eligibility.employeeNumbers.map(String) : [];
  const employeeIds = Array.isArray(eligibility.employeeIds) ? eligibility.employeeIds.map(String) : [];
  return eligibility.requiredForAll === true ||
    employeeNumbers.includes(String(employee.employeeNumber)) ||
    employeeIds.includes(String(employee.id)) ||
    allocatedPolicyIds.has(`${employee.id}:${policy.id}`);
}

function proratedEntitlement({ entitlement, hireDate, leaveYear }) {
  const start = new Date(Date.UTC(leaveYear, 0, 1));
  const end = new Date(Date.UTC(leaveYear + 1, 0, 1));
  const eligibleFrom = hireDate && new Date(hireDate) > start ? new Date(hireDate) : start;
  if (eligibleFrom >= end) return 0;
  const fraction = (end - eligibleFrom) / (end - start);
  return Math.round(Number(entitlement) * fraction * 2) / 2;
}

async function ensureEntitlementMatrixDefaults({ organizationId, actorUserId, tx = prisma }) {
  const levels = await ensureEmploymentLevels({ organizationId, tx });
  const policies = await tx.leavePolicy.findMany({
    where: { organizationId, status: "ACTIVE", isActive: true },
    include: { leaveType: true },
    orderBy: [{ versionNumber: "desc" }, { effectiveFrom: "desc" }],
  });
  const baseline = [];
  for (const key of BASELINE_CODES) {
    const policy = policies.find((candidate) => typeKey(candidate) === key);
    if (policy) baseline.push({ key, policy });
  }
  const effectiveFrom = new Date(Date.UTC(2000, 0, 1));
  for (const level of levels) {
    for (const { key, policy } of baseline) {
      const defaultEntitlement = key === "ANNUAL"
        ? ANNUAL_BY_LEVEL.get(level.levelNumber) ?? Number(policy.entitlementDays)
        : key === "SICK" ? 12 : 5;
      await tx.leaveEntitlementMatrixRule.upsert({
        where: { organizationId_levelNumber_leavePolicyId_effectiveFrom: {
          organizationId, levelNumber: level.levelNumber, leavePolicyId: policy.id, effectiveFrom,
        } },
        update: {},
        create: {
          organizationId, levelNumber: level.levelNumber, leavePolicyId: policy.id,
          leaveTypeId: policy.leaveTypeId, defaultEntitlement,
          unit: policy.entitlementRules?.unit || "WORKING_DAYS",
          newHireTreatment: "FULL", effectiveFrom, createdByUserId: actorUserId || null,
        },
      });
    }
  }
  return { levels, baselinePolicies: baseline.map((item) => item.policy) };
}

async function listEntitlementMatrix({ organizationId }) {
  // Reads are intentionally side-effect free. Defaults are created only by an
  // explicit provisioning/configuration command, never while opening this page.
  const now = new Date();
  return prisma.leaveEntitlementMatrixRule.findMany({
    where: { organizationId, isActive: true, effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }] },
    include: { employmentLevel: true, leavePolicy: true, leaveType: true },
    orderBy: [{ levelNumber: "asc" }, { leaveType: { name: "asc" } }],
  });
}

async function saveEntitlementMatrixRule({ organizationId, actorUserId, input }) {
  const levelNumber = Number(input?.levelNumber);
  const entitlement = Number(input?.defaultEntitlement);
  const effectiveFrom = new Date(input?.effectiveFrom || Date.UTC(new Date().getFullYear(), 0, 1));
  if (!Number.isInteger(levelNumber) || levelNumber < 1) throw new Error("INVALID_EMPLOYMENT_LEVEL");
  if (!Number.isFinite(entitlement) || entitlement < 0) throw new Error("INVALID_ENTITLEMENT");
  if (Number.isNaN(effectiveFrom.getTime())) throw new Error("INVALID_POLICY_DATES");
  const policy = await prisma.leavePolicy.findFirst({
    where: { id: input?.leavePolicyId, organizationId, status: "ACTIVE", isActive: true },
    include: { leaveType: true },
  });
  if (!policy) throw new Error("TENANT_ACTIVE_LEAVE_POLICY_NOT_FOUND");
  return prisma.$transaction(async (tx) => {
    const existing = await tx.leaveEntitlementMatrixRule.findUnique({
      where: { organizationId_levelNumber_leavePolicyId_effectiveFrom: {
        organizationId, levelNumber, leavePolicyId: policy.id, effectiveFrom,
      } },
    });
    let supersededBefore = null;
    if (input?.isActive !== false && !existing) {
      const overlappingRules = await tx.leaveEntitlementMatrixRule.findMany({
        where: {
          organizationId, levelNumber, leavePolicyId: policy.id, isActive: true,
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveFrom } }],
        },
        orderBy: { effectiveFrom: "desc" },
      });
      if (overlappingRules.length > 1) throw new Error("ACTIVE_ENTITLEMENT_MATRIX_RULE_EXISTS");
      if (overlappingRules.length === 1) {
        supersededBefore = overlappingRules[0];
        if (effectiveFrom <= supersededBefore.effectiveFrom) throw new Error("INVALID_ENTITLEMENT_EFFECTIVE_DATE_SEQUENCE");
        await tx.leaveEntitlementMatrixRule.update({
          where: { id: supersededBefore.id },
          data: { effectiveTo: new Date(effectiveFrom.getTime() - 1) },
        });
      }
    }
    const rule = await tx.leaveEntitlementMatrixRule.upsert({
      where: { organizationId_levelNumber_leavePolicyId_effectiveFrom: {
        organizationId, levelNumber, leavePolicyId: policy.id, effectiveFrom,
      } },
      update: {
        defaultEntitlement: entitlement, unit: input?.unit || policy.entitlementRules?.unit || "WORKING_DAYS",
        newHireTreatment: input?.newHireTreatment || "FULL", isActive: input?.isActive !== false,
      },
      create: {
        organizationId, levelNumber, leavePolicyId: policy.id, leaveTypeId: policy.leaveTypeId,
        defaultEntitlement: entitlement, unit: input?.unit || policy.entitlementRules?.unit || "WORKING_DAYS",
        newHireTreatment: input?.newHireTreatment || "FULL", effectiveFrom,
        isActive: input?.isActive !== false, createdByUserId: actorUserId || null,
      },
    });
    await tx.leavePolicyAudit.create({
      data: {
        organizationId,
        leavePolicyId: policy.id,
        actorUserId: actorUserId || null,
        action: "ENTITLEMENT_CHANGED",
        previousValue: existing
          ? { operation: "ENTITLEMENT_MATRIX_CONFIGURATION", rule: existing }
          : { operation: "ENTITLEMENT_MATRIX_EFFECTIVE_DATED_CHANGE", supersededRule: supersededBefore },
        newValue: { operation: supersededBefore ? "ENTITLEMENT_MATRIX_EFFECTIVE_DATED_CHANGE" : "ENTITLEMENT_MATRIX_CONFIGURATION", rule },
        reason: String(input?.reason || "Employment-level entitlement matrix configuration"),
      },
    });
    return rule;
  }, { isolationLevel: "Serializable" });
}

async function buildProvisioningPreview({
  organizationId, leaveYear, policyIds, employeeNumbers,
  baselineOnly = false, rebaseExisting = false, newHire = false, tx = prisma,
}) {
  const year = validYear(leaveYear);
  const selectedPolicyIds = normalizedList(policyIds);
  const selectedEmployees = normalizedList(employeeNumbers);
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year + 1, 0, 1));
  let policies = await tx.leavePolicy.findMany({
    where: {
      organizationId, status: "ACTIVE", isActive: true, effectiveFrom: { lt: end },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: start } }],
      ...(selectedPolicyIds.length ? { id: { in: selectedPolicyIds } } : {}),
    },
    include: { leaveType: true },
    orderBy: [{ leaveType: { name: "asc" } }, { name: "asc" }],
  });
  if (baselineOnly) policies = policies.filter((policy) => BASELINE_CODES.has(typeKey(policy)));
  const policyCountsByType = policies.reduce((counts, policy) => {
    counts.set(policy.leaveTypeId, (counts.get(policy.leaveTypeId) || 0) + 1);
    return counts;
  }, new Map());
  const employees = await tx.employee.findMany({
    where: {
      organizationId, status: { in: CURRENT_EMPLOYEE_STATUSES },
      ...(selectedEmployees.length ? { employeeNumber: { in: selectedEmployees } } : {}),
    },
    include: { department: true, designation: { include: { employmentLevel: true } } },
    orderBy: { employeeNumber: "asc" },
  });
  const [balances, pendingRequests, existingAllocations] = await Promise.all([
    tx.leaveBalance.findMany({ where: { organizationId, leaveYear: year } }),
    tx.leaveRequest.groupBy({
      by: ["employeeId", "leavePolicyId"],
      where: {
        organizationId,
        status: "PENDING",
        startDate: { gte: start, lt: end },
        ...(policies.length ? { leavePolicyId: { in: policies.map((policy) => policy.id) } } : {}),
      },
      _sum: { requestedUnits: true },
    }),
    tx.leaveEntitlementAllocation.findMany({
      where: {
        organizationId,
        leaveYear: year,
        ...(policies.length ? { leavePolicyId: { in: policies.map((policy) => policy.id) } } : {}),
      },
      select: { employeeId: true, leavePolicyId: true },
    }),
  ]);
  const balanceMap = new Map(balances.map((balance) => [`${balance.employeeId}:${balance.leaveTypeId}`, balance]));
  const pendingMap = new Map(pendingRequests.map((row) => [
    `${row.employeeId}:${row.leavePolicyId}`,
    Number(row._sum.requestedUnits || 0),
  ]));
  const allocatedPolicyIds = new Set(existingAllocations.map((row) => `${row.employeeId}:${row.leavePolicyId}`));
  const rules = policies.length ? await tx.leaveEntitlementMatrixRule.findMany({
    where: {
      organizationId, isActive: true, effectiveFrom: { lt: end },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: start } }],
      leavePolicyId: { in: policies.map((policy) => policy.id) },
    },
  }) : [];
  const ruleMap = new Map(rules.map((rule) => [`${rule.levelNumber}:${rule.leavePolicyId}`, rule]));
  const rows = [];
  for (const employee of employees) {
    const level = employee.designation?.employmentLevel;
    if (!employee.designation || !level || !level.isActive) {
      rows.push({
        employeeId: employee.id, employeeNumber: employee.employeeNumber,
        employeeName: [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(" "),
        designation: employee.designation, employmentLevel: level,
        status: "EMPLOYMENT_LEVEL_MAPPING_REQUIRED",
        message: "Map the employee's designation to an active Employment Level before provisioning.",
      });
      continue;
    }
    for (const policy of policies) {
      const configuredRule = ruleMap.get(`${level.levelNumber}:${policy.id}`);
      const baselineKey = typeKey(policy);
      const recommendedDefault = baselineKey === "ANNUAL"
        ? ANNUAL_BY_LEVEL.get(level.levelNumber) ?? Number(policy.entitlementDays)
        : baselineKey === "SICK" ? 12
          : baselineKey === "UNPAID" ? 5
            : null;
      const rule = configuredRule || (recommendedDefault == null ? null : {
        defaultEntitlement: recommendedDefault,
        unit: policy.entitlementRules?.unit || "WORKING_DAYS",
        newHireTreatment: "FULL",
        source: "CHRIS_RECOMMENDED_PREVIEW",
      });
      const existingBalance = balanceMap.get(`${employee.id}:${policy.leaveTypeId}`) || null;
      const baselinePolicy = BASELINE_CODES.has(baselineKey);
      const explicitlySelected = selectedPolicyIds.includes(policy.id);
      const explicitlyApplicable = explicitlyAppliesToEmployee({ policy, employee, allocatedPolicyIds });
      const configurationRequired = baselinePolicy || explicitlySelected || explicitlyApplicable;
      if (!rule) {
        rows.push({
          employeeId: employee.id,
          employeeNumber: employee.employeeNumber,
          employeeName: [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(" "),
          department: employee.department,
          designation: employee.designation,
          employmentLevel: level,
          policyId: policy.id,
          policyCode: policy.code,
          policyName: policy.name,
          policyVersion: policy.versionNumber,
          versionGroupId: policy.versionGroupId,
          leaveTypeId: policy.leaveTypeId,
          leaveType: policy.leaveType,
          leaveYear: year,
          existingBalance,
          retainedUsed: Number(existingBalance?.used || 0),
          retainedPending: pendingMap.get(`${employee.id}:${policy.id}`) || 0,
          retainedAvailable: null,
          proposedOpeningBalance: null,
          status: configurationRequired ? "ENTITLEMENT_MATRIX_REQUIRED" : "NOT_CONFIGURED_FOR_EMPLOYEE_LEVEL",
          exceptionCodes: configurationRequired ? ["ENTITLEMENT_MATRIX_REQUIRED"] : [],
          configurationStatus: configurationRequired ? "BLOCKING" : "INFORMATIONAL",
          applicabilityReason: baselinePolicy
            ? "MANDATORY_BASELINE"
            : explicitlySelected
              ? "EXPLICITLY_SELECTED"
              : explicitlyApplicable
                ? "EXPLICITLY_ASSIGNED_OR_REQUIRED"
                : "OPTIONAL_NOT_ASSIGNED",
          message: configurationRequired
            ? "Configure an Employment Level entitlement rule for this applicable tenant policy."
            : "Optional active policy is not configured for this employee level and is not assigned or required for this employee.",
        });
        continue;
      }
      const manualNewHire = newHire && rule.newHireTreatment === "MANUAL";
      const policyConflict = configurationRequired && (policyCountsByType.get(policy.leaveTypeId) || 0) > 1;
      const proposedOpeningBalance = newHire && rule.newHireTreatment === "PRORATED"
        ? proratedEntitlement({ entitlement: rule.defaultEntitlement, hireDate: employee.hireDate, leaveYear: year })
        : Number(rule.defaultEntitlement);
      const retainedUsed = Number(existingBalance?.used || 0);
      const retainedPending = pendingMap.get(`${employee.id}:${policy.id}`) || 0;
      const retainedAvailable =
        proposedOpeningBalance +
        Number(existingBalance?.accrued || 0) +
        Number(existingBalance?.carriedForward || 0) +
        Number(existingBalance?.adjusted || 0) -
        retainedUsed -
        retainedPending;
      const deficit = retainedUsed > proposedOpeningBalance;
      const exceptionCodes = [
        ...(policyConflict ? ["POLICY_CONFLICT"] : []),
        ...(deficit ? ["ENTITLEMENT_DEFICIT_REVIEW_REQUIRED"] : []),
      ];
      rows.push({
        employeeId: employee.id, employeeNumber: employee.employeeNumber,
        employeeName: [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(" "),
        department: employee.department, designation: employee.designation, employmentLevel: level,
        policyId: policy.id, policyCode: policy.code, policyName: policy.name,
        policyVersion: policy.versionNumber, versionGroupId: policy.versionGroupId,
        leaveTypeId: policy.leaveTypeId, leaveType: policy.leaveType, leaveYear: year,
        baseEntitlement: Number(rule.defaultEntitlement), proposedOpeningBalance,
        unit: rule.unit, newHireTreatment: rule.newHireTreatment,
        matrixSource: configuredRule ? "TENANT_CONFIGURED" : rule.source,
        allocationMethod: newHire && rule.newHireTreatment === "PRORATED"
          ? "PRORATED"
          : rebaseExisting ? "BASELINE_REPROVISION" : newHire ? "AUTOMATIC_NEW_HIRE" : "LEVEL_DEFAULT",
        existingBalance, retainedUsed, retainedPending, retainedAvailable,
        exceptionCodes,
        status: policyConflict ? "POLICY_CONFLICT" : deficit ? "ENTITLEMENT_DEFICIT_REVIEW_REQUIRED" : manualNewHire ? "MANUAL_ALLOCATION_REQUIRED" : existingBalance ? (rebaseExisting ? "REBASE_READY" : "EXISTS") : "READY",
        message: policyConflict
          ? "Select only one active policy for this employee and leave type."
          : deficit
          ? `Retained used units (${retainedUsed}) exceed the proposed entitlement (${proposedOpeningBalance}); review is required before reconciliation.`
          : manualNewHire
          ? "This policy requires a leave manager to confirm the new-hire allocation."
          : existingBalance
          ? rebaseExisting ? "Opening entitlement will be rebased; authoritative used remains preserved." : "Existing balance will be preserved."
          : "Missing level-derived entitlement is ready to provision.",
      });
    }
  }
  return {
    leaveYear: year, policies, employees, rows,
    summary: {
      ready: rows.filter((row) => row.status === "READY").length,
      rebaseReady: rows.filter((row) => row.status === "REBASE_READY").length,
      existing: rows.filter((row) => row.status === "EXISTS").length,
      exceptions: rows.filter((row) => row.status === "EMPLOYMENT_LEVEL_MAPPING_REQUIRED").length,
      manualRequired: rows.filter((row) => row.status === "MANUAL_ALLOCATION_REQUIRED").length,
      conflicts: rows.filter((row) => row.status === "POLICY_CONFLICT").length,
      deficits: rows.filter((row) => row.status === "ENTITLEMENT_DEFICIT_REVIEW_REQUIRED" || row.exceptionCodes?.includes("ENTITLEMENT_DEFICIT_REVIEW_REQUIRED")).length,
      matrixRequired: rows.filter((row) => row.status === "ENTITLEMENT_MATRIX_REQUIRED").length,
      optionalNotConfigured: rows.filter((row) => row.status === "NOT_CONFIGURED_FOR_EMPLOYEE_LEVEL").length,
      ineligible: 0,
    },
  };
}

async function provisionEntitlements({
  organizationId, actorUserId, leaveYear, policyIds, employeeNumbers, reason,
  baselineOnly = false, rebaseExisting = false, method,
}) {
  const explanation = String(reason || "").trim();
  if (!explanation) throw new Error("PROVISIONING_REASON_REQUIRED");
  return prisma.$transaction(async (tx) => {
    const preview = await buildProvisioningPreview({
      organizationId, leaveYear, policyIds, employeeNumbers, baselineOnly, rebaseExisting, tx,
    });
    if (preview.summary.conflicts) {
      const error = new Error("MULTIPLE_POLICIES_FOR_LEAVE_TYPE");
      error.details = preview.rows
        .filter((row) => row.status === "POLICY_CONFLICT")
        .map((row) => ({
          employeeNumber: row.employeeNumber,
          leaveType: row.leaveType?.name,
          policyName: row.policyName,
        }));
      throw error;
    }
    if (preview.summary.deficits) {
      const error = new Error("ENTITLEMENT_DEFICIT_REVIEW_REQUIRED");
      error.details = preview.rows
        .filter((row) => row.exceptionCodes?.includes("ENTITLEMENT_DEFICIT_REVIEW_REQUIRED"))
        .map((row) => ({
          employeeNumber: row.employeeNumber,
          leaveType: row.leaveType?.name,
          policyName: row.policyName,
          proposedEntitlement: row.proposedOpeningBalance,
          retainedUsed: row.retainedUsed,
          retainedPending: row.retainedPending,
          projectedAvailable: row.retainedAvailable,
        }));
      throw error;
    }
    if (preview.summary.matrixRequired) {
      throw new Error("ENTITLEMENT_MATRIX_REQUIRED");
    }
    const actionable = preview.rows.filter((row) => ["READY", "REBASE_READY"].includes(row.status));
    const allocations = [];
    for (const row of actionable) {
      const balance = await tx.leaveBalance.upsert({
        where: { organizationId_employeeId_leaveTypeId_leaveYear: {
          organizationId, employeeId: row.employeeId, leaveTypeId: row.leaveTypeId, leaveYear: preview.leaveYear,
        } },
        update: row.status === "REBASE_READY" ? { openingBalance: row.proposedOpeningBalance } : {},
        create: {
          organizationId, employeeId: row.employeeId, leaveTypeId: row.leaveTypeId,
          leaveYear: preview.leaveYear, openingBalance: row.proposedOpeningBalance,
        },
      });
      const allocation = await tx.leaveEntitlementAllocation.create({
        data: {
          organizationId, employeeId: row.employeeId, leaveBalanceId: balance.id,
          leavePolicyId: row.policyId, leaveTypeId: row.leaveTypeId,
          levelNumber: row.employmentLevel.levelNumber, leaveYear: preview.leaveYear,
          baseEntitlement: row.baseEntitlement, allocatedEntitlement: row.proposedOpeningBalance,
          method: method || row.allocationMethod, effectiveDate: new Date(),
          reason: explanation, createdByUserId: actorUserId || null,
        },
      });
      allocations.push({ allocation, employeeNumber: row.employeeNumber, retainedUsed: row.retainedUsed });
    }
    const allocationsByPolicy = allocations.reduce((grouped, item) => {
      const values = grouped.get(item.allocation.leavePolicyId) || [];
      values.push(item);
      grouped.set(item.allocation.leavePolicyId, values);
      return grouped;
    }, new Map());
    for (const [leavePolicyId, policyAllocations] of allocationsByPolicy) {
      await tx.leavePolicyAudit.create({
        data: {
          organizationId,
          leavePolicyId,
          actorUserId: actorUserId || null,
          action: "ENTITLEMENT_CHANGED",
          previousValue: { operation: "ENTITLEMENT_PROVISIONING", leaveYear: preview.leaveYear },
          newValue: {
            operation: "ENTITLEMENT_PROVISIONING",
            leaveYear: preview.leaveYear,
            allocations: policyAllocations,
          },
          reason: explanation,
        },
      });
    }
    return {
      leaveYear: preview.leaveYear,
      createdCount: preview.rows.filter((row) => row.status === "READY").length,
      rebasedCount: preview.rows.filter((row) => row.status === "REBASE_READY").length,
      preservedCount: preview.summary.existing, exceptionCount: preview.summary.exceptions, allocations,
    };
  }, { isolationLevel: "Serializable" });
}

async function provisionNewEmployeeEntitlements({ organizationId, employeeNumber, actorUserId, tx }) {
  const run = async (client) => {
    const preview = await buildProvisioningPreview({
      organizationId, employeeNumbers: [employeeNumber], leaveYear: new Date().getFullYear(), baselineOnly: true, newHire: true, tx: client,
    });
    if (preview.summary.exceptions) throw new Error("EMPLOYMENT_LEVEL_MAPPING_REQUIRED");
    if (preview.summary.conflicts) throw new Error("MULTIPLE_POLICIES_FOR_LEAVE_TYPE");
    const created = [];
    for (const row of preview.rows.filter((item) => item.status === "READY")) {
      const balance = await client.leaveBalance.create({
        data: {
          organizationId, employeeId: row.employeeId, leaveTypeId: row.leaveTypeId,
          leaveYear: preview.leaveYear, openingBalance: row.proposedOpeningBalance,
        },
      });
      created.push(await client.leaveEntitlementAllocation.create({
        data: {
          organizationId, employeeId: row.employeeId, leaveBalanceId: balance.id,
          leavePolicyId: row.policyId, leaveTypeId: row.leaveTypeId,
          levelNumber: row.employmentLevel.levelNumber, leaveYear: preview.leaveYear,
          baseEntitlement: row.baseEntitlement, allocatedEntitlement: row.proposedOpeningBalance,
          method: row.allocationMethod, effectiveDate: new Date(),
          reason: "Automatic new-hire baseline entitlement", createdByUserId: actorUserId || null,
        },
      }));
    }
    return created;
  };
  return tx ? run(tx) : prisma.$transaction(run);
}

module.exports = {
  ANNUAL_BY_LEVEL, BASELINE_CODES, ensureEntitlementMatrixDefaults,
  listEntitlementMatrix, saveEntitlementMatrixRule, buildProvisioningPreview,
  provisionEntitlements, provisionNewEmployeeEntitlements,
};
