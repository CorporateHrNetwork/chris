const test = require('node:test');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
const { ESS_STATUTORY_OBLIGATIONS_SQL, ESS_PAYROLL_PREVIEWS_SQL, ESS_CURRENT_SALARY_SQL } = require('../src/services/essStatutoryService');

test('ESS retains provisional payroll, deduplicates run revisions without doubling money, and preserves reversal history', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE payroll_periods (id text,"organizationId" text,code text,name text,"periodStart" date,"periodEnd" date,"payDate" date);
      CREATE TABLE payroll_runs (id text,"organizationId" text,"periodId" text,status text,"createdAt" timestamp DEFAULT now(),"updatedAt" timestamp DEFAULT now());
      CREATE TABLE payroll_run_lines (id text,"organizationId" text,"employeeId" text,"runId" text,currency text DEFAULT 'NGN',"grossPay" numeric DEFAULT 1000,deductions numeric DEFAULT 100,"netPreview" numeric DEFAULT 900);
      CREATE TABLE statutory_obligations (
        id text,"organizationId" text,"employeeId" text,"payrollRunId" text,
        "obligationType" text,"periodYear" int DEFAULT 2026,"periodMonth" int,
        currency text DEFAULT 'NGN',status text,"assessableBase" numeric DEFAULT 1000,
        "employeeAmount" numeric,"employerAmount" numeric DEFAULT 0,"totalLiability" numeric,
        "amountRemitted" numeric DEFAULT 0,"dueDate" timestamp,
        "createdAt" timestamp DEFAULT now(),"updatedAt" timestamp DEFAULT now()
      );
      CREATE TABLE payroll_salary_rates (id text,"organizationId" text,"employeeId" text,amount numeric,currency text,status text,"effectiveFrom" date,"effectiveTo" date,"updatedAt" timestamp DEFAULT now());
      INSERT INTO payroll_periods VALUES
        ('aug','org','AUG','August','2026-08-01','2026-08-31','2026-08-31'),
        ('sep','org','SEP','September','2026-09-01','2026-09-30','2026-09-30'),
        ('oct','org','OCT-2026','October','2026-10-01','2026-10-31','2026-10-31'),
        ('oct-alias','org','2026-10','October','2026-10-01','2026-10-31','2026-10-31'),
        ('other','other','OCT','October','2026-10-01','2026-10-31','2026-10-31');
      INSERT INTO payroll_runs (id,"organizationId","periodId",status) VALUES
        ('aug-approved','org','aug','APPROVED'),('aug-supplement','org','aug','APPROVED'),
        ('sep-reopened','org','sep','DRAFT'),('oct-draft','org','oct','DRAFT'),
        ('oct-pending','org','oct-alias','PENDING_APPROVAL'),('other','other','other','APPROVED');
      INSERT INTO payroll_run_lines (id,"organizationId","employeeId","runId") VALUES
        ('a','org','employee','aug-approved'),('b','org','employee','aug-supplement'),
        ('c','org','employee','sep-reopened'),('d','org','employee','oct-draft'),
        ('e','org','employee','oct-pending'),('f','org','other-employee','oct-pending'),
        ('g','other','employee','other');
      INSERT INTO statutory_obligations (id,"organizationId","employeeId","payrollRunId","obligationType","periodMonth",status,"employeeAmount","totalLiability","updatedAt") VALUES
        ('a','org','employee','aug-approved','PAYE',8,'CONFIRMED',100,100,'2026-08-31'),
        ('b','org','employee','aug-supplement','PAYE',8,'CONFIRMED',100,100,'2026-08-31'),
        ('old','org','employee','oct-draft','PAYE',10,'DRAFT_CALCULATED',150,150,'2026-10-01'),
        ('current','org','employee','oct-pending','PAYE',10,'DRAFT_CALCULATED',150,150,'2026-10-02'),
        ('rev1','org','employee','sep-reopened','PAYE',9,'REVERSED',100,100,'2026-09-01'),
        ('rev2','org','employee','sep-reopened','PAYE',9,'REVERSED',200,200,'2026-09-02'),
        ('different-currency','org','employee','oct-pending','PAYE',10,'DRAFT_CALCULATED',10,10,'2026-10-02'),
        ('other-employee','org','other-employee','oct-pending','PAYE',10,'DRAFT_CALCULATED',9999,9999,'2026-10-02'),
        ('other-org','other','employee','other','PAYE',10,'CONFIRMED',9999,9999,'2026-10-02'),
        ('forged-run','org','employee','other','PAYE',10,'CONFIRMED',9999,9999,'2026-10-02');
      UPDATE statutory_obligations SET currency='USD' WHERE id='different-currency';
      INSERT INTO payroll_salary_rates (id,"organizationId","employeeId",amount,currency,status,"effectiveFrom","effectiveTo") VALUES
        ('active','org','employee',450000,'NGN','ACTIVE','2020-01-01',NULL),
        ('future','org','employee',999999,'NGN','ACTIVE','2099-01-01',NULL),
        ('retired','org','employee',999999,'NGN','RETIRED','2020-01-01',NULL),
        ('other','other','employee',999999,'NGN','ACTIVE','2020-01-01',NULL);
    `);
    const before = (await db.query('SELECT * FROM statutory_obligations ORDER BY id')).rows;
    const rows = (await db.query(ESS_STATUTORY_OBLIGATIONS_SQL,['org','employee'])).rows;
    assert.equal(rows.length,4);
    const current = rows.find(r=>r.periodMonth===10&&r.currency==='NGN');
    assert.equal(Number(current.employeeAmount),150,'parallel draft and pending runs are revisions, not additive payments');
    assert.equal(current.status,'DRAFT_CALCULATED','draft information remains visible with its actual status');
    assert.equal(Number(rows.find(r=>r.periodMonth===8).employeeAmount),200,'distinct approved supplements remain additive');
    const history=rows.find(r=>r.recordKind==='HISTORY');
    assert.equal(Number(history.employeeAmount),200,'latest reversal is shown once without summing old versions');
    const previews=(await db.query(ESS_PAYROLL_PREVIEWS_SQL,['org','employee'])).rows;
    assert.equal(previews.length,2);
    assert.equal(previews[0].runId,'oct-pending');
    assert.equal(previews[0].runStatus,'PENDING_APPROVAL');
    assert.equal(Number((await db.query(ESS_CURRENT_SALARY_SQL,['org','employee'])).rows[0].amount),450000,
      'gratuity salary does not depend on an approved payroll run');
    assert.deepEqual((await db.query(ESS_STATUTORY_OBLIGATIONS_SQL,['org','missing'])).rows,[]);
    assert.deepEqual((await db.query(ESS_PAYROLL_PREVIEWS_SQL,['org','missing'])).rows,[]);
    assert.deepEqual((await db.query('SELECT * FROM statutory_obligations ORDER BY id')).rows,before);
  } finally { await db.close(); }
});
