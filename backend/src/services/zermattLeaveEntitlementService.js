const prisma = require("../config/prisma");

const ZERMATT_SLUG = "zermatt-liquor-limited";
const CURRENT_STATUSES = ["ACTIVE", "PROBATION", "LEAVE", "SUSPENDED"];
const EFFECTIVE_FROM = new Date("2026-01-01T00:00:00.000Z");

const POLICY_DEFINITIONS = [
  {
    key: "ANNUAL", typeCode: "ANNUAL", typeName: "Annual Leave",
    policyCode: "ZLL-ANNUAL-FT", policyName: "ZERMATT Full-Time Annual Leave",
    isPaid: true, entitlementDays: 30, femaleOnly: false,
    entitlementForLevel(level) {
      if (level === 11) return 30;
      if (level >= 9 && level <= 10) return 28;
      if (level >= 5 && level <= 8) return 21;
      if (level >= 1 && level <= 4) return 14;
      return null;
    },
  },
  {
    key: "SICK", typeCode: "SICK", typeName: "Sick Leave",
    policyCode: "ZLL-SICK-FT", policyName: "ZERMATT Full-Time Sick Leave",
    isPaid: true, entitlementDays: 12, femaleOnly: false, entitlementForLevel: () => 12,
  },
  {
    key: "UNPAID_CASUAL", typeCode: "UNPAID", typeName: "Unpaid/Casual Leave",
    policyCode: "ZLL-UNPAID-CASUAL-FT", policyName: "ZERMATT Full-Time Unpaid/Casual Leave",
    isPaid: false, entitlementDays: 5, femaleOnly: false, entitlementForLevel: () => 5,
  },
  {
    key: "COMPASSIONATE", typeCode: "COMPASSIONATE", typeName: "Compassionate Leave",
    policyCode: "ZLL-COMPASSIONATE-FT", policyName: "ZERMATT Full-Time Compassionate Leave",
    isPaid: true, entitlementDays: 6, femaleOnly: false, entitlementForLevel: () => 6,
  },
  {
    key: "MATERNITY", typeCode: "MATERNITY", typeName: "Maternity Leave",
    policyCode: "ZLL-MATERNITY-FT-FEMALE", policyName: "ZERMATT Full-Time Maternity Leave",
    isPaid: true, entitlementDays: 90, femaleOnly: true, entitlementForLevel: () => 90,
  },
];

function isFullTime(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "") === "fulltime";
}
function employeeName(employee) { return [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(" "); }

async function assertZermatt(organizationId, tx = prisma) {
  const organization = await tx.organization.findUnique({ where: { id: organizationId }, select: { id: true, slug: true, name: true } });
  if (!organization || organization.slug !== ZERMATT_SLUG) throw new Error("ZERMATT_TENANT_REQUIRED");
  return organization;
}

async function ensureEmploymentLevels({ organizationId, tx = prisma }) {
  for (let levelNumber = 1; levelNumber <= 11; levelNumber += 1) {
    await tx.organizationEmploymentLevel.upsert({
      where: { organizationId_levelNumber: { organizationId, levelNumber } },
      update: { name: `Level ${levelNumber}`, code: `L${levelNumber}`, isActive: true, displayOrder: levelNumber },
      create: { organizationId, levelNumber, name: `Level ${levelNumber}`, code: `L${levelNumber}`, displayOrder: levelNumber, isActive: true },
    });
  }
}

async function ensurePolicyDefinition({ organizationId, actorUserId, definition, tx = prisma }) {
  const leaveType = await tx.leaveType.upsert({
    where: { organizationId_code: { organizationId, code: definition.typeCode } },
    update: { name: definition.typeName, isPaid: definition.isPaid, isActive: true },
    create: {
      organizationId, code: definition.typeCode, name: definition.typeName,
      description: `${definition.typeName} configured for ZERMATT full-time employees.`,
      unit: "DAYS", isPaid: definition.isPaid, isActive: true,
    },
  });

  // Reuse the tenant's current authoritative policy for this leave type when one
  // already exists. This prevents duplicate active Annual/Sick/Unpaid policies
  // and preserves historical request references instead of fabricating a second policy.
  const existingByCode = await tx.leavePolicy.findFirst({
    where: { organizationId, code: definition.policyCode },
    orderBy: [{ versionNumber: "desc" }, { effectiveFrom: "desc" }],
  });
  const currentForType = await tx.leavePolicy.findFirst({
    where: {
      organizationId,
      leaveTypeId: leaveType.id,
      status: "ACTIVE",
      isActive: true,
      effectiveFrom: { lte: new Date() },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
    },
    orderBy: [{ versionNumber: "desc" }, { effectiveFrom: "desc" }],
  });
  const existing = existingByCode || currentForType;
  const policyData = {
    leaveTypeId: leaveType.id,
    name: definition.policyName,
    code: definition.policyCode,
    description: `${definition.policyName}. Full-Time employment only${definition.femaleOnly ? "; female employees only" : ""}.`,
    category: "ZERMATT_TENANT_POLICY",
    jurisdiction: "Nigeria",
    status: "ACTIVE",
    origin: "ORGANIZATION",
    complianceStatus: "CUSTOM_NOT_ASSESSED",
    eligibilityRules: {
      requiredForAll: false,
      employmentTypes: ["Full-Time"],
      ...(definition.femaleOnly ? { genders: ["FEMALE"] } : {}),
    },
    entitlementRules: { unit: "WORKING_DAYS", allocationBasis: "EMPLOYMENT_LEVEL" },
    balanceRules: { allowNegativeBalance: false },
    requestRules: { maximumRequestable: "AVAILABLE_BALANCE" },
    payrollRules: { paidLeave: definition.isPaid },
    attendanceRules: { suppressAttendanceWhenCommenced: true },
    entitlementDays: definition.entitlementDays,
    accrualMethod: "ANNUAL",
    minimumServiceDays: 0,
    allowCarryForward: false,
    allowNegativeBalance: false,
    noticeDays: 0,
    effectiveFrom: existing?.effectiveFrom || EFFECTIVE_FROM,
    effectiveTo: null,
    isActive: true,
    createdByUserId: actorUserId || existing?.createdByUserId || null,
  };
  const policy = existing
    ? await tx.leavePolicy.update({ where: { id: existing.id }, data: policyData })
    : await tx.leavePolicy.create({ data: { organizationId, versionNumber: 1, ...policyData } });

  for (let levelNumber = 1; levelNumber <= 11; levelNumber += 1) {
    const entitlement = definition.entitlementForLevel(levelNumber);
    if (entitlement == null) continue;
    const activeRule = await tx.leaveEntitlementMatrixRule.findFirst({
      where: { organizationId, levelNumber, leavePolicyId: policy.id, isActive: true },
      orderBy: { effectiveFrom: "desc" },
    });
    if (activeRule) {
      await tx.leaveEntitlementMatrixRule.update({
        where: { id: activeRule.id },
        data: { defaultEntitlement: entitlement, unit: "WORKING_DAYS", newHireTreatment: "FULL", isActive: true },
      });
    } else {
      await tx.leaveEntitlementMatrixRule.create({
        data: {
          organizationId, levelNumber, leavePolicyId: policy.id, leaveTypeId: leaveType.id,
          defaultEntitlement: entitlement, unit: "WORKING_DAYS", newHireTreatment: "FULL",
          effectiveFrom: EFFECTIVE_FROM, isActive: true, createdByUserId: actorUserId || null,
        },
      });
    }
  }
  return { definition, leaveType, policy };
}

async function configureZermattLeavePolicies({ organizationId, actorUserId, tx = prisma }) {
  await assertZermatt(organizationId, tx);
  await ensureEmploymentLevels({ organizationId, tx });
  const configured = [];
  for (const definition of POLICY_DEFINITIONS) configured.push(await ensurePolicyDefinition({ organizationId, actorUserId, definition, tx }));
  return configured;
}

async function provisionZermattEmployeeLeaveProfile({ organizationId, employeeNumber, actorUserId, leaveYear = new Date().getFullYear(), tx = prisma }) {
  await assertZermatt(organizationId, tx);
  const employee = await tx.employee.findFirst({ where: { organizationId, employeeNumber }, include: { designation: true } });
  if (!employee) throw new Error("EMPLOYEE_NOT_FOUND");
  if (!isFullTime(employee.employmentType)) return { employeeNumber, eligible: false, reason: "FULL_TIME_ONLY", allocations: [] };
  const levelNumber = Number(employee.designation?.careerLevel || 0);
  if (!Number.isInteger(levelNumber) || levelNumber < 1 || levelNumber > 11) throw new Error("EMPLOYMENT_LEVEL_MAPPING_REQUIRED");

  const configured = await configureZermattLeavePolicies({ organizationId, actorUserId, tx });
  const allocations = [];
  for (const item of configured) {
    if (item.definition.femaleOnly && String(employee.gender) !== "FEMALE") continue;
    const entitlement = item.definition.entitlementForLevel(levelNumber);
    if (entitlement == null) continue;
    const balance = await tx.leaveBalance.upsert({
      where: { organizationId_employeeId_leaveTypeId_leaveYear: { organizationId, employeeId: employee.id, leaveTypeId: item.leaveType.id, leaveYear } },
      update: { openingBalance: entitlement },
      create: { organizationId, employeeId: employee.id, leaveTypeId: item.leaveType.id, leaveYear, openingBalance: entitlement },
    });
    const latest = await tx.leaveEntitlementAllocation.findFirst({
      where: { organizationId, employeeId: employee.id, leavePolicyId: item.policy.id, leaveYear },
      orderBy: { createdAt: "desc" },
    });
    let allocation = latest;
    if (!latest || Number(latest.allocatedEntitlement) !== Number(entitlement) || Number(latest.levelNumber) !== levelNumber) {
      allocation = await tx.leaveEntitlementAllocation.create({
        data: {
          organizationId, employeeId: employee.id, leaveBalanceId: balance.id,
          leavePolicyId: item.policy.id, leaveTypeId: item.leaveType.id,
          levelNumber, leaveYear, baseEntitlement: entitlement, allocatedEntitlement: entitlement,
          method: "LEVEL_DEFAULT", effectiveDate: new Date(),
          reason: "ZERMATT Full-Time leave entitlement mapping", createdByUserId: actorUserId || null,
        },
      });
    }
    allocations.push({
      policyId: item.policy.id, policyCode: item.policy.code, policyName: item.policy.name,
      entitlement, balanceId: balance.id, allocationId: allocation?.id || null,
    });
  }
  return { employeeNumber, employeeName: employeeName(employee), eligible: true, levelNumber, allocations };
}

async function provisionAllCurrentFullTimeEmployees({ organizationId, actorUserId, leaveYear = new Date().getFullYear(), tx = prisma }) {
  await assertZermatt(organizationId, tx);
  await configureZermattLeavePolicies({ organizationId, actorUserId, tx });
  const employees = await tx.employee.findMany({
    where: { organizationId, status: { in: CURRENT_STATUSES } },
    select: { employeeNumber: true, employmentType: true },
    orderBy: { employeeNumber: "asc" },
  });
  const currentFullTime = employees.filter((employee) => isFullTime(employee.employmentType));
  const results = [];
  for (const employee of currentFullTime) {
    results.push(await provisionZermattEmployeeLeaveProfile({ organizationId, employeeNumber: employee.employeeNumber, actorUserId, leaveYear, tx }));
  }
  return { leaveYear, currentEmployees: employees.length, fullTimeEmployees: currentFullTime.length, results };
}

module.exports = {
  ZERMATT_SLUG, POLICY_DEFINITIONS, isFullTime,
  configureZermattLeavePolicies, provisionZermattEmployeeLeaveProfile, provisionAllCurrentFullTimeEmployees,
};
