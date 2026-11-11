const test = require("node:test");
const assert = require("node:assert/strict");
const { PGlite } = require("@electric-sql/pglite");
const { NORTHSTAR_ID } = require("../src/middleware/salesDemoBoundary");
const {
  loadPayrollSalaryAdvances,
  assertNorthstarAdvancePeriodEditable,
} = require("../src/services/salaryAdvancePayrollService");

test("Northstar recovers an advance in full during its grant month and locks submitted payroll inputs", async () => {
  const db = new PGlite();
  const client = { $queryRawUnsafe: async (sql, ...args) => (await db.query(sql, args)).rows };
  try {
    await db.exec(`
      CREATE TABLE payroll_salary_advances (id text, "organizationId" text, "employeeId" text,
        "outstandingAmount" numeric, "installmentAmount" numeric, "issuedDate" date, "recoveryStartDate" date, status text);
      CREATE TABLE payroll_periods (id text, "organizationId" text, "periodStart" date, "periodEnd" date, status text);
      CREATE TABLE payroll_runs ("periodId" text, "organizationId" text, status text);
    `);
    await db.query(`
      INSERT INTO payroll_salary_advances VALUES
        ('northstar-advance',$1,'demo-employee',30000,5000,'2026-11-15','2026-11-15','ACTIVE'),
        ('other-advance','other-org','other-employee',30000,5000,'2026-11-15','2026-11-15','ACTIVE')
    `, [NORTHSTAR_ID]);
    assert.deepEqual(await loadPayrollSalaryAdvances(client, NORTHSTAR_ID, "2026-10-31"), []);
    const [grantMonth] = await loadPayrollSalaryAdvances(client, NORTHSTAR_ID, "2026-11-30");
    assert.equal(Number(grantMonth.installmentAmount), 30000);
    assert.deepEqual(await loadPayrollSalaryAdvances(client, NORTHSTAR_ID, "2026-12-31"), []);
    const [otherOrg] = await loadPayrollSalaryAdvances(client, "other-org", "2026-12-31");
    assert.equal(Number(otherOrg.installmentAmount), 5000);

    await db.query("INSERT INTO payroll_periods VALUES ('nov',$1,'2026-11-01','2026-11-30','OPEN')", [NORTHSTAR_ID]);
    await assertNorthstarAdvancePeriodEditable(client, NORTHSTAR_ID, "2026-11-15");
    await db.query("INSERT INTO payroll_runs VALUES ('nov',$1,'PENDING_APPROVAL')", [NORTHSTAR_ID]);
    await assert.rejects(assertNorthstarAdvancePeriodEditable(client, NORTHSTAR_ID, "2026-11-15"), {
      code: "SALARY_ADVANCE_PAYROLL_LOCKED",
    });
  } finally {
    await db.close();
  }
});
