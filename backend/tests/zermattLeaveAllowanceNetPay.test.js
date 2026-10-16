const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const root = path.join(__dirname, '../prisma/migrations');
const migrationName = fs.readdirSync(root).find(name => name.endsWith('_zermatt_leave_allowance_net_pay'));
const migration = fs.readFileSync(path.join(root, migrationName, 'migration.sql'), 'utf8');
const oldSource = fs.readFileSync(path.join(root, '20260906134500_zermatt_legacy_loan_history_and_full_installments/migration.sql'), 'utf8');
const oldFunction = oldSource.slice(oldSource.indexOf('CREATE OR REPLACE FUNCTION "chris_apply_active_loan_recovery"()'));

test('real loan trigger preserves leave allowance in net, repairs only drafts, and remains idempotent', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE organizations (id text PRIMARY KEY,slug text);
      CREATE TABLE payroll_periods (id text,"organizationId" text,"periodStart" date);
      CREATE TABLE payroll_runs (id text PRIMARY KEY,"organizationId" text,"periodId" text,status text,"netPreviewTotal" numeric,"updatedAt" timestamp DEFAULT now());
      CREATE TABLE payroll_run_lines (id text PRIMARY KEY,"organizationId" text,"runId" text,"employeeId" text,"grossPay" numeric,deductions numeric,"advanceRecovery" numeric,"loanRecovery" numeric,"netPreview" numeric,details jsonb,"updatedAt" timestamp DEFAULT now());
      CREATE TABLE payroll_loans (id text,"organizationId" text,"employeeId" text,"loanNumber" text,"recoveryStartDate" date,"disbursedDate" date,"outstandingAmount" numeric,"installmentAmount" numeric,status text);
      CREATE TABLE organization_audits (id text,"organizationId" text,"entityType" text,"entityId" text,action text,"previousValue" jsonb,"newValue" jsonb,reason text,"createdAt" timestamp);
      INSERT INTO organizations VALUES ('z','zermatt-liquor-limited'),('other','other-tenant');
      INSERT INTO payroll_periods VALUES ('p','z','2026-10-01'),('p2','other','2026-10-01');
      INSERT INTO payroll_runs (id,"organizationId","periodId",status,"netPreviewTotal") VALUES ('draft','z','p','DRAFT',145000),('approved','z','p','APPROVED',145000),('submitted','z','p','SUBMITTED',145000),('other','other','p2','DRAFT',170000);
      INSERT INTO payroll_loans VALUES ('loan','z','e','LN1','2026-01-01','2026-01-01',100000,25000,'ACTIVE');
    `);
    await db.exec(oldFunction);
    await db.exec(`
      CREATE TRIGGER zz_trg_payroll_line_loan_recovery BEFORE INSERT OR UPDATE OF deductions,"advanceRecovery","grossPay",details ON payroll_run_lines FOR EACH ROW EXECUTE FUNCTION chris_apply_active_loan_recovery();
      INSERT INTO payroll_run_lines (id,"organizationId","runId","employeeId","grossPay",deductions,"advanceRecovery","loanRecovery","netPreview",details) VALUES
      ('draft-line','z','draft','e',200000,20000,10000,0,290000,'{"leaveAllowance":{"amount":120000}}'),
      ('approved-line','z','approved','e',200000,20000,10000,0,290000,'{"leaveAllowance":{"amount":120000}}'),
      ('submitted-line','z','submitted','e',200000,20000,10000,0,290000,'{"leaveAllowance":{"amount":120000}}'),
      ('other-line','other','other','e2',200000,20000,10000,0,175000,'{"leaveAllowance":{"amount":5000}}');
    `);
    const line = async id => (await db.query('SELECT * FROM payroll_run_lines WHERE id=$1',[id])).rows[0];
    assert.equal(Number((await line('draft-line')).netPreview),145000,'reproduces the production trigger losing the allowance');
    await db.exec(migration);
    assert.equal(Number((await line('draft-line')).netPreview),265000);
    assert.equal(Number((await line('draft-line')).loanRecovery),25000);
    assert.equal(Number((await line('approved-line')).netPreview),145000,'approved history remains unchanged');
    assert.equal(Number((await line('submitted-line')).netPreview),145000,'submitted payroll requires controlled rework');
    assert.equal(Number((await line('other-line')).netPreview),170000,'other tenants retain existing treatment');
    assert.equal(Number((await db.query(`SELECT "netPreviewTotal" FROM payroll_runs WHERE id='draft'`)).rows[0].netPreviewTotal),265000);
    assert.equal((await db.query('SELECT * FROM organization_audits')).rows.length,1);
    await db.exec(migration);
    assert.equal(Number((await line('draft-line')).netPreview),265000,'reapplying cannot add allowance twice');
    assert.equal((await db.query('SELECT * FROM organization_audits')).rows.length,1);
    await db.exec(`UPDATE payroll_run_lines SET details=jsonb_set(details,'{leaveAllowance,amount}','180000'::jsonb) WHERE id='draft-line'`);
    assert.equal(Number((await line('draft-line')).netPreview),325000,'salary change replaces allowance in net');
    await db.exec(`UPDATE payroll_run_lines SET details=details WHERE id='draft-line'`);
    assert.equal(Number((await line('draft-line')).netPreview),325000,'same allowance stays included once');
    await db.exec(`UPDATE payroll_run_lines SET details=details-'leaveAllowance' WHERE id='draft-line'`);
    assert.equal(Number((await line('draft-line')).netPreview),145000,'ineligible allowance is removed from net');
    assert.equal(Number((await db.query('SELECT "outstandingAmount" FROM payroll_loans')).rows[0].outstandingAmount),100000,'draft calculation does not post repayment');
  } finally { await db.close(); }
});
