require("dotenv").config({ quiet: true });

const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const app = require("../src/app");
const prisma = require("../src/config/prisma");

const ORGANIZATION_SLUG = "zermatt-liquor-limited";
const ADMIN_EMAIL = "corporatehr.crn@gmail.com";
const CURRENT_STATUSES = ["ACTIVE", "PROBATION", "LEAVE", "SUSPENDED"];
const EXPECTED_RELEASE1 = {
  consolidated: 312,
  branches: {
    ABJ: 144,
    LAG: 74,
    PHC: 94,
  },
};

async function requestJson(baseUrl, path, token, locationId = null) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(locationId ? { "X-CHRiS-Location-Id": locationId } : {}),
    },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  return { path, locationId, status: response.status, ok: response.ok, body };
}

function assertSuccess(result) {
  assert.equal(
    result.ok,
    true,
    `${result.path} (${result.locationId || "HEAD OFFICE"}) returned HTTP ${result.status}: ${JSON.stringify(result.body)}`
  );
  assert.notEqual(result.body?.status, "error", `${result.path} returned an application error.`);
}

function assertEvery(rows, predicate, message) {
  for (const row of rows || []) assert.ok(predicate(row), message);
}

async function main() {
  assert.ok(process.env.JWT_SECRET, "JWT_SECRET is required for the branch-context verifier.");
  assert.equal(typeof fetch, "function", "This verifier requires Node.js with built-in fetch support.");

  const organization = await prisma.organization.findUnique({
    where: { slug: ORGANIZATION_SLUG },
    select: { id: true, name: true, status: true },
  });
  assert.ok(organization, "ZERMATT organization was not found.");
  assert.equal(organization.status, "ACTIVE", "ZERMATT organization must remain ACTIVE.");

  const [actor, locations, allEmployees] = await Promise.all([
    prisma.user.findFirst({
      where: { organizationId: organization.id, email: ADMIN_EMAIL, isActive: true },
      select: { id: true, email: true, locationScope: true },
    }),
    prisma.organizationLocation.findMany({
      where: { organizationId: organization.id, isActive: true },
      orderBy: [{ type: "asc" }, { name: "asc" }],
      select: { id: true, name: true, code: true, type: true, city: true, state: true },
    }),
    prisma.employee.count({ where: { organizationId: organization.id } }),
  ]);

  assert.ok(actor, "Active ZERMATT CHRIS Administrator account was not found.");
  assert.equal(
    actor.locationScope,
    "ALL_LOCATIONS",
    "ZERMATT Super User must have ALL_LOCATIONS scope to switch freely between branches."
  );

  const headOffice = locations.find(
    (location) => String(location.type || "").toUpperCase() === "HEAD_OFFICE"
  );
  const branches = locations.filter(
    (location) => String(location.type || "").toUpperCase() === "BRANCH"
  );

  assert.ok(headOffice, "ZERMATT Head Office location metadata was not found.");
  assert.equal(branches.length, 3, "ZERMATT must expose exactly three operating branches in Release-1.");
  assert.equal(allEmployees, EXPECTED_RELEASE1.consolidated, "Head Office consolidated headcount must be 312 for this Release-1 gate.");
  assert.deepEqual(
    branches.map((location) => location.code).sort(),
    ["ABJ", "LAG", "PHC"],
    "Only Abuja, Lagos and PHC should be selectable branches."
  );

  const token = jwt.sign(
    { userId: actor.id, organizationId: organization.id },
    process.env.JWT_SECRET,
    { expiresIn: "5m" }
  );

  const server = await new Promise((resolve, reject) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    instance.once("error", reject);
  });

  try {
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;

    // HEAD OFFICE is the consolidated company context and carries no location header.
    const [
      headOfficeContext,
      consolidatedEmployees,
      consolidatedWorkforce,
      consolidatedPayrollReadiness,
      consolidatedReport,
    ] = await Promise.all([
      requestJson(baseUrl, "/api/zermatt/branch-context", token),
      requestJson(baseUrl, "/api/employees", token),
      requestJson(baseUrl, "/api/analytics/workforce", token),
      requestJson(baseUrl, "/api/payroll/readiness", token),
      requestJson(baseUrl, "/api/employee-reports/workforce", token),
    ]);
    [
      headOfficeContext,
      consolidatedEmployees,
      consolidatedWorkforce,
      consolidatedPayrollReadiness,
      consolidatedReport,
    ].forEach(assertSuccess);

    assert.equal(headOfficeContext.body?.data?.activeLocationId, null, "HEAD OFFICE must not carry a branch location ID.");
    assert.equal(consolidatedEmployees.body?.results, EXPECTED_RELEASE1.consolidated, "HEAD OFFICE must show all 312 ZERMATT employees.");
    assert.equal(
      consolidatedWorkforce.body?.data?.headcount?.historicalIdentities,
      EXPECTED_RELEASE1.consolidated,
      "HEAD OFFICE dashboard headcount KPI must be 312."
    );
    assert.equal(
      consolidatedReport.body?.results,
      EXPECTED_RELEASE1.consolidated,
      "HEAD OFFICE workforce report must include all 312 employees."
    );

    // A stale/manual physical HEAD_OFFICE location ID must normalize to the
    // same 312-person consolidated business context.
    const physicalHeadOffice = await requestJson(baseUrl, "/api/employees", token, headOffice.id);
    assertSuccess(physicalHeadOffice);
    assert.equal(
      physicalHeadOffice.body?.results,
      EXPECTED_RELEASE1.consolidated,
      "Physical Head Office location ID must normalize to consolidated 312-person context."
    );

    const branchResults = [];
    for (const location of branches) {
      const expectedHeadcount = EXPECTED_RELEASE1.branches[location.code];
      assert.ok(expectedHeadcount, `Unexpected ZERMATT branch code ${location.code}.`);

      const [
        expectedAllEmployees,
        expectedCurrentWithNoExit,
        expectedCurrentByStatus,
        branchEmployees,
      ] = await Promise.all([
        prisma.employee.count({ where: { organizationId: organization.id, locationId: location.id } }),
        prisma.employee.count({
          where: {
            organizationId: organization.id,
            locationId: location.id,
            status: { in: CURRENT_STATUSES },
            exitDate: null,
          },
        }),
        prisma.employee.count({
          where: {
            organizationId: organization.id,
            locationId: location.id,
            status: { in: CURRENT_STATUSES },
          },
        }),
        prisma.employee.findMany({
          where: { organizationId: organization.id, locationId: location.id },
          select: { id: true, employeeNumber: true },
        }),
      ]);
      const branchEmployeeIds = new Set(branchEmployees.map((row) => row.id));
      const branchEmployeeNumbers = new Set(branchEmployees.map((row) => row.employeeNumber));

      const [
        context,
        employeeDirectory,
        lineManagerEmployees,
        payrollEmployees,
        zermattEmployees,
        workforce,
        leaveOverview,
        leaveRequests,
        attendanceReport,
        payrollReadiness,
        salaryAdvances,
        payrollRuns,
        loans,
        loanSummary,
        workforceReport,
        exitRegister,
      ] = await Promise.all([
        requestJson(baseUrl, "/api/zermatt/branch-context", token, location.id),
        requestJson(baseUrl, "/api/employees", token, location.id),
        requestJson(baseUrl, "/api/line-managers/eligible", token, location.id),
        requestJson(baseUrl, "/api/payroll/employee-options", token, location.id),
        requestJson(baseUrl, "/api/zermatt/employee-options", token, location.id),
        requestJson(baseUrl, "/api/analytics/workforce", token, location.id),
        requestJson(baseUrl, "/api/leave/overview", token, location.id),
        requestJson(baseUrl, "/api/leave/requests", token, location.id),
        requestJson(baseUrl, "/api/attendance/report", token, location.id),
        requestJson(baseUrl, "/api/payroll/readiness", token, location.id),
        requestJson(baseUrl, "/api/payroll/salary-advances", token, location.id),
        requestJson(baseUrl, "/api/payroll/runs", token, location.id),
        requestJson(baseUrl, "/api/loans", token, location.id),
        requestJson(baseUrl, "/api/loans/summary", token, location.id),
        requestJson(baseUrl, "/api/employee-reports/workforce", token, location.id),
        requestJson(baseUrl, "/api/exits/register", token, location.id),
      ]);

      [
        context,
        employeeDirectory,
        lineManagerEmployees,
        payrollEmployees,
        zermattEmployees,
        workforce,
        leaveOverview,
        leaveRequests,
        attendanceReport,
        payrollReadiness,
        salaryAdvances,
        payrollRuns,
        loans,
        loanSummary,
        workforceReport,
        exitRegister,
      ].forEach(assertSuccess);

      assert.equal(expectedAllEmployees, expectedHeadcount, `${location.name}: database headcount does not match accepted baseline.`);
      assert.equal(context.body?.data?.activeLocationId, location.id, `${location.name}: branch context was not preserved.`);
      assert.equal(employeeDirectory.body?.results, expectedHeadcount, `${location.name}: Employee Directory is not branch-scoped.`);
      assert.equal(
        workforce.body?.data?.headcount?.historicalIdentities,
        expectedHeadcount,
        `${location.name}: dashboard Total Employees KPI is not branch-scoped.`
      );
      assert.equal(
        workforce.body?.data?.headcount?.current,
        expectedCurrentByStatus,
        `${location.name}: dashboard current workforce KPI is not branch-scoped.`
      );
      assert.equal(lineManagerEmployees.body?.data?.length, expectedCurrentWithNoExit, `${location.name}: Line Manager selector is not branch-scoped.`);
      assert.equal(payrollEmployees.body?.data?.length, expectedCurrentByStatus, `${location.name}: Payroll employee selector is not branch-scoped.`);
      assert.equal(zermattEmployees.body?.data?.length, expectedCurrentByStatus, `${location.name}: ZERMATT employee selector is not branch-scoped.`);
      assert.equal(
        payrollReadiness.body?.data?.summary?.currentEmployees,
        expectedCurrentByStatus,
        `${location.name}: Payroll readiness is not branch-scoped.`
      );
      assert.equal(workforceReport.body?.results, expectedHeadcount, `${location.name}: Workforce report is not branch-scoped.`);
      assert.equal(workforce.body?.data?.locationContext?.locationId, location.id, `${location.name}: analytics context is wrong.`);

      assertEvery(
        leaveRequests.body?.data,
        (row) => branchEmployeeIds.has(row.employee?.id),
        `${location.name}: Leave Requests leaked an employee from another branch.`
      );
      assertEvery(
        attendanceReport.body?.data?.records,
        (row) => branchEmployeeNumbers.has(row.employee?.employeeNumber),
        `${location.name}: Attendance Report leaked another branch.`
      );
      assertEvery(
        salaryAdvances.body?.data,
        (row) => branchEmployeeNumbers.has(row.employeeNumber),
        `${location.name}: Salary Advances leaked another branch.`
      );
      assertEvery(
        loans.body?.data,
        (row) => row.workflowLocationId === location.id,
        `${location.name}: Loans leaked another branch.`
      );
      assertEvery(
        exitRegister.body?.data,
        (row) => row.location?.id === location.id,
        `${location.name}: Exit Register leaked another branch.`
      );

      assert.equal(
        leaveOverview.body?.locationContext?.locationId,
        location.id,
        `${location.name}: Leave Overview did not report branch context.`
      );
      assert.equal(
        loanSummary.body?.data?.locationContext?.locationId,
        location.id,
        `${location.name}: Loan Summary did not report branch context.`
      );
      assert.equal(
        payrollRuns.body?.locationContext?.locationId,
        location.id,
        `${location.name}: Payroll Runs did not report branch context.`
      );

      branchResults.push({
        locationId: location.id,
        location: location.name,
        code: location.code,
        employees: expectedAllEmployees,
        currentEmployees: expectedCurrentByStatus,
        leaveRequests: leaveRequests.body?.data?.length || 0,
        attendanceRecords: attendanceReport.body?.data?.records?.length || 0,
        salaryAdvances: salaryAdvances.body?.data?.length || 0,
        payrollRuns: payrollRuns.body?.data?.length || 0,
        loans: loans.body?.data?.length || 0,
        exits: exitRegister.body?.data?.length || 0,
      });
    }

    const forbidden = await requestJson(
      baseUrl,
      "/api/zermatt/branch-context",
      token,
      "00000000-0000-0000-0000-000000000000"
    );
    assert.equal(forbidden.status, 403, "Unknown branch ID must fail closed with HTTP 403.");
    assert.equal(forbidden.body?.code, "LOCATION_SCOPE_FORBIDDEN", "Unknown branch ID must fail with LOCATION_SCOPE_FORBIDDEN.");

    console.log("\n============================================================");
    console.log("ZERMATT SUPER USER — GLOBAL BRANCH CONTEXT VERIFICATION");
    console.log("============================================================");
    console.log(
      JSON.stringify(
        {
          mode: "READ_ONLY_BRANCH_CONTEXT_VERIFY",
          organization: organization.name,
          actor: actor.email,
          locationScope: actor.locationScope,
          headOffice: { mode: "CONSOLIDATED_COMPANY", employees: allEmployees },
          selectableBranches: branchResults,
          expectedContexts: 4,
          checkedSurfaces: [
            "Head Office consolidated context",
            "Dashboard workforce KPIs",
            "Employee Directory",
            "Line Managers",
            "Leave Overview / Requests",
            "Attendance Report",
            "Payroll Employee Selection / Readiness / Salary Advances / Runs",
            "Loans / Loan Summary",
            "Workforce Reports",
            "Exit Register",
            "ZERMATT Employee Options",
          ],
          unauthorizedLocationGuard: "PASS",
          databaseWrites: 0,
        },
        null,
        2
      )
    );
    console.log("PASS: ZERMATT Super User global branch context verification passed.");
    console.log("============================================================");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error(error?.stack || error);
  try {
    await prisma.$disconnect();
  } catch {}
  process.exitCode = 1;
});
