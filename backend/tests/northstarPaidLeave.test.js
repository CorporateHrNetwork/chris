const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { PGlite } = require("@electric-sql/pglite");
const { loadPayrollLeave, calculateLeavePayableDays } = require("../src/services/payrollLeaveService");

test("Northstar seed adds two approved samples and charges leave balances only once", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE organizations (id text PRIMARY KEY, slug text);
      CREATE TABLE employees (id text PRIMARY KEY, "organizationId" text, "employeeNumber" text);
      CREATE TABLE leave_types (id text PRIMARY KEY, "organizationId" text, name text, code text, "isPaid" boolean, "updatedAt" timestamp);
      CREATE TABLE leave_policies (id text PRIMARY KEY, "organizationId" text, "leaveTypeId" text, name text, "entitlementDays" numeric, "effectiveFrom" date, "updatedAt" timestamp);
      CREATE TABLE leave_requests (id text PRIMARY KEY, "organizationId" text, "employeeId" text, "leaveTypeId" text,
        "leavePolicyId" text, "startDate" date, "endDate" date, "requestedUnits" int, status text, reason text,
        "reviewNotes" text, "reviewedAt" timestamp, "updatedAt" timestamp);
      CREATE TABLE leave_balances (id text PRIMARY KEY, "organizationId" text, "employeeId" text, "leaveTypeId" text,
        "leaveYear" int, "openingBalance" numeric, used int, "updatedAt" timestamp,
        UNIQUE ("organizationId","employeeId","leaveTypeId","leaveYear"));
      CREATE TABLE payroll_periods (id text, "organizationId" text, "periodStart" date, "periodEnd" date);
      CREATE TABLE payroll_runs ("organizationId" text, "periodId" text, status text, "statutoryStatus" text, "updatedAt" timestamp);
      INSERT INTO organizations VALUES ('chris-demo-org-20261022','chris-demo-company'),('other','other-company');
      INSERT INTO employees VALUES ('amina','chris-demo-org-20261022','NSD0001'),('daniel','chris-demo-org-20261022','NSD0002'),('other','other','NSD0001');
    `);
    const migration = readFileSync(join(__dirname, "../prisma/migrations/20261111150000_northstar_demo_paid_leave/migration.sql"), "utf8");
    await db.exec(migration);
    await db.exec(migration);
    assert.deepEqual((await db.query('SELECT "employeeId","requestedUnits",status FROM leave_requests ORDER BY "employeeId"')).rows, [
      { employeeId: "amina", requestedUnits: 5, status: "APPROVED" },
      { employeeId: "daniel", requestedUnits: 4, status: "APPROVED" },
    ]);
    assert.deepEqual((await db.query("SELECT used FROM leave_balances ORDER BY used")).rows, [{ used: 4 }, { used: 5 }]);
  } finally {
    await db.close();
  }
});

test("payroll preserves paid leave, prorates unpaid leave once and allocates spanning requests", async () => {
  assert.equal(calculateLeavePayableDays({ standardDays: 26, workedDays: 21, paidDays: 5, unpaidDays: 0 }), 26);
  assert.equal(calculateLeavePayableDays({ standardDays: 26, workedDays: 22, paidDays: 4, unpaidDays: 0 }), 26);
  assert.equal(calculateLeavePayableDays({ standardDays: 26, workedDays: null, paidDays: 5, unpaidDays: 0 }), 26);
  assert.equal(calculateLeavePayableDays({ standardDays: 26, workedDays: null, paidDays: 0, unpaidDays: 4 }), 22);
  assert.equal(calculateLeavePayableDays({ standardDays: 26, workedDays: 22, paidDays: 0, unpaidDays: 4 }), 22);
  const prismaClient = {
    leaveRequest: { findMany: async ({ where }) => {
      assert.deepEqual(where.status.in, ["APPROVED", "ACTIVE", "COMPLETED"]);
      return [{ id: "spanning", requestedUnits: 5, startDate: new Date("2026-11-27"), endDate: new Date("2026-12-03") }];
    } },
    publicHoliday: { findMany: async () => [] },
  };
  const [november] = await loadPayrollLeave({ prismaClient, organizationId: "demo", period: { periodStart: "2026-11-01", periodEnd: "2026-11-30" } });
  assert.equal(november.periodUnits, 2);
});
