const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const archive=fs.readFileSync(path.join(__dirname,'../prisma/migrations/20261029123000_payroll_archive_and_loan_history_confirmation/migration.sql'),'utf8');
const recovery=fs.readFileSync(path.join(__dirname,'../prisma/migrations/20261028114000_preserve_confirmed_paid_loan_recoveries/migration.sql'),'utf8');
const repair=fs.readFileSync(path.join(__dirname,'../sql/repairs/zermatt_october_2026_final_review.sql'),'utf8');
const run='f9296223-c182-4184-8c59-b5acb714ca75',period='4afbd8fb-cfab-4f02-a313-be2600e2da97';
const schema=`
 CREATE TABLE organizations(id text PRIMARY KEY,slug text);
 CREATE TABLE employees(id text PRIMARY KEY,"organizationId" text,"employeeNumber" text);
 CREATE TABLE payroll_periods(id text PRIMARY KEY,"organizationId" text,code text,name text,"periodStart" date,"periodEnd" date,"payDate" date,status text,"createdAt" timestamp,"updatedAt" timestamp);
 CREATE TABLE payroll_runs(id text PRIMARY KEY,"organizationId" text,"periodId" text,status text,"employeeCount" int,"grossTotal" numeric,"deductionTotal" numeric,"netPreviewTotal" numeric,"updatedAt" timestamp);
 CREATE TABLE payroll_run_lines(id text PRIMARY KEY,"organizationId" text,"employeeId" text,"employeeNumber" text,"runId" text,"baseSalary" numeric,allowances numeric,"grossPay" numeric,deductions numeric,"advanceRecovery" numeric,"loanRecovery" numeric,"netPreview" numeric,details jsonb,"updatedAt" timestamp);
 CREATE TABLE payroll_loans(id text PRIMARY KEY,"organizationId" text,"employeeId" text,"loanNumber" text,"recoveryStartDate" date,"disbursedDate" date,"principalAmount" numeric,"outstandingAmount" numeric,"installmentAmount" numeric,status text,"updatedAt" timestamp);
 CREATE TABLE payroll_loan_recoveries(id text PRIMARY KEY,"organizationId" text,"loanId" text,"employeeId" text,"runId" text,"runLineId" text,amount numeric,"recoveryDate" date,status text,UNIQUE("loanId","runId"));
 CREATE TABLE organization_audits(id text,"organizationId" text,"actorUserId" text,"entityType" text,"entityId" text,action text,"previousValue" jsonb,"newValue" jsonb,reason text,"createdAt" timestamp);
 CREATE TABLE chris_payroll_notes(id text,"organizationId" text,"employeeId" text,"payrollPeriodId" text,status text,"reviewedNote" text,"reviewedAt" timestamp,revision int,"updatedAt" timestamp);
 CREATE TABLE attendance_payroll_inputs(id text,"organizationId" text,"employeeId" text,"periodStart" date,"periodEnd" date,"workedDays" numeric,notes text,"updatedAt" timestamp);
 CREATE TABLE payroll_variable_components(id text,"organizationId" text,code text);
 CREATE TABLE payroll_variable_inputs(id text,"organizationId" text,"employeeId" text,"payrollPeriodId" text,"componentId" text,status text,"manualAmount" numeric,remarks text,"updatedAt" timestamp);
 CREATE TABLE statutory_obligations(id text,"organizationId" text,"payrollRunId" text,"employeeId" text,"obligationType" text,"assessableBase" numeric,"employeeAmount" numeric,"employerAmount" numeric,"totalLiability" numeric,"calculationSnapshot" jsonb,"updatedAt" timestamp,status text,"amountRemitted" numeric);
`;
test('targeted review archives safely, corrects 14/15 days, carries the bill once, preserves actual recoveries and is idempotent',async()=>{
 const db=new PGlite();try{
 await db.exec(schema);await db.exec(recovery);await db.exec(archive);
 await db.exec(`INSERT INTO organizations VALUES('org','zermatt-liquor-limited');INSERT INTO payroll_periods(id,"organizationId",code,"periodStart","periodEnd",status) VALUES('${period}','org','2026-10','2026-10-01','2026-10-31','OPEN'),('old-oct','org','OCT-2026','2026-10-01','2026-10-31','OPEN'),('sep','org','SEP-2026','2026-09-01','2026-09-30','OPEN');INSERT INTO payroll_runs(id,"organizationId","periodId",status,"employeeCount") VALUES('${run}','org','${period}','DRAFT',312),('old-oct','org','old-oct','DRAFT',299),('sep','org','sep','DRAFT',300);`);
 for(const n of ['178','221','122','067','074','020','026','042','046','089','151'])await db.query(`INSERT INTO employees VALUES($1,'org',$2)`,['e'+n,'ZLL000'+n]);
 for(const n of ['178','221']){
 const gross=n==='178'?70000:90000,days=n==='178'?24:25,oldGross=gross*days/16;
 const details={scheduledMonthlyGross:gross,customAllowances:[],customDeductions:[],statutory:{rentReliefAnnual:gross*1.232},attendance:{employmentType:'Part-time',standardDays:16,payableDays:days}};
 await db.query(`INSERT INTO attendance_payroll_inputs VALUES($1,'org',$2,'2026-10-01','2026-10-31',$3,'Absent',now())`,['a'+n,'e'+n,days]);
 await db.query(`INSERT INTO payroll_run_lines(id,"organizationId","employeeId","employeeNumber","runId","grossPay",deductions,"advanceRecovery","loanRecovery",details) VALUES($1,'org',$2,$3,$4,$5,0,0,0,$6)`,['l'+n,'e'+n,'ZLL000'+n,run,oldGross,JSON.stringify(details)]);
 }
 await db.exec(`INSERT INTO payroll_loans(id,"organizationId","employeeId","loanNumber","recoveryStartDate","disbursedDate","principalAmount","outstandingAmount","installmentAmount",status) VALUES('loan122','org','e122','LN122','2026-05-01','2026-04-30',300000,150000,50000,'ACTIVE');CREATE TRIGGER recovery BEFORE INSERT OR UPDATE OF details,"grossPay",deductions,"advanceRecovery" ON payroll_run_lines FOR EACH ROW EXECUTE FUNCTION chris_apply_active_loan_recovery();
 INSERT INTO payroll_variable_components VALUES('bill','org','DED-BBSB');INSERT INTO payroll_variable_inputs VALUES('input','org','e122','${period}','bill','ACTIVE',40400,NULL,now());
 INSERT INTO payroll_run_lines(id,"organizationId","employeeId","employeeNumber","runId","grossPay",deductions,"advanceRecovery","loanRecovery",details) VALUES('l122','org','e122','ZLL000122','${run}',89100,47118.72,0,0,'{"customDeductions":[{"inputId":"input","value":40400}],"statutory":{},"attendance":{}}');
 INSERT INTO payroll_run_lines(id,"organizationId","employeeId","employeeNumber","runId","grossPay",deductions,"advanceRecovery","loanRecovery",details) SELECT 'other'||i,'org','other'||i,'OTHER'||i,'${run}',100000,0,0,0,'{}' FROM generate_series(1,309)i;
 INSERT INTO chris_payroll_notes(id,"organizationId","employeeId","payrollPeriodId",status,revision) VALUES('n67','org','e067','${period}','SUBMITTED',1),('n74','org','e074','${period}','SUBMITTED',1);
 INSERT INTO payroll_loan_recoveries(id,"organizationId","loanId","employeeId","runId",amount,"recoveryDate",status,"confirmedPaidAt") VALUES('paid','org','history','e020','sep',100000,'2026-09-30','POSTED',now());`);
 for(const n of ['020','026','042','046','089','151'])await db.query(`INSERT INTO payroll_loans(id,"organizationId","employeeId","principalAmount","outstandingAmount",status) VALUES($1,'org',$2,100000,0,'COMPLETED')`,['history'+n,'e'+n]);
 await db.exec(repair);
 const lines=(await db.query(`SELECT "employeeNumber","grossPay","loanRecovery","netPreview" FROM payroll_run_lines WHERE id IN('l178','l221','l122') ORDER BY id`)).rows;
 assert.equal(Number(lines.find(x=>x.employeeNumber==='ZLL000178').grossPay),61250);assert.equal(Number(lines.find(x=>x.employeeNumber==='ZLL000221').grossPay),84375);assert.equal(Number(lines.find(x=>x.employeeNumber==='ZLL000122').loanRecovery),50000);assert.equal(Number(lines.find(x=>x.employeeNumber==='ZLL000122').netPreview),32381.28);
 assert.equal((await db.query(`SELECT count(*)::int n FROM payroll_runs WHERE "archivedAt" IS NOT NULL`)).rows[0].n,2);assert.equal((await db.query(`SELECT count(*)::int n FROM chris_payroll_notes WHERE status='REJECTED'`)).rows[0].n,2);assert.equal((await db.query(`SELECT count(*)::int n FROM payroll_loans WHERE "historyConfirmedAt" IS NOT NULL`)).rows[0].n,6);
 assert.equal((await db.query(`SELECT p.code FROM payroll_variable_inputs i JOIN payroll_periods p ON p.id=i."payrollPeriodId"`)).rows[0].code,'2026-11');assert.equal((await db.query(`SELECT count(*)::int n FROM payroll_loan_recoveries WHERE status='POSTED'`)).rows[0].n,1);
 assert.equal((await db.query(`SELECT status FROM payroll_runs WHERE id='${run}'`)).rows[0].status,'DRAFT');
 const count=(await db.query('SELECT count(*)::int n FROM organization_audits')).rows[0].n;await db.exec(repair);assert.equal((await db.query('SELECT count(*)::int n FROM organization_audits')).rows[0].n,count);
 await assert.rejects(db.exec(`UPDATE payroll_runs SET status='APPROVED' WHERE id='sep'`),/ARCHIVED_PAYROLL_IMMUTABLE/);
 await assert.rejects(db.exec(`INSERT INTO payroll_run_lines(id,"runId","organizationId") VALUES('illegal','sep','org')`),/ARCHIVED_PAYROLL_IMMUTABLE/);
 }finally{await db.close();}
});
