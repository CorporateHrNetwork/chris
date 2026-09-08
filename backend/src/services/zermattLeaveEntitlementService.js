const prisma = require("../config/prisma");
const { ZERMATT_EMPLOYMENT_LEVELS } = require("../config/zermattEmploymentLevels");
const {
  ZERMATT_EMPLOYMENT_LEVELS_V2,
  resolveZermattV2Level,
  isZermattV2InternalLevel,
} = require("../config/zermattEmploymentLevelsV2");
const {
  resolveEffectiveEmploymentLevel,
} = require("./employeeEmploymentLevelAssignmentService");

const ZERMATT_SLUG = "zermatt-liquor-limited";
const CURRENT_STATUSES = ["ACTIVE", "PROBATION", "LEAVE", "SUSPENDED"];
const EFFECTIVE_FROM = new Date("2026-01-01T00:00:00.000Z");
const V2_SENTINEL_LEVEL_NUMBER = 101;

const POLICY_DEFINITIONS = [
  {
    key: "ANNUAL",
    typeCode: "ANNUAL",
    typeName: "Annual Leave",
    policyCode: "ZLL-ANNUAL-FT",
    policyName: "ZERMATT Full-Time Annual Leave",
    v2PolicyName: "ZERMATT Standard Annual Leave",
    isPaid: true,
    entitlementDays: 30,
    femaleOnly: false,
    entitlementForLevel(level, hierarchyVersion = "V1") {
      if (hierarchyVersion === "V2") {
        return resolveZermattV2Level(level)?.annualLeaveDays ?? null;
      }
      if (level === 11) return 30;
      if (level >= 9 && level <= 10) return 28;
      if (level >= 5 && level <= 8) return 21;
      if (level >= 1 && level <= 4) return 14;
      return null;
    },
  },
  {
    key: "SICK",
    typeCode: "SICK",
    typeName: "Sick Leave",
    policyCode: "ZLL-SICK-FT",
    policyName: "ZERMATT Full-Time Sick Leave",
    isPaid: true,
    entitlementDays: 12,
    femaleOnly: false,
    entitlementForLevel: () => 12,
  },
  {
    key: "UNPAID_CASUAL",
    typeCode: "UNPAID",
    typeName: "Unpaid/Casual Leave",
    policyCode: "ZLL-UNPAID-CASUAL-FT",
    policyName: "ZERMATT Full-Time Unpaid/Casual Leave",
    isPaid: false,
    entitlementDays: 5,
    femaleOnly: false,
    entitlementForLevel: () => 5,
  },
  {
    key: "COMPASSIONATE",
    typeCode: "COMPASSIONATE",
    typeName: "Compassionate Leave",
    policyCode: "ZLL-COMPASSIONATE-FT",
    policyName: "ZERMATT Full-Time Compassionate Leave",
    isPaid: true,
    entitlementDays: 6,
    femaleOnly: false,
    entitlementForLevel: () => 6,
  },
  {
    key: "MATERNITY",
    typeCode: "MATERNITY",
    typeName: "Maternity Leave",
    policyCode: "ZLL-MATERNITY-FT-FEMALE",
    policyName: "ZERMATT Full-Time Maternity Leave",
    isPaid: true,
    entitlementDays: 90,
    femaleOnly: true,
    entitlementForLevel: () => 90,
  },
];

function normalizeEmploymentType(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function isFullTime(value) {
  return normalizeEmploymentType(value) === "fulltime";
}

function isExpatriate(value) {
  return normalizeEmploymentType(value) === "expatriate";
}

function isAnnualEligibleEmploymentType(value, hierarchyVersion = "V1") {
  return isFullTime(value) || (hierarchyVersion === "V2" && isExpatriate(value));
}

function eligibleEmploymentTypesForDefinition(definition, hierarchyVersion) {
  if (definition.key === "ANNUAL" && hierarchyVersion === "V2") {
    return ["Full-Time", "Expatriate"];
  }
  return ["Full-Time"];
}

function isEligibleForDefinition(employmentType, definition, hierarchyVersion) {
  if (definition.key === "ANNUAL") {
    return isAnnualEligibleEmploymentType(employmentType, hierarchyVersion);
  }
  return isFullTime(employmentType);
}

function employeeName(employee) {
  return [employee.firstName, employee.middleName, employee.lastName]
    .filter(Boolean)
    .join(" ");
}

async function assertZermatt(organizationId, tx = prisma) {
  const organization = await tx.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, slug: true, name: true },
  });
  if (!organization || organization.slug !== ZERMATT_SLUG) {
    throw new Error("ZERMATT_TENANT_REQUIRED");
  }
  return organization;
}

async function isZermattV2Active({ organizationId, tx = prisma }) {
  const sentinel = await tx.organizationEmploymentLevel.findUnique({
    where: {
      organizationId_levelNumber: {
        organizationId,
        levelNumber: V2_SENTINEL_LEVEL_NUMBER,
      },
    },
    select: { code: true, isActive: true },
  });
  return Boolean(sentinel?.isActive && sentinel.code === "L1");
}

async function resolveHierarchy({ organizationId, tx = prisma }) {
  const v2 = await isZermattV2Active({ organizationId, tx });
  return v2
    ? { version: "V2", levels: ZERMATT_EMPLOYMENT_LEVELS_V2 }
    : { version: "V1", levels: ZERMATT_EMPLOYMENT_LEVELS };
}

async function ensureEmploymentLevels({ organizationId, tx = prisma, hierarchy = null }) {
  const resolvedHierarchy =
    hierarchy || (await resolveHierarchy({ organizationId, tx }));

  for (const level of resolvedHierarchy.levels) {
    await tx.organizationEmploymentLevel.upsert({
      where: {
        organizationId_levelNumber: {
          organizationId,
          levelNumber: level.levelNumber,
        },
      },
      update: {
        name: level.name,
        code: level.code,
        description: level.description,
        displayOrder: level.displayOrder,
        isActive: true,
      },
      create: {
        organizationId,
        levelNumber: level.levelNumber,
        code: level.code,
        name: level.name,
        description: level.description,
        displayOrder: level.displayOrder,
        isActive: true,
      },
    });
  }

  return resolvedHierarchy;
}

async function ensurePolicyDefinition({
  organizationId,
  actorUserId,
  definition,
  hierarchy,
  tx = prisma,
}) {
  const leaveType = await tx.leaveType.upsert({
    where: { organizationId_code: { organizationId, code: definition.typeCode } },
    update: { name: definition.typeName, isPaid: definition.isPaid, isActive: true },
    create: {
      organizationId,
      code: definition.typeCode,
      name: definition.typeName,
      description: `${definition.typeName} configured for ZERMATT eligible employees.`,
      unit: "DAYS",
      isPaid: definition.isPaid,
      isActive: true,
    },
  });

  const existingByCode = await tx.leavePolicy.findFirst({
    where: { organizationId, code: definition.policyCode },
    orderBy: [{ versionNumber: "desc" }, { effectiveFrom: "desc" }],
  });
  const now = new Date();
  const currentForType = await tx.leavePolicy.findFirst({
    where: {
      organizationId,
      leaveTypeId: leaveType.id,
      status: "ACTIVE",
      isActive: true,
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
    },
    orderBy: [{ versionNumber: "desc" }, { effectiveFrom: "desc" }],
  });
  const existing = existingByCode || currentForType;
  const annualCarryover = definition.key === "ANNUAL";
  const eligibleEmploymentTypes = eligibleEmploymentTypesForDefinition(
    definition,
    hierarchy.version
  );
  const policyName =
    hierarchy.version === "V2" && definition.v2PolicyName
      ? definition.v2PolicyName
      : definition.policyName;
  const eligibilityDescription = eligibleEmploymentTypes.join(" and ");

  const policyData = {
    leaveTypeId: leaveType.id,
    name: policyName,
    code: definition.policyCode,
    description: `${policyName}. Eligible employment types: ${eligibilityDescription}${
      definition.femaleOnly ? "; female employees only" : ""
    }${
      annualCarryover
        ? "; unused annual leave may carry to the next operational year and must be used by 31 March or forfeited"
        : ""
    }.`,
    category: "ZERMATT_TENANT_POLICY",
    jurisdiction: "Nigeria",
    status: "ACTIVE",
    origin: "ORGANIZATION",
    complianceStatus: "CUSTOM_NOT_ASSESSED",
    eligibilityRules: {
      requiredForAll: false,
      employmentTypes: eligibleEmploymentTypes,
      ...(definition.femaleOnly ? { genders: ["FEMALE"] } : {}),
    },
    entitlementRules: {
      unit: "WORKING_DAYS",
      allocationBasis: "EMPLOYMENT_LEVEL",
      hierarchyVersion: hierarchy.version,
    },
    balanceRules: {
      allowNegativeBalance: false,
      ...(annualCarryover
        ? {
            carryForwardAllowed: true,
            carryForwardSource: "UNUSED_YEAR_END_BALANCE",
            carryForwardUsePriority: "CARRYOVER_FIRST",
            carryForwardExpiry: "03-31",
            carryForwardExpiryAction: "FORFEIT_UNUSED",
          }
        : {}),
    },
    requestRules: { maximumRequestable: "AVAILABLE_BALANCE" },
    payrollRules: { paidLeave: definition.isPaid },
    attendanceRules: { suppressAttendanceWhenCommenced: true },
    entitlementDays: definition.entitlementDays,
    accrualMethod: "ANNUAL",
    minimumServiceDays: 0,
    allowCarryForward: annualCarryover,
    maxCarryForwardDays: null,
    allowNegativeBalance: false,
    noticeDays: 0,
    effectiveFrom: existing?.effectiveFrom || EFFECTIVE_FROM,
    effectiveTo: null,
    isActive: true,
    createdByUserId: actorUserId || existing?.createdByUserId || null,
  };

  const policy = existing
    ? await tx.leavePolicy.update({ where: { id: existing.id }, data: policyData })
    : await tx.leavePolicy.create({
        data: { organizationId, versionNumber: 1, ...policyData },
      });

  const activeLevelNumbers = hierarchy.levels.map((level) => level.levelNumber);
  await tx.leaveEntitlementMatrixRule.updateMany({
    where: {
      organizationId,
      leavePolicyId: policy.id,
      isActive: true,
      levelNumber: { notIn: activeLevelNumbers },
    },
    data: { isActive: false },
  });

  for (const level of hierarchy.levels) {
    const levelNumber = level.levelNumber;
    const entitlement = definition.entitlementForLevel(
      levelNumber,
      hierarchy.version
    );
    if (entitlement == null) continue;

    const activeRule = await tx.leaveEntitlementMatrixRule.findFirst({
      where: {
        organizationId,
        levelNumber,
        leavePolicyId: policy.id,
        isActive: true,
      },
      orderBy: { effectiveFrom: "desc" },
    });

    if (activeRule) {
      await tx.leaveEntitlementMatrixRule.update({
        where: { id: activeRule.id },
        data: {
          defaultEntitlement: entitlement,
          unit: "WORKING_DAYS",
          newHireTreatment: "FULL",
          isActive: true,
        },
      });
    } else {
      await tx.leaveEntitlementMatrixRule.create({
        data: {
          organizationId,
          levelNumber,
          leavePolicyId: policy.id,
          leaveTypeId: leaveType.id,
          defaultEntitlement: entitlement,
          unit: "WORKING_DAYS",
          newHireTreatment: "FULL",
          effectiveFrom: EFFECTIVE_FROM,
          isActive: true,
          createdByUserId: actorUserId || null,
        },
      });
    }
  }

  return { definition, leaveType, policy, hierarchyVersion: hierarchy.version };
}

async function configureZermattLeavePolicies({
  organizationId,
  actorUserId,
  tx = prisma,
}) {
  await assertZermatt(organizationId, tx);
  const hierarchy = await resolveHierarchy({ organizationId, tx });
  await ensureEmploymentLevels({ organizationId, tx, hierarchy });

  const configured = [];
  for (const definition of POLICY_DEFINITIONS) {
    configured.push(
      await ensurePolicyDefinition({
        organizationId,
        actorUserId,
        definition,
        hierarchy,
        tx,
      })
    );
  }
  return configured;
}

async function provisionEmployeeWithConfigured({
  organizationId,
  employeeNumber,
  actorUserId,
  leaveYear,
  configured,
  tx,
}) {
  const employee = await tx.employee.findFirst({
    where: { organizationId, employeeNumber },
    include: { designation: true },
  });
  if (!employee) throw new Error("EMPLOYEE_NOT_FOUND");

  const hierarchyVersion = configured[0]?.hierarchyVersion || "V1";
  const effectiveLevel = await resolveEffectiveEmploymentLevel(tx, {
    organizationId,
    employeeId: employee.id,
  });
  const levelNumber = Number(effectiveLevel.levelNumber || 0);
  const validLevel =
    hierarchyVersion === "V2"
      ? isZermattV2InternalLevel(levelNumber)
      : Number.isInteger(levelNumber) && levelNumber >= 1 && levelNumber <= 11;

  if (!validLevel) {
    throw new Error(`EMPLOYMENT_LEVEL_MAPPING_REQUIRED:${employeeNumber}`);
  }

  const allocations = [];
  const skippedPolicies = [];

  for (const item of configured) {
    if (
      !isEligibleForDefinition(
        employee.employmentType,
        item.definition,
        hierarchyVersion
      )
    ) {
      skippedPolicies.push({
        policyCode: item.policy.code,
        reason:
          item.definition.key === "ANNUAL" && hierarchyVersion === "V2"
            ? "ANNUAL_ELIGIBLE_EMPLOYMENT_TYPES_FULL_TIME_OR_EXPATRIATE"
            : "FULL_TIME_ONLY",
      });
      continue;
    }
    if (item.definition.femaleOnly && String(employee.gender) !== "FEMALE") {
      skippedPolicies.push({
        policyCode: item.policy.code,
        reason: "FEMALE_ONLY",
      });
      continue;
    }

    const entitlement = item.definition.entitlementForLevel(
      levelNumber,
      hierarchyVersion
    );
    if (entitlement == null) continue;

    const existingBalance = await tx.leaveBalance.findUnique({
      where: {
        organizationId_employeeId_leaveTypeId_leaveYear: {
          organizationId,
          employeeId: employee.id,
          leaveTypeId: item.leaveType.id,
          leaveYear,
        },
      },
      select: { id: true, openingBalance: true, used: true },
    });

    if (
      item.definition.key === "ANNUAL" &&
      existingBalance &&
      Number(existingBalance.used) > Number(entitlement)
    ) {
      const error = new Error("ANNUAL_ENTITLEMENT_BELOW_USED");
      error.details = {
        employeeNumber,
        leaveYear,
        levelNumber,
        levelSource: effectiveLevel.source,
        used: Number(existingBalance.used),
        proposedEntitlement: Number(entitlement),
      };
      throw error;
    }

    const balance = await tx.leaveBalance.upsert({
      where: {
        organizationId_employeeId_leaveTypeId_leaveYear: {
          organizationId,
          employeeId: employee.id,
          leaveTypeId: item.leaveType.id,
          leaveYear,
        },
      },
      update: { openingBalance: entitlement },
      create: {
        organizationId,
        employeeId: employee.id,
        leaveTypeId: item.leaveType.id,
        leaveYear,
        openingBalance: entitlement,
      },
    });

    const latest = await tx.leaveEntitlementAllocation.findFirst({
      where: {
        organizationId,
        employeeId: employee.id,
        leavePolicyId: item.policy.id,
        leaveYear,
      },
      orderBy: { createdAt: "desc" },
    });

    let allocation = latest;
    if (
      !latest ||
      Number(latest.allocatedEntitlement) !== Number(entitlement) ||
      Number(latest.levelNumber) !== levelNumber
    ) {
      allocation = await tx.leaveEntitlementAllocation.create({
        data: {
          organizationId,
          employeeId: employee.id,
          leaveBalanceId: balance.id,
          leavePolicyId: item.policy.id,
          leaveTypeId: item.leaveType.id,
          levelNumber,
          leaveYear,
          baseEntitlement: entitlement,
          allocatedEntitlement: entitlement,
          method:
            effectiveLevel.source === "EMPLOYEE_OVERRIDE"
              ? "MANUAL_OVERRIDE"
              : "LEVEL_DEFAULT",
          effectiveDate:
            effectiveLevel.override?.effectiveFrom || new Date(),
          reason:
            effectiveLevel.source === "EMPLOYEE_OVERRIDE"
              ? "Employee-specific Employment Level override applied to ZERMATT leave entitlement"
              : hierarchyVersion === "V2"
                ? "ZERMATT V2 designation-default Employment Level leave entitlement mapping"
                : "ZERMATT Full-Time leave entitlement mapping",
          createdByUserId: actorUserId || null,
        },
      });
    }

    allocations.push({
      policyId: item.policy.id,
      policyCode: item.policy.code,
      policyName: item.policy.name,
      entitlement,
      levelSource: effectiveLevel.source,
      balanceId: balance.id,
      allocationId: allocation?.id || null,
    });
  }

  return {
    employeeNumber,
    employeeName: employeeName(employee),
    eligible: allocations.length > 0,
    hierarchyVersion,
    levelNumber,
    levelSource: effectiveLevel.source,
    allocations,
    skippedPolicies,
  };
}

async function provisionZermattEmployeeLeaveProfile({
  organizationId,
  employeeNumber,
  actorUserId,
  leaveYear = new Date().getFullYear(),
  tx = prisma,
  configuredPolicies = null,
}) {
  await assertZermatt(organizationId, tx);
  const configured =
    configuredPolicies ||
    (await configureZermattLeavePolicies({ organizationId, actorUserId, tx }));
  return provisionEmployeeWithConfigured({
    organizationId,
    employeeNumber,
    actorUserId,
    leaveYear,
    configured,
    tx,
  });
}

async function provisionAllCurrentFullTimeEmployees({
  organizationId,
  actorUserId,
  leaveYear = new Date().getFullYear(),
  tx = prisma,
}) {
  await assertZermatt(organizationId, tx);
  const configured = await configureZermattLeavePolicies({
    organizationId,
    actorUserId,
    tx,
  });
  const hierarchyVersion = configured[0]?.hierarchyVersion || "V1";

  const employees = await tx.employee.findMany({
    where: { organizationId, status: { in: CURRENT_STATUSES } },
    select: {
      id: true,
      employeeNumber: true,
      employmentType: true,
    },
    orderBy: { employeeNumber: "asc" },
  });

  const eligibleEmployees = employees.filter((employee) =>
    isAnnualEligibleEmploymentType(employee.employmentType, hierarchyVersion)
  );

  const invalidLevels = [];
  for (const employee of eligibleEmployees) {
    try {
      const effectiveLevel = await resolveEffectiveEmploymentLevel(tx, {
        organizationId,
        employeeId: employee.id,
      });
      const level = Number(effectiveLevel.levelNumber || 0);
      const valid = hierarchyVersion === "V2"
        ? isZermattV2InternalLevel(level)
        : Number.isInteger(level) && level >= 1 && level <= 11;
      if (!valid) invalidLevels.push(employee.employeeNumber);
    } catch (error) {
      if (
        error.message === "EMPLOYMENT_LEVEL_MAPPING_REQUIRED" ||
        error.message === "EMPLOYEE_LEVEL_OVERRIDE_INACTIVE"
      ) {
        invalidLevels.push(employee.employeeNumber);
        continue;
      }
      throw error;
    }
  }

  if (invalidLevels.length) {
    const error = new Error("EMPLOYMENT_LEVEL_MAPPING_REQUIRED");
    error.details = {
      employees: invalidLevels,
      total: invalidLevels.length,
    };
    throw error;
  }

  const results = [];
  for (const employee of eligibleEmployees) {
    results.push(
      await provisionEmployeeWithConfigured({
        organizationId,
        employeeNumber: employee.employeeNumber,
        actorUserId,
        leaveYear,
        configured,
        tx,
      })
    );
  }

  return {
    leaveYear,
    hierarchyVersion,
    currentEmployees: employees.length,
    fullTimeEmployees: employees.filter((employee) =>
      isFullTime(employee.employmentType)
    ).length,
    expatriateEmployees: employees.filter((employee) =>
      isExpatriate(employee.employmentType)
    ).length,
    annualEligibleEmployees: eligibleEmployees.length,
    results,
  };
}

module.exports = {
  ZERMATT_SLUG,
  POLICY_DEFINITIONS,
  isFullTime,
  isExpatriate,
  isAnnualEligibleEmploymentType,
  isZermattV2Active,
  resolveHierarchy,
  configureZermattLeavePolicies,
  provisionZermattEmployeeLeaveProfile,
  provisionAllCurrentFullTimeEmployees,
};