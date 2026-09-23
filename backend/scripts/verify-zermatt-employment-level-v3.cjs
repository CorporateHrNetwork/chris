require("dotenv").config();
const prisma = require("../src/config/prisma");
const {
  ZERMATT_EMPLOYMENT_LEVELS_V3,
  resolveZermattV3DesignationLevel,
  resolveZermattV3Level,
} = require("../src/config/zermattEmploymentLevelsV3");

async function main() {
  const organization = await prisma.organization.findUnique({
    where: { slug: "zermatt-liquor-limited" },
    select: { id: true, name: true },
  });
  if (!organization) throw new Error("ZERMATT_ORGANIZATION_NOT_FOUND");

  const [levels, designations, annualType, annualPolicy] = await Promise.all([
    prisma.organizationEmploymentLevel.findMany({
      where: { organizationId: organization.id },
      orderBy: { levelNumber: "asc" },
    }),
    prisma.designation.findMany({
      where: { organizationId: organization.id },
      select: { code: true, name: true, careerLevel: true },
      orderBy: { code: "asc" },
    }),
    prisma.leaveType.findFirst({
      where: { organizationId: organization.id, code: "ANNUAL", isActive: true },
    }),
    prisma.leavePolicy.findFirst({
      where: {
        organizationId: organization.id,
        code: "ZLL-ANNUAL-FT",
        status: "ACTIVE",
        isActive: true,
      },
      orderBy: [{ versionNumber: "desc" }, { effectiveFrom: "desc" }],
    }),
  ]);

  const activeV3 = levels.filter(
    (level) => level.isActive && level.levelNumber >= 201 && level.levelNumber <= 207
  );
  if (activeV3.length !== 7) {
    throw new Error(`ZERMATT_V3_ACTIVE_LEVEL_COUNT_INVALID:${activeV3.length}`);
  }

  const activeOld = levels.filter(
    (level) =>
      level.isActive &&
      ((level.levelNumber >= 1 && level.levelNumber <= 11) ||
        (level.levelNumber >= 101 && level.levelNumber <= 107))
  );
  if (activeOld.length) {
    throw new Error(
      `ZERMATT_HISTORICAL_LEVELS_STILL_ACTIVE:${activeOld.map((x) => x.levelNumber).join(",")}`
    );
  }

  for (const expected of ZERMATT_EMPLOYMENT_LEVELS_V3) {
    const live = activeV3.find((level) => level.levelNumber === expected.levelNumber);
    if (!live || live.code !== expected.code || live.name !== expected.name) {
      throw new Error(`ZERMATT_V3_LEVEL_MISMATCH:${expected.code}`);
    }
  }

  const designationErrors = [];
  for (const designation of designations) {
    const expected = resolveZermattV3DesignationLevel(designation);
    if (!expected || Number(designation.careerLevel) !== Number(expected.levelNumber)) {
      designationErrors.push({
        code: designation.code,
        name: designation.name,
        liveLevel: designation.careerLevel,
        expectedLevel: expected?.levelNumber || null,
      });
    }
  }
  if (designationErrors.length) {
    const error = new Error("ZERMATT_V3_DESIGNATION_MISMATCH");
    error.details = designationErrors;
    throw error;
  }

  if (!annualType || !annualPolicy) {
    throw new Error("ZERMATT_V3_ANNUAL_POLICY_NOT_CONFIGURED");
  }
  if (annualPolicy.entitlementRules?.hierarchyVersion !== "V3") {
    throw new Error("ZERMATT_V3_ANNUAL_POLICY_VERSION_MISMATCH");
  }

  const rules = await prisma.leaveEntitlementMatrixRule.findMany({
    where: {
      organizationId: organization.id,
      leavePolicyId: annualPolicy.id,
      leaveTypeId: annualType.id,
      isActive: true,
      levelNumber: { gte: 201, lte: 207 },
    },
    orderBy: { levelNumber: "asc" },
  });
  if (rules.length !== 7) {
    throw new Error(`ZERMATT_V3_ANNUAL_RULE_COUNT_INVALID:${rules.length}`);
  }

  for (const rule of rules) {
    const level = resolveZermattV3Level(rule.levelNumber);
    if (!level || Number(rule.defaultEntitlement) !== Number(level.annualLeaveDays)) {
      throw new Error(`ZERMATT_V3_ANNUAL_RULE_MISMATCH:${rule.levelNumber}`);
    }
  }

  console.log(JSON.stringify({
    status: "PASS",
    organization: organization.name,
    activeHierarchy: "V3",
    levels: activeV3.map((level) => ({
      code: level.code,
      name: level.name,
      internalLevelNumber: level.levelNumber,
      annualLeaveDays: resolveZermattV3Level(level.levelNumber)?.annualLeaveDays,
    })),
    designationsVerified: designations.length,
    annualPolicy: {
      id: annualPolicy.id,
      code: annualPolicy.code,
      versionNumber: annualPolicy.versionNumber,
      hierarchyVersion: annualPolicy.entitlementRules?.hierarchyVersion,
    },
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    if (error?.details) console.error(JSON.stringify(error.details, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
