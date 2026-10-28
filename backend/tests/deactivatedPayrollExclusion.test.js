const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const{PGlite}=require('@electric-sql/pglite');
const migration=fs.readFileSync(path.join(__dirname,'../prisma/migrations/20261028180000_exclude_deactivated_employees_from_payroll/migration.sql'),'utf8');
test('deactivation atomically removes its whole month and future unpaid drafts, refreshes totals and blocks approval',async()=>{
 const db=new PGlite();try{
 await db.exec(`
 CREATE TABLE organizations(id text PRIMARY KEY,slug text); CREATE TABLE employees(id text PRIMARY KEY,"organizationId" text,status text);
 CREATE TABLE payroll_periods(id text PRIMARY KEY,"organizationId" text,"periodStart" date,"periodEnd" date,status text);
 CREATE TABLE payroll_runs(id text PRIMARY KEY,"organizationId" text,"periodId" text,status text,"employeeCount" integer,"grossTotal" numeric,"deductionTotal" numeric,"netPreviewTotal" numeric,"statutoryStatus" text,"updatedAt" timestamp);
 CREATE TABLE payroll_run_lines(id text PRIMARY KEY,"organizationId" text,"runId" text,"employeeId" text,"grossPay" numeric,deductions numeric,"advanceRecovery" numeric,"loanRecovery" numeric,"netPreview" numeric);
 CREATE TABLE statutory_obligations(id text,"organizationId" text,"employeeId" text,"payrollRunId" text,status text,"amountRemitted" numeric);
 CREATE TABLE employee_lifecycle_events(id text,"organizationId" text,"employeeId" text,"eventType" text,"effectiveDate" timestamp,"performedByUserId" text);
 CREATE TABLE organization_audits(id text,"organizationId" text,"actorUserId" text,"entityType" text,"entityId" text,action text,"previousValue" jsonb,"newValue" jsonb,reason text,"createdAt" timestamp);
 CREATE TABLE zermatt_midmonth_runs(id text,"organizationId" text,"periodMonth" date,status text,"sourceHash" text,"updatedAt" timestamp);
 CREATE TABLE zermatt_midmonth_lines(id text,"organizationId" text,"employeeId" text,"runId" text,"netPay" numeric);
 INSERT INTO organizations VALUES ('org','zermatt-liquor-limited'),('other','demo');INSERT INTO employees VALUES ('employee','org','ACTIVE'),('retained','org','ACTIVE'),('other-employee','other','INACTIVE');
 INSERT INTO payroll_periods VALUES ('sep','org','2026-09-01','2026-09-30','OPEN'),('oct','org','2026-10-01','2026-10-31','OPEN'),('nov','org','2026-11-01','2026-11-30','OPEN'),('other-period','other','2026-10-01','2026-10-31','OPEN');
 INSERT INTO payroll_runs SELECT id,'org',period,status,2,2000,200,1800,'CALCULATED',now() FROM (VALUES('old','sep','DRAFT'),('current','oct','DRAFT'),('future','nov','DRAFT'),('paid','oct','APPROVED'),('review','oct','PENDING_APPROVAL'))x(id,period,status);
 INSERT INTO payroll_runs VALUES ('other-run','other','other-period','DRAFT',0,0,0,0,'CALCULATED',now());
 INSERT INTO payroll_run_lines SELECT id||'-line','org',id,'employee',1000,100,0,0,900 FROM payroll_runs WHERE "organizationId"='org';
 INSERT INTO payroll_run_lines VALUES ('retained-line','org','current','retained',1000,100,0,0,900);
 INSERT INTO statutory_obligations VALUES ('draft','org','employee','current','DRAFT_CALCULATED',0),('paid','org','employee','paid','CONFIRMED',50);
 INSERT INTO zermatt_midmonth_runs VALUES ('mid-draft','org','2026-10-01','DRAFT','old',now()),('mid-paid','org','2026-10-01','PAID','old',now());
 INSERT INTO zermatt_midmonth_lines VALUES ('md','org','employee','mid-draft',250),('mp','org','employee','mid-paid',250);
 `);await db.exec(migration);
 await db.exec(`BEGIN;UPDATE employees SET status='INACTIVE' WHERE id='employee';INSERT INTO employee_lifecycle_events VALUES ('deactivate','org','employee','DEACTIVATED','2026-10-15','hr');COMMIT;`);
 const ids=(await db.query(`SELECT id FROM payroll_run_lines ORDER BY id`)).rows.map(x=>x.id);assert.deepEqual(ids,['old-line','paid-line','retained-line','review-line']);
 const run=(await db.query(`SELECT * FROM payroll_runs WHERE id='current'`)).rows[0];assert.equal(run.employeeCount,1);assert.equal(Number(run.grossTotal),1000);assert.equal(Number(run.netPreviewTotal),900);assert.equal(run.statutoryStatus,'RECALCULATION_REQUIRED');
 assert.equal((await db.query(`SELECT count(*) n FROM statutory_obligations`)).rows[0].n,1);
 assert.deepEqual((await db.query(`SELECT id FROM zermatt_midmonth_lines`)).rows.map(x=>x.id),['mp']);
 await assert.rejects(db.exec(`INSERT INTO payroll_run_lines VALUES ('blocked','org','current','employee',1000,0,0,0,1000)`),/DEACTIVATED_EMPLOYEE_PAYROLL_EXCLUDED/);
 await assert.rejects(db.exec(`UPDATE payroll_runs SET status='APPROVED' WHERE id='review'`),/DEACTIVATED_EMPLOYEE_PAYROLL_EXCLUDED/);
 await db.exec(`UPDATE employees SET status='ACTIVE' WHERE id='employee'`);
 await assert.rejects(db.exec(`INSERT INTO payroll_run_lines VALUES ('same-month','org','current','employee',1000,0,0,0,1000)`),/DEACTIVATED_EMPLOYEE_PAYROLL_EXCLUDED/);
 await db.exec(`INSERT INTO payroll_run_lines VALUES ('next-month','org','future','employee',1000,0,0,0,1000);INSERT INTO payroll_run_lines VALUES ('other','other','other-run','other-employee',1000,0,0,0,1000);`);
 assert.equal((await db.query(`SELECT count(*) n FROM organization_audits WHERE action='DEACTIVATED_EMPLOYEE_EXCLUDED'`)).rows[0].n,3);
 assert.equal((await db.query(`SELECT chris_exclude_deactivated_payroll_employee('org','employee','2026-12-01',NULL) n`)).rows[0].n,0);
 }finally{await db.close();}
});
