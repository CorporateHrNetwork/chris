const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { PGlite } = require("@electric-sql/pglite");

test("timed pause skips payroll months, resumes on schedule and completes on final repayment", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE organizations (id text PRIMARY KEY, slug text);
      CREATE TABLE payroll_periods (id text, "organizationId" text, "periodStart" date, "periodEnd" date, "payDate" date);
      CREATE TABLE payroll_runs (id text PRIMARY KEY, "organizationId" text, "periodId" text, status text);
      CREATE TABLE payroll_run_lines (id text PRIMARY KEY, "organizationId" text, "runId" text, "employeeId" text, "grossPay" numeric, deductions numeric, "advanceRecovery" numeric, "loanRecovery" numeric, "netPreview" numeric, details jsonb);
      CREATE TABLE payroll_loans (id text PRIMARY KEY, "organizationId" text, "employeeId" text, "loanNumber" text, "recoveryStartDate" date, "disbursedDate" date, "outstandingAmount" numeric, "installmentAmount" numeric, status text, "updatedAt" timestamp);
      CREATE TABLE payroll_loan_recoveries (id text PRIMARY KEY, "organizationId" text, "loanId" text, "employeeId" text, "runId" text, "runLineId" text, amount numeric, "recoveryDate" date, status text, UNIQUE("loanId","runId"));
      INSERT INTO organizations VALUES ('northstar','chris-demo-company');
      INSERT INTO payroll_periods VALUES ('nov','northstar','2026-11-01','2026-11-30',NULL),('dec','northstar','2026-12-01','2026-12-31',NULL),('jan','northstar','2027-01-01','2027-01-31',NULL);
      INSERT INTO payroll_runs VALUES ('nov','northstar','nov','DRAFT'),('dec','northstar','dec','DRAFT'),('jan','northstar','jan','DRAFT');
      INSERT INTO payroll_loans VALUES ('loan','northstar','e','LN1','2026-10-01','2026-10-01',25000,25000,'ACTIVE',now());
    `);
    await db.exec(readFileSync(join(__dirname, "../prisma/migrations/20261111140000_northstar_loan_pause_windows/migration.sql"), "utf8"));
    await db.exec(`
      CREATE TRIGGER loan_recovery BEFORE INSERT ON payroll_run_lines FOR EACH ROW EXECUTE FUNCTION chris_apply_active_loan_recovery();
      CREATE TRIGGER loan_post AFTER UPDATE ON payroll_runs FOR EACH ROW EXECUTE FUNCTION chris_post_loan_recoveries_on_payroll_approval();
      INSERT INTO payroll_loan_pause_windows VALUES ('northstar','loan','2026-11-01','2027-01-01');
      INSERT INTO payroll_run_lines (id,"organizationId","runId","employeeId","grossPay",deductions,"advanceRecovery")
        SELECT id,'northstar',id,'e',100000,0,0 FROM payroll_runs;
    `);
    const result = await db.query('SELECT id,"loanRecovery"::int AS recovery FROM payroll_run_lines ORDER BY id');
    assert.deepEqual(result.rows, [{ id: "dec", recovery: 0 }, { id: "jan", recovery: 25000 }, { id: "nov", recovery: 0 }]);
    await db.exec("UPDATE payroll_runs SET status='APPROVED'");
    assert.deepEqual((await db.query('SELECT status,"outstandingAmount"::int AS outstanding FROM payroll_loans')).rows,
      [{ status: "COMPLETED", outstanding: 0 }]);
    assert.deepEqual((await db.query('SELECT "runId",amount::int FROM payroll_loan_recoveries')).rows,
      [{ runId: "jan", amount: 25000 }]);
  } finally {
    await db.close();
  }
});
