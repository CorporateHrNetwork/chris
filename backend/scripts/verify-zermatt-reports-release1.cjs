require("dotenv").config({ quiet: true });

const assert = require("node:assert/strict");
const prisma = require("../src/config/prisma");
const { getReportsRelease1 } = require("../src/services/reportsRelease1Service");

const ORGANIZATION_SLUG = "zermatt-liquor-limited";
const EXPECTED = {
  HEAD_OFFICE: 312,
  ABJ: 144,
  LAG: 74,
  PHC: 94,
};

async function main() {
  const organization = await prisma.organization.findUnique({
    where: { slug: ORGANIZATION_SLUG },
    select: { id: true, name: true, status: true },
  });
  assert.ok(organization, "ZERMATT organization was not found.");
  assert.equal(organization.status, "ACTIVE", "ZERMATT organization must be ACTIVE.");

  const locations = await prisma.organizationLocation.findMany({
    where: { organizationId: organization.id, isActive: true, type: "BRANCH" },
    select: { id: true, name: true, code: true, type: true },
    orderBy: { code: "asc" },
  });
  const branchByCode = new Map(locations.map((location) => [String(location.code || "").toUpperCase(), location]));
  assert.deepEqual(
    [...branchByCode.keys()].sort(),
    ["ABJ", "LAG", "PHC"],
    "ZERMATT Release-1 Reports must expose exactly ABJ, LAG and PHC operating branches."
  );

  const headOffice = await getReportsRelease1({
    organizationId: organization.id,
    locationId: null,
    prismaClient: prisma,
  });
  assert.equal(headOffice.scope.mode, "HEAD_OFFICE_CONSOLIDATED");
  assert.equal(headOffice.summary.currentWorkforce, EXPECTED.HEAD_OFFICE);
  assert.equal(headOffice.employees.length, EXPECTED.HEAD_OFFICE);
  assert.equal(headOffice.headcount.total, EXPECTED.HEAD_OFFICE);
  assert.equal(headOffice.branches.length, 3);
  assert.equal(
    headOffice.branches.reduce((sum, row) => sum + Number(row.currentWorkforce || 0), 0),
    EXPECTED.HEAD_OFFICE,
    "Branch report headcount must reconcile to Head Office current workforce."
  );

  const verifiedBranches = [];
  for (const code of ["ABJ", "LAG", "PHC"]) {
    const location = branchByCode.get(code);
    const report = await getReportsRelease1({
      organizationId: organization.id,
      locationId: location.id,
      prismaClient: prisma,
    });
    assert.equal(report.scope.mode, "BRANCH", `${code} report must be branch scoped.`);
    assert.equal(report.scope.locationCode, code, `${code} report context mismatch.`);
    assert.equal(report.summary.currentWorkforce, EXPECTED[code], `${code} current workforce mismatch.`);
    assert.equal(report.employees.length, EXPECTED[code], `${code} employee report row count mismatch.`);
    assert.equal(report.headcount.total, EXPECTED[code], `${code} headcount report mismatch.`);
    assert.equal(report.branches.length, 1, `${code} Branch Report must contain only the active branch.`);
    assert.equal(report.branches[0].code, code, `${code} Branch Report leaked another branch.`);
    assert.ok(
      report.employees.every((employee) => employee.branchCode === code),
      `${code} Employee Report contains an employee from another branch.`
    );
    verifiedBranches.push({
      code,
      branch: location.name,
      currentWorkforce: report.summary.currentWorkforce,
      employeeRows: report.employees.length,
      headcountTotal: report.headcount.total,
    });
  }

  console.log("\n============================================================");
  console.log("ZERMATT REPORTS & ANALYTICS RELEASE-1 — READ ONLY");
  console.log("============================================================");
  console.log(JSON.stringify({
    mode: "READ_ONLY_REPORTS_RELEASE1_VERIFY",
    organization: organization.name,
    headOffice: {
      mode: headOffice.scope.mode,
      currentWorkforce: headOffice.summary.currentWorkforce,
      employeeRows: headOffice.employees.length,
      branchRows: headOffice.branches.map((row) => ({ code: row.code, currentWorkforce: row.currentWorkforce })),
    },
    branches: verifiedBranches,
    checkedReports: [
      "Reports Dashboard",
      "Workforce Analytics",
      "Employee Reports",
      "Headcount Reports",
      "Branch Reports",
    ],
    databaseWrites: 0,
  }, null, 2));
  console.log("PASS: ZERMATT Reports & Analytics Release-1 branch isolation verification passed.");
  console.log("============================================================\n");
}

main()
  .catch((error) => {
    console.error("\nFAIL: ZERMATT Reports & Analytics Release-1 verification failed.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
