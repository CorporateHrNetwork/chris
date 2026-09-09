const { resolveEffectiveEmploymentLevel } = require("./employeeEmploymentLevelAssignmentService");
const {
  resolveZermattV2Level,
  isZermattV2InternalLevel,
} = require("../config/zermattEmploymentLevelsV2");

const ZERMATT_SLUG = "zermatt-liquor-limited";
const CURRENT_STATUSES = ["ACTIVE", "PROBATION", "LEAVE", "SUSPENDED"];

function normalizeEmploymentType(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function annualLeaveEligible(value) {
  const normalized = normalizeEmploymentType(value);
  return normalized === "fulltime" || normalized === "expatriate";
}

async function activeAnnualPolicy(tx, organizationId, asOf = new Date()) {
  const leaveType = await tx.leaveType.findFirst({
    where: {
      organizationId,
      code: "ANNUAL",
      isActive: true,
    },
  });
  if (!leaveType) throw new Error("ZERMATT_ANNUAL_LEAVE_TYPE_NOT_CONFIGURED");

  const policy = await tx.leavePolicy.findFirst({
    where: {
      organizationId,
      leaveTypeId: leaveType.id,
      status: "ACTIVE",
      isActive: true,
      effectiveFrom: { lte: asOf },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOf } }],
    },
    orderBy: [{ versionNumber: "desc" }, { effectiveFrom: "desc" }],
  });
  if (!policy) throw new Error("ZERMATT_ANNUAL_LEAVE_POLICY_NOT_CONFIGURED");

  return { leaveType, policy };
}

async function synchronizeZermattEmployeeLevelLive(
  tx,
  {
    organizationId,
    employeeNumber,
    actorUserId,
    leaveYear = new Date().getFullYear(),
    previousEffective = null,
    reason = null,
  }
) {
  const organization = await tx.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, slug: true, name: true },
  });

  if (!organization || organization.slug !== ZERMATT_SLUG) {
    return {
      applied: false,
      tenant: organization?.slug || null,
      reason: "NON_ZERMATT_TENANT",
    };
  }

  const employee = await tx.employee.findFirst({
    where: {
      organizationId,
      employeeNumber: String(employeeNumber || "").trim().toUpperCase(),
    },
    select: {
      id: true,
      employeeNumber: true,
      firstName: true,
      middleName: true,
      lastName: true,
      status: true,
      exitDate: true,
      employmentType: true,
    },
  });
  if (!employee) throw new Error("EMPLOYEE_NOT_FOUND");
  if (!CURRENT_STATUSES.includes(employee.status) || employee.exitDate) {
    throw new Error("EMPLOYEE_NOT_CURRENT");
  }

  const effective = await resolveEffectiveEmploymentLevel(tx, {
    organizationId,
    employeeId: employee.id,
  });
  const levelNumber = Number(effective.levelNumber || 0);
  if (!isZermattV2InternalLevel(levelNumber)) {
    throw new Error("ZERMATT_V2_EMPLOYMENT_LEVEL_REQUIRED");
  }

  const publicLevel = resolveZermattV2Level(levelNumber);
  if (!publicLevel) throw new Error("ZERMATT_V2_EMPLOYMENT_LEVEL_REQUIRED");

  const result = {
    applied: true,
    employeeId: employee.id,
    employeeNumber: employee.employeeNumber,
    employeeName: [employee.firstName, employee.middleName, employee.lastName]
      .filter(Boolean)
      .join(" "),
    employmentLevel: {
      levelNumber,
      code: effective.employmentLevel?.code || publicLevel.code,
      name: effective.employmentLevel?.name || publicLevel.name,
      source: effective.source,
      effectiveFrom: effective.override?.effectiveFrom || null,
    },
    leaveYear: Number(leaveYear),
    annualLeave: null,
  };

  if (!annualLeaveEligible(employee.employmentType)) {
    result.annualLeave = {
      eligible: false,
      employmentType: employee.employmentType,
      changed: false,
    };
  } else {
    const { leaveType, policy } = await activeAnnualPolicy(tx, organizationId);
    const entitlement = Number(publicLevel.annualLeaveDays);
    const year = Number(leaveYear);
    const existingBalance = await tx.leaveBalance.findUnique({
      where: {
        organizationId_employeeId_leaveTypeId_leaveYear: {
          organizationId,
          employeeId: employee.id,
          leaveTypeId: leaveType.id,
          leaveYear: year,
        },
      },
    });

    const previousOpeningBalance = existingBalance
      ? Number(existingBalance.openingBalance || 0)
      : null;
    const used = existingBalance ? Number(existingBalance.used || 0) : 0;

    if (used > entitlement) {
      const error = new Error("ANNUAL_ENTITLEMENT_BELOW_USED");
      error.details = {
        employeeNumber: employee.employeeNumber,
        leaveYear: year,
        levelNumber,
        levelCode: effective.employmentLevel?.code || publicLevel.code,
        used,
        proposedEntitlement: entitlement,
      };
      throw error;
    }

    const balance = await tx.leaveBalance.upsert({
      where: {
        organizationId_employeeId_leaveTypeId_leaveYear: {
          organizationId,
          employeeId: employee.id,
          leaveTypeId: leaveType.id,
          leaveYear: year,
        },
      },
      update: { openingBalance: entitlement },
      create: {
        organizationId,
        employeeId: employee.id,
        leaveTypeId: leaveType.id,
        leaveYear: year,
        openingBalance: entitlement,
      },
    });

    const latestAllocation = await tx.leaveEntitlementAllocation.findFirst({
      where: {
        organizationId,
        employeeId: employee.id,
        leavePolicyId: policy.id,
        leaveYear: year,
      },
      orderBy: { createdAt: "desc" },
    });

    let allocation = latestAllocation;
    const allocationChanged =
      !latestAllocation ||
      Number(latestAllocation.allocatedEntitlement) !== entitlement ||
      Number(latestAllocation.levelNumber) !== levelNumber;

    if (allocationChanged) {
      allocation = await tx.leaveEntitlementAllocation.create({
        data: {
          organizationId,
          employeeId: employee.id,
          leaveBalanceId: balance.id,
          leavePolicyId: policy.id,
          leaveTypeId: leaveType.id,
          levelNumber,
          leaveYear: year,
          baseEntitlement: entitlement,
          allocatedEntitlement: entitlement,
          method:
            effective.source === "EMPLOYEE_OVERRIDE"
              ? "MANUAL_OVERRIDE"
              : "LEVEL_DEFAULT",
          effectiveDate: effective.override?.effectiveFrom || new Date(),
          reason:
            effective.source === "EMPLOYEE_OVERRIDE"
              ? "Live employee-specific Employment Level activation applied to ZERMATT Annual Leave"
              : "Designation-default Employment Level restored live to ZERMATT Annual Leave",
          createdByUserId: actorUserId || null,
        },
      });
    }

    result.annualLeave = {
      eligible: true,
      policyId: policy.id,
      policyCode: policy.code,
      policyVersion: policy.versionNumber,
      leaveTypeId: leaveType.id,
      previousOpeningBalance,
      openingBalance: entitlement,
      used,
      changed:
        previousOpeningBalance !== entitlement || Boolean(allocationChanged),
      balanceId: balance.id,
      allocationId: allocation?.id || null,
    };
  }

  await tx.organizationAudit.create({
    data: {
      organizationId,
      actorUserId: actorUserId || null,
      entityType: "Employee",
      entityId: employee.id,
      action: "ZERMATT_EMPLOYEE_EMPLOYMENT_LEVEL_LIVE_ACTIVATED",
      previousValue: previousEffective
        ? {
            source: previousEffective.source || null,
            levelNumber: previousEffective.levelNumber ?? null,
            code: previousEffective.code || null,
            name: previousEffective.name || null,
          }
        : null,
      newValue: {
        source: result.employmentLevel.source,
        levelNumber: result.employmentLevel.levelNumber,
        code: result.employmentLevel.code,
        name: result.employmentLevel.name,
        leaveYear: result.leaveYear,
        annualLeaveOpeningBalance: result.annualLeave?.openingBalance ?? null,
        annualLeaveEligible: result.annualLeave?.eligible ?? false,
      },
      reason:
        String(reason || "").trim() ||
        "ZERMATT employee Employment Level activated live",
    },
  });

  return result;
}

module.exports = {
  ZERMATT_SLUG,
  annualLeaveEligible,
  synchronizeZermattEmployeeLevelLive,
};
