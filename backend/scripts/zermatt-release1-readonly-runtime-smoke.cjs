require("dotenv").config({ quiet: true });

const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const prisma = require("../src/config/prisma");
const app = require("../src/app");

const ORGANIZATION_SLUG = "zermatt-liquor-limited";
const ADMIN_EMAIL = "corporatehr.crn@gmail.com";
const EMPLOYEE_NUMBER = "ZLL000087";
const DESIGNATION_CODE = "EXEC-PAES";
const LEAVE_YEAR = 2026;
const EXPECTED_ANNUAL_ENTITLEMENT = 21;

const EXPECTED_LEVELS = [
  [1, "Entry / Support"],
  [2, "Operational / Junior Staff"],
  [3, "Senior Support / Assistant"],
  [4, "Team Leader"],
  [5, "Supervisor"],
  [6, "Officer / Professional"],
  [7, "Senior Officer / Specialist"],
  [8, "Assistant Manager"],
  [9, "Manager"],
  [10, "Head / Senior Management"],
  [11, "Executive Management"],
];

function numeric(value) {
  return Number(value == null ? 0 : value);
}

async function jsonGet(baseUrl, path, token = null) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  return { path, status: response.status, ok: response.ok, body };
}

function assertSuccess(result) {
  assert.equal(
    result.ok,
    true,
    `${result.path} returned HTTP ${result.status}: ${JSON.stringify(result.body)}`
  );
  if (result.body && Object.prototype.hasOwnProperty.call(result.body, "status")) {
    assert.notEqual(result.body.status, "error", `${result.path} returned an application error.`);
  }
}

async function databaseGate() {
  const organization = await prisma.organization.findUnique({
    where: { slug: ORGANIZATION_SLUG },
    select: { id: true, name: true, status: true },
  });
  assert.ok(organization, "ZERMATT organization was not found.");
  assert.equal(organization.status, "ACTIVE", "ZERMATT organization must be ACTIVE.");

  const [levels, designationCount, employee, annualType, annualPolicy, actor] = await Promise.all([
    prisma.organizationEmploymentLevel.findMany({
      where: { organizationId: organization.id },
      orderBy: { levelNumber: "asc" },
      select: { levelNumber: true, name: true },
    }),
    prisma.designation.count({ where: { organizationId: organization.id } }),
    prisma.employee.findFirst({
      where: { organizationId: organization.id, employeeNumber: EMPLOYEE_NUMBER },
      include: { designation: true },
    }),
    prisma.leaveType.findFirst({
      where: { organizationId: organization.id, code: "ANNUAL" },
      select: { id: true, code: true },
    }),
    prisma.leavePolicy.findFirst({
      where: { organizationId: organization.id, code: "ZLL-ANNUAL-FT" },
      orderBy: { versionNumber: "desc" },
      select: { id: true, code: true, versionNumber: true, status: true },
    }),
    prisma.user.findFirst({
      where: { organizationId: organization.id, email: ADMIN_EMAIL, isActive: true },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: { include: { permission: true } },
              },
            },
          },
        },
      },
    }),
  ]);

  assert.deepEqual(
    levels.map((row) => [row.levelNumber, row.name]),
    EXPECTED_LEVELS,
    "ZERMATT L1-L11 hierarchy drifted from the accepted Release-1 hierarchy."
  );
  assert.equal(designationCount, 120, "ZERMATT designation catalogue must contain exactly 120 accepted designations.");

  assert.ok(employee, `${EMPLOYEE_NUMBER} was not found.`);
  assert.equal(employee.designation?.code, DESIGNATION_CODE, `${EMPLOYEE_NUMBER} must remain assigned to ${DESIGNATION_CODE}.`);
  assert.equal(employee.designation?.careerLevel, 7, `${DESIGNATION_CODE} must remain at L7.`);
  assert.ok(annualType, "ZERMATT ANNUAL leave type was not found.");
  assert.ok(annualPolicy, "ZERMATT Full-Time annual leave policy was not found.");

  const [balance, latestAllocation] = await Promise.all([
    prisma.leaveBalance.findFirst({
      where: {
        organizationId: organization.id,
        employeeId: employee.id,
        leaveTypeId: annualType.id,
        leaveYear: LEAVE_YEAR,
      },
    }),
    prisma.leaveEntitlementAllocation.findFirst({
      where: {
        organizationId: organization.id,
        employeeId: employee.id,
        leavePolicyId: annualPolicy.id,
        leaveYear: LEAVE_YEAR,
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  assert.ok(balance, `${EMPLOYEE_NUMBER} ${LEAVE_YEAR} annual LeaveBalance was not found.`);
  assert.equal(numeric(balance.openingBalance), EXPECTED_ANNUAL_ENTITLEMENT, `${EMPLOYEE_NUMBER} annual opening balance must remain 21.`);
  assert.equal(numeric(balance.used), 0, `${EMPLOYEE_NUMBER} annual used balance changed unexpectedly.`);
  assert.ok(latestAllocation, `${EMPLOYEE_NUMBER} latest annual allocation was not found.`);
  assert.equal(latestAllocation.levelNumber, 7, `${EMPLOYEE_NUMBER} latest annual allocation must resolve to L7.`);
  assert.equal(numeric(latestAllocation.allocatedEntitlement), EXPECTED_ANNUAL_ENTITLEMENT, `${EMPLOYEE_NUMBER} latest annual allocation must be 21.`);

  assert.ok(actor, "Active ZERMATT CHRIS Administrator account was not found.");
  const roles = actor.userRoles.map((item) => item.role.name);
  const permissions = new Set(
    actor.userRoles.flatMap((item) => item.role.rolePermissions.map((entry) => entry.permission.key))
  );
  assert.ok(roles.includes("Head of HR & Admin"), "CHRIS Administrator must retain the Head of HR & Admin role.");
  assert.ok(permissions.has("payroll.view"), "CHRIS Administrator must retain payroll.view for Release-1 smoke validation.");

  return {
    organization,
    actor,
    roles,
    permissionCount: permissions.size,
    designationCount,
    employee,
    annualPolicy,
    balance,
    latestAllocation,
  };
}

async function main() {
  assert.ok(process.env.JWT_SECRET, "JWT_SECRET is required for the local read-only runtime smoke gate.");
  assert.equal(typeof fetch, "function", "This smoke gate requires a Node.js runtime with built-in fetch support.");

  const state = await databaseGate();
  const token = jwt.sign(
    { userId: state.actor.id, organizationId: state.organization.id },
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
    const endpointPaths = [
      "/api/payroll/readiness",
      "/api/payroll/compliance-policy",
      "/api/payroll/periods",
      "/api/payroll/salary-rates",
      "/api/payroll/allowances",
      "/api/payroll/deductions",
      "/api/payroll/salary-advances",
      "/api/payroll/salary-advances/control-capabilities",
      "/api/payroll/runs",
      "/api/payroll/payslips",
      "/api/payroll/approvals",
      "/api/loans/summary",
      "/api/loans/policies",
      "/api/loans",
      "/api/loans/recoveries",
    ];

    const health = await jsonGet(baseUrl, "/health");
    assertSuccess(health);
    assert.equal(health.body?.message, "CHRIS API is running", "Health endpoint returned an unexpected payload.");

    const results = [];
    for (const path of endpointPaths) {
      const result = await jsonGet(baseUrl, path, token);
      assertSuccess(result);
      results.push(result);
    }

    const byPath = new Map(results.map((result) => [result.path, result]));
    const readiness = byPath.get("/api/payroll/readiness")?.body?.data;
    assert.ok(readiness?.summary?.currentEmployees > 0, "Payroll readiness did not return the current ZERMATT workforce.");
    assert.equal(readiness?.summary?.statutoryPolicyConfigured, true, "ZERMATT active statutory payroll policy is not configured.");

    const compliance = byPath.get("/api/payroll/compliance-policy")?.body?.data;
    assert.equal(compliance?.configured, true, "Nigeria payroll compliance policy is not active for ZERMATT.");

    const capabilities = byPath.get("/api/payroll/salary-advances/control-capabilities")?.body?.data;
    assert.equal(capabilities?.canCancelDelete, true, "CHRIS Administrator does not have the accepted ZERMATT salary-advance Super User control.");

    const output = {
      mode: "READ_ONLY_RUNTIME_SMOKE",
      schedulerStartup: false,
      writeRequestsIssued: 0,
      organization: state.organization.name,
      actor: {
        email: state.actor.email,
        roles: state.roles,
        permissionCount: state.permissionCount,
      },
      database: {
        employmentLevels: EXPECTED_LEVELS.length,
        designationCount: state.designationCount,
        execPaes: {
          employeeNumber: state.employee.employeeNumber,
          designationCode: state.employee.designation.code,
          careerLevel: state.employee.designation.careerLevel,
          annualPolicy: state.annualPolicy.code,
          annualOpeningBalance: numeric(state.balance.openingBalance),
          latestAllocationLevel: state.latestAllocation.levelNumber,
          latestAllocatedEntitlement: numeric(state.latestAllocation.allocatedEntitlement),
        },
      },
      http: {
        health: health.status,
        protectedGetEndpointsChecked: results.length,
        allSucceeded: results.every((result) => result.ok),
        endpoints: results.map((result) => ({ path: result.path, status: result.status })),
      },
    };

    console.log(JSON.stringify(output, null, 2));
    console.log("PASS: ZERMATT Release-1 read-only runtime smoke gate passed.");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error(error?.stack || error);
  try { await prisma.$disconnect(); } catch {}
  process.exitCode = 1;
});
