require("dotenv").config({ quiet: true });

const assert = require("node:assert/strict");
const prisma = require("../src/config/prisma");
const {
  resolveEffectiveEmploymentLevel,
} = require("../src/services/employeeEmploymentLevelAssignmentService");

const ORGANIZATION_SLUG = "zermatt-liquor-limited";
const LEAVE_YEAR = 2026;
const CURRENT_STATUSES = ["ACTIVE", "PROBATION", "LEAVE", "SUSPENDED"];

const EXPECTED_V2_LEVELS = [
  [101, "L1", "Entry / Support / Junior Officer", 14],
  [102, "L2", "Team Leader", 14],
  [103, "L3", "Supervisors / Officers / Executive Assistant / Executive Secretary", 21],
  [104, "L4", "Assistant Manager", 22],
  [105, "L5", "Junior Manager / Manager", 24],
  [106, "L6", "Head / Senior Management", 28],
  [107, "L7", "Executive Management", 30],
];

function numeric(value) {
  return Number(value == null ? 0 : value);
}

async function getAnnualBalance(organizationId, employeeId) {
  const annualType = await prisma.leaveType.findFirst({
    where: { organizationId, code: "ANNUAL" },
    select: { id: true },
  });
  assert.ok(annualType, "ZERMATT ANNUAL leave type was not found.");

  return prisma.leaveBalance.findFirst({
    where: {
      organizationId,
      employeeId,
      leaveTypeId: annualType.id,
      leaveYear: LEAVE_YEAR,
    },
  });
}

async function main() {
  const organization = await prisma.organization.findUnique({
    where: { slug: ORGANIZATION_SLUG },
    select: { id: true, name: true, status: true },
  });
  assert.ok(organization, "ZERMATT organization was not found.");
  assert.equal(organization.status, "ACTIVE", "ZERMATT organization must remain ACTIVE.");

  const [
    activeLevels,
    inactiveV1Levels,
    designationCount,
    currentEmployeeCount,
    levelAssignmentCount,
    currentLineManagerAssignments,
    esther,
    nwigwe,
  ] = await Promise.all([
    prisma.organizationEmploymentLevel.findMany({
      where: { organizationId: organization.id, isActive: true },
      orderBy: { displayOrder: "asc" },
      select: {
        levelNumber: true,
        code: true,
        name: true,
        description: true,
        displayOrder: true,
      },
    }),
    prisma.organizationEmploymentLevel.count({
      where: {
        organizationId: organization.id,
        isActive: false,
        levelNumber: { in: [1,2,3,4,5,6,7,8,9,10,11] },
      },
    }),
    prisma.designation.count({ where: { organizationId: organization.id } }),
    prisma.employee.count({
      where: {
        organizationId: organization.id,
        status: { in: CURRENT_STATUSES },
        exitDate: null,
      },
    }),
    prisma.employeeEmploymentLevelAssignment.count({
      where: { organizationId: organization.id },
    }),
    prisma.employeeLineManagerAssignment.count({
      where: { organizationId: organization.id, effectiveTo: null },
    }),
    prisma.employee.findFirst({
      where: { organizationId: organization.id, employeeNumber: "ZLL000087" },
      include: { designation: true },
    }),
    prisma.employee.findFirst({
      where: { organizationId: organization.id, employeeNumber: "ZLL000119" },
      include: { designation: true },
    }),
  ]);

  assert.equal(activeLevels.length, 7, "ZERMATT must have exactly seven active V2 Employment Levels.");
  assert.deepEqual(
    activeLevels.map((level) => [level.levelNumber, level.code, level.name]),
    EXPECTED_V2_LEVELS.map(([levelNumber, code, name]) => [levelNumber, code, name]),
    "ZERMATT active V2 Employment Level catalogue drifted."
  );
  assert.equal(inactiveV1Levels, 11, "All eleven historical V1 Employment Levels must remain inactive.");
  assert.equal(designationCount, 120, "ZERMATT designation catalogue must remain at 120 records.");
  assert.equal(currentEmployeeCount, 312, "ZERMATT current employee count changed unexpectedly.");
  assert.equal(
    levelAssignmentCount,
    0,
    "The schema migration must not create employee-specific Employment Level overrides."
  );
  assert.equal(
    currentLineManagerAssignments,
    1,
    "The schema migration must not alter existing current Line Manager assignments."
  );

  assert.ok(esther, "ZLL000087 Ifechukwudelu Esther Anagor was not found.");
  assert.equal(esther.designation?.code, "EXEC-PAES", "Esther designation drifted from EXEC-PAES.");
  assert.equal(esther.designation?.careerLevel, 103, "Esther designation default must remain V2 L3/internal 103.");

  assert.ok(nwigwe, "ZLL000119 Nwigwe Jude Ogechukwu was not found.");
  assert.equal(nwigwe.designation?.code, "AIC-HOD", "Nwigwe designation must remain AIC-HOD.");
  assert.equal(nwigwe.designation?.careerLevel, 106, "Nwigwe designation default must remain V2 L6/internal 106.");

  const [estherEffective, nwigweEffective, estherAnnual, nwigweAnnual] = await Promise.all([
    resolveEffectiveEmploymentLevel(prisma, {
      organizationId: organization.id,
      employeeId: esther.id,
    }),
    resolveEffectiveEmploymentLevel(prisma, {
      organizationId: organization.id,
      employeeId: nwigwe.id,
    }),
    getAnnualBalance(organization.id, esther.id),
    getAnnualBalance(organization.id, nwigwe.id),
  ]);

  assert.equal(estherEffective.source, "DESIGNATION_DEFAULT", "Esther should initially resolve from designation default.");
  assert.equal(estherEffective.levelNumber, 103, "Esther effective level must resolve to V2 L3/internal 103.");
  assert.equal(nwigweEffective.source, "DESIGNATION_DEFAULT", "Nwigwe should initially resolve from designation default.");
  assert.equal(nwigweEffective.levelNumber, 106, "Nwigwe effective level must resolve to V2 L6/internal 106.");

  assert.ok(estherAnnual, "Esther 2026 Annual Leave balance was not found.");
  assert.ok(nwigweAnnual, "Nwigwe 2026 Annual Leave balance was not found.");
  assert.equal(numeric(estherAnnual.openingBalance), 21, "Esther 2026 Annual Leave opening balance must remain 21.");
  assert.equal(numeric(nwigweAnnual.openingBalance), 28, "Nwigwe 2026 Annual Leave opening balance must remain 28.");

  console.log("\n============================================================");
  console.log("ZERMATT EMPLOYMENT GOVERNANCE — POST-MIGRATION VERIFICATION");
  console.log("============================================================");
  console.log(JSON.stringify({
    mode: "READ_ONLY_POST_MIGRATION_VERIFY",
    organization: organization.name,
    activeV2Levels: activeLevels.length,
    inactiveV1Levels,
    designations: designationCount,
    currentEmployees: currentEmployeeCount,
    employeeSpecificLevelAssignments: levelAssignmentCount,
    currentLineManagerAssignments,
    esther: {
      employeeNumber: esther.employeeNumber,
      designation: esther.designation?.name,
      designationCode: esther.designation?.code,
      effectiveLevel: estherEffective.employmentLevel?.code,
      effectiveLevelName: estherEffective.employmentLevel?.name,
      source: estherEffective.source,
      annualLeaveOpeningBalance: numeric(estherAnnual.openingBalance),
    },
    nwigwe: {
      employeeNumber: nwigwe.employeeNumber,
      designation: nwigwe.designation?.name,
      designationCode: nwigwe.designation?.code,
      effectiveLevel: nwigweEffective.employmentLevel?.code,
      effectiveLevelName: nwigweEffective.employmentLevel?.name,
      source: nwigweEffective.source,
      annualLeaveOpeningBalance: numeric(nwigweAnnual.openingBalance),
    },
    databaseWrites: 0,
  }, null, 2));
  console.log("PASS: ZERMATT Employment Governance post-migration verification passed.");
  console.log("============================================================");
}

main()
  .catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
