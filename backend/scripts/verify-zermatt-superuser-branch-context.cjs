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
      where: {
        organizationId: organization.id,
        email: ADMIN_EMAIL,
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        locationScope: true,
      },
    }),
    prisma.organizationLocation.findMany({
      where: { organizationId: organization.id, isActive: true },
      orderBy: [{ type: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        code: true,
        type: true,
        city: true,
        state: true,
      },
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

  const branchCodes = branches.map((location) => location.code).sort();
  assert.deepEqual(branchCodes, ["ABJ", "LAG", "PHC"], "Only Abuja, Lagos and PHC should be selectable branches.");

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
    const headOfficeContext = await requestJson(
      baseUrl,
      "/api/zermatt/branch-context",
      token
    );
    assertSuccess(headOfficeContext);
    assert.equal(
      headOfficeContext.body?.data?.activeLocationId,
      null,
      "HEAD OFFICE consolidated context must not carry a branch location ID."
    );

    const consolidatedEmployees = await requestJson(baseUrl, "/api/employees", token);
    const consolidatedWorkforce = await requestJson(baseUrl, "/api/analytics/workforce", token);
    assertSuccess(consolidatedEmployees);
    assertSuccess(consolidatedWorkforce);
    assert.equal(
      consolidatedEmployees.body?.results,
      EXPECTED_RELEASE1.consolidated,
      "HEAD OFFICE must show all 312 ZERMATT employees."
    );
    assert.equal(
      consolidatedWorkforce.body?.data?.headcount?.historicalIdentities,
      EXPECTED_RELEASE1.consolidated,
      "HEAD OFFICE dashboard headcount KPI must be 312."
    );

    // A stale/manual request for the physical Head Office location row must
    // normalize back to the same 312-person consolidated operating context.
    const physicalHeadOffice = await requestJson(
      baseUrl,
      "/api/employees",
      token,
      headOffice.id
    );
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
        context,
        employeeDirectory,
        lineManagerEmployees,
        payrollEmployees,
        zermattEmployees,
        workforce,
      ] = await Promise.all([
        prisma.employee.count({
          where: { organizationId: organization.id, locationId: location.id },
        }),
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
        requestJson(baseUrl, "/api/zermatt/branch-context", token, location.id),
        requestJson(baseUrl, "/api/employees", token, location.id),
        requestJson(baseUrl, "/api/line-managers/eligible", token, location.id),
        requestJson(baseUrl, "/api/payroll/employee-options", token, location.id),
        requestJson(baseUrl, "/api/zermatt/employee-options", token, location.id),
        requestJson(baseUrl, "/api/analytics/workforce", token, location.id),
      ]);

      [context, employeeDirectory, lineManagerEmployees, payrollEmployees, zermattEmployees, workforce].forEach(assertSuccess);

      assert.equal(expectedAllEmployees, expectedHeadcount, `${location.name}: database headcount does not match the accepted Release-1 baseline.`);
      assert.equal(
        context.body?.data?.activeLocationId,
        location.id,
        `${location.name}: branch-context endpoint did not preserve the selected branch.`
      );
      assert.equal(
        employeeDirectory.body?.results,
        expectedHeadcount,
        `${location.name}: Employee Directory is not branch-scoped.`
      );
      assert.equal(
        workforce.body?.data?.headcount?.historicalIdentities,
        expectedHeadcount,
        `${location.name}: dashboard workforce headcount KPI is not branch-scoped.`
      );
      assert.equal(
        lineManagerEmployees.body?.data?.length,
        expectedCurrentWithNoExit,
        `${location.name}: Line Manager employee selector is not branch-scoped.`
      );
      assert.equal(
        payrollEmployees.body?.data?.length,
        expectedCurrentByStatus,
        `${location.name}: Payroll employee selector is not branch-scoped.`
      );
      assert.equal(
        zermattEmployees.body?.data?.length,
        expectedCurrentByStatus,
        `${location.name}: ZERMATT operational employee selector is not branch-scoped.`
      );
      assert.equal(
        workforce.body?.data?.locationContext?.locationId,
        location.id,
        `${location.name}: Workforce analytics did not report the active branch.`
      );

      branchResults.push({
        locationId: location.id,
        location: location.name,
        code: location.code,
        employees: expectedAllEmployees,
        currentEmployees: expectedCurrentByStatus,
      });
    }

    const forbidden = await requestJson(
      baseUrl,
      "/api/zermatt/branch-context",
      token,
      "00000000-0000-0000-0000-000000000000"
    );
    assert.equal(forbidden.status, 403, "Unknown branch ID must fail closed with HTTP 403.");
    assert.equal(
      forbidden.body?.code,
      "LOCATION_SCOPE_FORBIDDEN",
      "Unknown branch ID must fail with LOCATION_SCOPE_FORBIDDEN."
    );

    console.log("\n============================================================");
    console.log("ZERMATT SUPER USER — GLOBAL BRANCH CONTEXT VERIFICATION");
    console.log("============================================================");
    console.log(JSON.stringify({
      mode: "READ_ONLY_BRANCH_CONTEXT_VERIFY",
      organization: organization.name,
      actor: actor.email,
      locationScope: actor.locationScope,
      headOffice: {
        mode: "CONSOLIDATED_COMPANY",
        employees: allEmployees,
      },
      selectableBranches: branchResults,
      expectedContexts: 4,
      checkedSurfaces: [
        "Head Office consolidated context",
        "Branch Context",
        "Dashboard workforce KPIs",
        "Employee Directory",
        "Line Managers",
        "Payroll Employee Selection",
        "ZERMATT Employee Options",
        "Workforce Analytics",
      ],
      unauthorizedLocationGuard: "PASS",
      databaseWrites: 0,
    }, null, 2));
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
