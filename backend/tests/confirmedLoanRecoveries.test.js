const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const migration=fs.readFileSync(path.join(__dirname,'../prisma/migrations/20261028114000_preserve_confirmed_paid_loan_recoveries/migration.sql'),'utf8');
const schema=`
 CREATE TABLE organizations(id text PRIMARY KEY,slug text);
 CREATE TABLE payroll_periods(id text PRIMARY KEY,"organizationId" text,"periodStart" date,"periodEnd" date,"payDate" date);
 CREATE TABLE payroll_runs(id text PRIMARY KEY,"organizationId" text,"periodId" text,status text);
 CREATE TABLE payroll_loans(id text PRIMARY KEY,"organizationId" text,"employeeId" text,"loanNumber" text,"recoveryStartDate" date,"disbursedDate" date,"outstandingAmount" numeric,"installmentAmount" numeric,status text,"updatedAt" timestamp);
 CREATE TABLE payroll_run_lines(id text PRIMARY KEY,"organizationId" text,"employeeId" text,"runId" text,"grossPay" numeric,deductions numeric,"advanceRecovery" numeric,"loanRecovery" numeric,"netPreview" numeric,details jsonb);
 CREATE TABLE payroll_loan_recoveries(id text PRIMARY KEY,"organizationId" text,"loanId" text,"employeeId" text,"runId" text,"runLineId" text,amount numeric,"recoveryDate" date,status text,UNIQUE("loanId","runId"));
`;
test('confirmed actual deductions survive draft recalculation and reapproval without double recovery',async()=>{
 const db=new PGlite();
 try{
 await db.exec(schema);
 await db.exec(`
 INSERT INTO organizations VALUES ('org','zermatt-liquor-limited');
 INSERT INTO payroll_periods VALUES ('sep','org','2026-09-01','2026-09-30','2026-09-30'),('oct','org','2026-10-01','2026-10-31','2026-10-31');
 INSERT INTO payroll_runs VALUES ('original','org','sep','DRAFT'),('replacement','org','sep','DRAFT'),('next','org','oct','DRAFT');
 INSERT INTO payroll_loans VALUES ('loan','org','employee','LN-1','2026-09-01','2026-08-31',500,500,'ACTIVE',now());
 `);
 await db.exec(migration);
 await db.exec(`
 CREATE TRIGGER line_recovery BEFORE INSERT OR UPDATE OF details,"grossPay",deductions,"advanceRecovery" ON payroll_run_lines FOR EACH ROW EXECUTE FUNCTION chris_apply_active_loan_recovery();
 CREATE TRIGGER post_recovery AFTER UPDATE OF status ON payroll_runs FOR EACH ROW EXECUTE FUNCTION chris_post_loan_recoveries_on_payroll_approval();
 INSERT INTO payroll_loan_recoveries VALUES ('paid','org','loan','employee','original',NULL,500,'2026-09-30','POSTED',now(),'USER_CONFIRMED_ACTUAL_DEDUCTION');
 INSERT INTO payroll_run_lines VALUES ('line','org','employee','original',2000,0,0,0,0,'{}');
 `);
 assert.equal(Number((await db.query('SELECT "loanRecovery" FROM payroll_run_lines')).rows[0].loanRecovery),500);
 await db.exec(`DELETE FROM payroll_run_lines; INSERT INTO payroll_run_lines VALUES ('new-line','org','employee','original',2100,0,0,0,0,'{}'); UPDATE payroll_runs SET status='APPROVED' WHERE id='original';`);
 assert.equal(Number((await db.query('SELECT "outstandingAmount" FROM payroll_loans')).rows[0].outstandingAmount),500);
 await db.exec(`INSERT INTO payroll_run_lines VALUES ('replacement-line','org','employee','replacement',2100,0,0,0,0,'{}'); UPDATE payroll_runs SET status='APPROVED' WHERE id='replacement';`);
 assert.equal((await db.query('SELECT count(*) AS n FROM payroll_loan_recoveries')).rows[0].n,1);
 assert.equal(Number((await db.query('SELECT "outstandingAmount" FROM payroll_loans')).rows[0].outstandingAmount),500);
 await db.exec(`INSERT INTO payroll_run_lines VALUES ('oct-line','org','employee','next',2100,0,0,0,0,'{}'); UPDATE payroll_runs SET status='APPROVED' WHERE id='next';`);
 assert.equal(Number((await db.query('SELECT "outstandingAmount" FROM payroll_loans')).rows[0].outstandingAmount),0);
 assert.equal((await db.query('SELECT status FROM payroll_loans')).rows[0].status,'COMPLETED');
 // A final installment remains visible historically after the account closes.
 await db.exec(`UPDATE payroll_run_lines SET details=details WHERE id='new-line'`);
 assert.equal(Number((await db.query(`SELECT "loanRecovery" FROM payroll_run_lines WHERE id='new-line'`)).rows[0].loanRecovery),500);
 assert.equal((await db.query(`SELECT count(*) n FROM payroll_loan_recoveries WHERE "runId"='original' AND status='POSTED' AND "confirmedPaidAt" IS NULL`)).rows[0].n,0);
 }finally{await db.close();}
});

test('September repair restores exactly the confirmed 62 recoveries once and refreshes draft totals',async()=>{
 const db=new PGlite();
 try{
 await db.exec(schema);await db.exec(migration);
 await db.exec(`
 ALTER TABLE payroll_periods ADD COLUMN code text;
 ALTER TABLE payroll_runs ADD COLUMN "deductionTotal" numeric DEFAULT 0,ADD COLUMN "netPreviewTotal" numeric DEFAULT 0,ADD COLUMN "grossTotal" numeric DEFAULT 0,ADD COLUMN "employeeCount" integer DEFAULT 0,ADD COLUMN "updatedAt" timestamp;
 ALTER TABLE payroll_run_lines ADD COLUMN "updatedAt" timestamp;
 CREATE TABLE organization_audits (id text,"organizationId" text,"actorUserId" text,"entityType" text,"entityId" text,action text,"previousValue" jsonb,"newValue" jsonb,reason text,"createdAt" timestamp);
 INSERT INTO organizations VALUES ('org','zermatt-liquor-limited');
 INSERT INTO payroll_periods VALUES ('sep','org','2026-09-01','2026-09-30','2026-09-30','SEP-2026');
 INSERT INTO payroll_runs (id,"organizationId","periodId",status) VALUES ('original','org','sep','DRAFT');
 INSERT INTO payroll_loans SELECT 'l'||i,'org','e'||i,'LN-'||i,'2026-09-01'::date,'2026-08-01'::date,(CASE WHEN i=62 THEN 378049.38 ELSE 60000 END)+(CASE WHEN i<=5 THEN 0 ELSE 100000 END),(CASE WHEN i=62 THEN 378049.38 ELSE 60000 END),'ACTIVE',now() FROM generate_series(1,62) i;
 INSERT INTO payroll_loan_recoveries SELECT 'r'||i,'org','l'||i,'e'||i,'original',NULL,(CASE WHEN i=62 THEN 378049.38 ELSE 60000 END),'2026-09-30'::date,'REVERSED',NULL,NULL FROM generate_series(1,62) i;
 CREATE TRIGGER line_recovery BEFORE INSERT OR UPDATE OF details,"grossPay",deductions,"advanceRecovery" ON payroll_run_lines FOR EACH ROW EXECUTE FUNCTION chris_apply_active_loan_recovery();
 INSERT INTO payroll_run_lines (id,"organizationId","employeeId","runId","grossPay",deductions,"advanceRecovery",details) SELECT 'line'||i,'org','e'||i,'original',1000000,0,0,'{}'::jsonb FROM generate_series(1,62) i;
 `);
 const repair=fs.readFileSync(path.join(__dirname,'../sql/repairs/zermatt_confirm_september_2026_loan_recoveries.sql'),'utf8');
 await db.exec(repair);
 assert.equal(Number((await db.query(`SELECT sum(amount) total FROM payroll_loan_recoveries WHERE status='POSTED' AND "confirmedPaidAt" IS NOT NULL`)).rows[0].total),4038049.38);
 assert.equal((await db.query(`SELECT count(*) n FROM payroll_loans WHERE status='COMPLETED'`)).rows[0].n,5);
 const run=(await db.query(`SELECT * FROM payroll_runs`)).rows[0];assert.equal(run.status,'DRAFT');assert.equal(Number(run.deductionTotal),4038049.38);
 const balance=Number((await db.query(`SELECT sum("outstandingAmount") total FROM payroll_loans`)).rows[0].total);
 await db.exec(repair);
 assert.equal(Number((await db.query(`SELECT sum("outstandingAmount") total FROM payroll_loans`)).rows[0].total),balance);
 assert.equal((await db.query(`SELECT count(*) n FROM organization_audits WHERE action='ACTUAL_SALARY_DEDUCTION_CONFIRMED'`)).rows[0].n,62);
 }finally{await db.close();}
});

test('actual paid recovery remains visible after a migrated schedule already exhausts principal',()=>{
 const vm=require('node:vm');const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/services/loanProfileService.js'),'utf8'),{require:()=>({}),module,exports:module.exports,Date,Number,Math,Map,Set});
 const schedule=module.exports.buildAmortizationSchedule({principalAmount:100000,installmentAmount:50000,recoveryStartDate:'2026-07-31',legacyPeriodEvents:[{periodStart:'2026-07-01',status:'PAID',amount:50000},{periodStart:'2026-08-01',status:'PAID',amount:50000}],recoveries:[{recoveryDate:'2026-09-30',status:'POSTED',amount:50000}]});
 const sep=schedule.find(row=>row.dueDate==='2026-09-30');assert.equal(sep.status,'PAID');assert.equal(sep.amountPaid,50000);assert.equal(sep.principalAmount,0);assert.ok(sep.reconciliationNote);assert.equal(schedule.reduce((sum,row)=>sum+row.principalAmount,0),100000);
});
