const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const url=process.env.CHRIS_MIDMONTH_TEST_DATABASE_URL;
test('isolated PostgreSQL: activation, automatic salary allocation, approval, reconciliation and tenant isolation',{skip:!url},async()=>{
 // This test is destructive ONLY in its explicitly named disposable database.
 const {Pool}=require('pg');const pool=new Pool({connectionString:url});
 const identity=(await pool.query('select current_database() as name')).rows[0].name;
 assert.equal(identity,'chris_midmonth_test','Refuse to run fixtures against any other database');
 await pool.query(`DROP SCHEMA public CASCADE;CREATE SCHEMA public;
  DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon;END IF; IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated;END IF; IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role;END IF;END $$;
  CREATE TABLE organizations(id text PRIMARY KEY,slug text);
  CREATE TABLE users(id text PRIMARY KEY);
  CREATE TABLE employees(id text PRIMARY KEY,"organizationId" text,"employeeNumber" text,"firstName" text,"middleName" text,"lastName" text,"employmentType" text,"hireDate" date,status text);
  CREATE TABLE employee_lifecycle_events(id text PRIMARY KEY,"organizationId" text,"employeeId" text,"eventType" text,"effectiveDate" timestamp);
  CREATE TABLE payroll_salary_rates(id text PRIMARY KEY,"organizationId" text,"employeeId" text,amount numeric,currency text DEFAULT 'NGN',frequency text,"effectiveFrom" date,"effectiveTo" date,status text,reason text,"createdByUserId" text,"updatedAt" timestamptz DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE payroll_periods(id text PRIMARY KEY,"organizationId" text,"periodStart" date,"periodEnd" date);
  CREATE TABLE payroll_runs(id text PRIMARY KEY,"organizationId" text,"periodId" text,status text,"statutoryStatus" text,"updatedAt" timestamptz);
  CREATE TABLE payroll_run_lines(id text PRIMARY KEY,"organizationId" text,"employeeId" text,"runId" text);
  CREATE TABLE employee_onboardings(id text PRIMARY KEY,"organizationId" text,"employeeId" text,"sectionData" jsonb,"updatedAt" timestamptz,"createdAt" timestamptz);
  CREATE TABLE payroll_loans(id text PRIMARY KEY,amount numeric);
  CREATE TABLE organization_audits(record jsonb,id text PRIMARY KEY DEFAULT gen_random_uuid()::text,"organizationId" text,"actorUserId" text,"entityType" text,"entityId" text,action text,"previousValue" jsonb,"newValue" jsonb,reason text,"createdAt" timestamptz DEFAULT CURRENT_TIMESTAMP);
 `);
 const sqlDir=path.join(__dirname,'../sql');
 await pool.query(fs.readFileSync(path.join(sqlDir,'zermatt_salary_split_preparation.sql'),'utf8'));
 await pool.query(fs.readFileSync(path.join(sqlDir,'zermatt_midmonth_operating_schema.sql'),'utf8'));
 await pool.query(`INSERT INTO organizations VALUES('zll','zermatt-liquor-limited'),('other','other-client');
  INSERT INTO users VALUES('hr'),('auditor'),('gm'),('finance'),('outsider');
  INSERT INTO payroll_approval_assignments(id,"organizationId",responsibility,"assignedUserId") VALUES('r1','zll','HEAD_HR','hr'),('r2','zll','PAYROLL_AUDITOR','auditor'),('r3','zll','GENERAL_MANAGER','gm'),('r4','zll','CHIEF_ACCOUNTANT','finance'),('r5','other','HEAD_HR','outsider');
  INSERT INTO employees VALUES('e1','zll','Z1','One',NULL,'Employee','Full-Time','2020-01-01','ACTIVE'),('e2','zll','Z2','Two',NULL,'Employee','Full-Time','2020-01-01','ACTIVE'),('e3','zll','Z3','Three',NULL,'Employee','Part-time','2020-01-01','ACTIVE'),('e4','zll','Z4','Four',NULL,'Employee','Full-Time','2026-11-06','ACTIVE');
  INSERT INTO payroll_loans VALUES('unchanged-loan',70000);
 `);
 const staff=(await pool.query('SELECT * FROM employees ORDER BY id')).rows;
 const gross=[200000,80000,120000,120000];
 for(let i=0;i<staff.length;i++)await pool.query(`INSERT INTO zermatt_salary_split_preparations(id,"organizationId","employeeId","fullMonthlyGross",currency,"effectiveFrom",reason,"employmentTypeSnapshot","hireDateSnapshot","allocationPreview","createdByUserId") VALUES($1,'zll',$2,$3,'NGN','2026-11-01','Fixture',$4,$5,'{}','hr')`,[`p${i}`,staff[i].id,gross[i],staff[i].employmentType,staff[i].hireDate]);
 function wrap(client) {return {employee:{findMany:async({where})=>(await client.query('SELECT id FROM employees WHERE "organizationId"=$1 AND id=ANY($2::text[]) ORDER BY id',[where.organizationId,where.id.in])).rows.map(e=>({...e,location:{name:'Fixture Branch'},designation:{name:'Fixture Position'},department:{name:'Fixture Department'}}))},$queryRawUnsafe:async(s,...a)=>(await client.query(s,a)).rows,$executeRawUnsafe:async(s,...a)=>(await client.query(s,a)).rowCount,organizationAudit:{create:async({data})=>client.query('INSERT INTO organization_audits(record) VALUES($1::jsonb)',[JSON.stringify(data)]),findFirst:async({where})=>(await client.query(`SELECT record FROM organization_audits WHERE record->>'organizationId'=$1 AND record->>'entityType'=$2 AND record->>'entityId'=$3 AND record->>'action'=$4 ORDER BY ctid DESC LIMIT 1`,[where.organizationId,where.entityType,where.entityId,where.action])).rows[0]?.record||null}};}
 const db={...wrap(pool),$transaction:async fn=>{const c=await pool.connect();try{await c.query('BEGIN');const result=await fn(wrap(c));await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}};
 assert.equal(await require('../src/services/zermattBenefitPreparationReadiness').storageReady(db),true,'Real preparation columns and unique key must be verified');
 const service=require('../src/services/zermattMidmonthService').createService(db);
 const preparation=require('../src/services/zermattSalaryPreparationService').createService(db,(client,org)=>client.$queryRawUnsafe('SELECT * FROM employees WHERE "organizationId"=$1',org));
 try {
  const correction={employeeNumber:'Z2',amount:'82000',effectiveFrom:'2026-11-01',reason:'Correct opening salary',preparationId:'p1'};
  await assert.rejects(preparation.preview('zll','outsider',correction),/assigned Head HR/);
  await assert.rejects(preparation.preview('other','outsider',correction),/current employee/);
  await assert.rejects(preparation.preview('zll','hr',{...correction,preparationId:'p0'}),/different payroll month/);
  const checked=await preparation.preview('zll','hr',correction);
  assert.equal(checked.row.employeeName,'Two Employee');assert.equal(checked.row.allocation.endMonthGross,68880);
  await preparation.save('zll','hr',{...correction,previewToken:checked.previewToken});
  assert.equal(Number((await pool.query("SELECT \"fullMonthlyGross\" FROM zermatt_salary_split_preparations WHERE id='p1'")).rows[0].fullMonthlyGross),82000);
  await assert.rejects(preparation.save('zll','hr',{...correction,previewToken:checked.previewToken}),/changed/);
  const next=await preparation.preview('zll','hr',{...correction,amount:'80000'});
  await preparation.save('zll','hr',{...correction,amount:'80000',previewToken:next.previewToken});
  const stale=await preparation.preview('zll','hr',correction);
  await pool.query("UPDATE employees SET \"lastName\"='Changed' WHERE id='e2'");
  await assert.rejects(preparation.save('zll','hr',{...correction,previewToken:stale.previewToken}),/changed/);
  await pool.query("UPDATE employees SET \"lastName\"='Employee' WHERE id='e2'");
  assert.equal(Number((await pool.query('SELECT COUNT(*) as count FROM payroll_salary_rates')).rows[0].count),0);
  assert.equal(Number((await pool.query('SELECT COUNT(*) as count FROM zermatt_midmonth_runs')).rows[0].count),0);
  assert.equal(Number((await pool.query("SELECT amount FROM payroll_loans WHERE id='unchanged-loan'")).rows[0].amount),70000);
  assert.equal(Number((await pool.query("SELECT COUNT(*) as count FROM organization_audits WHERE record->>'action'='INDIVIDUAL_CORRECTION'")).rows[0].count),2);


  // Use the exact production PrismaPg adapter, not the pg wrapper, for a 315-row import.
  await pool.query(`INSERT INTO organizations VALUES('bulk','bulk-fixture');
   INSERT INTO employees SELECT 'bulk-e-'||g,'bulk','B'||lpad(g::text,5,'0'),'Fixture',NULL,'Employee','Full-Time','2020-01-01','ACTIVE' FROM generate_series(1,315) g;`);
  const {PrismaClient}=require('@prisma/client');
  const {PrismaPg}=require('@prisma/adapter-pg');
  const actualPrisma=new PrismaClient({adapter:new PrismaPg({connectionString:url})});
  try {
   assert.equal((await actualPrisma.$queryRawUnsafe('SELECT current_database() AS name'))[0].name,'chris_midmonth_test');
   try {
    await actualPrisma.$queryRawUnsafe('SELECT pg_advisory_xact_lock(hashtextextended($1,0))','bulk-diagnostic');
    console.log('TRANSPORT_IMPORT_LEGACY_LOCK_READ=supported');
   } catch(error) {
    console.log('TRANSPORT_IMPORT_LEGACY_LOCK_READ='+error.code+'; unsupportedVoid='+/void|unsupported/i.test(error.message));
   }
   const {savePreparedSalaryRows,digestRows}=require('../src/services/zermattSalaryBulkPreparationService');
   const {prepareSalaryRows}=require('../src/services/zermattSalarySplit');
   const loadEmployees=(client,org)=>client.$queryRawUnsafe('SELECT * FROM employees WHERE "organizationId"=$1 ORDER BY id',org);
   const bulkStaff=await loadEmployees(actualPrisma,'bulk');
   const source=bulkStaff.map(e=>({'Employee No':e.employeeNumber,'Full Monthly Gross Salary':120000,Currency:'NGN','Effective From':'2026-11-01',Reason:'Synthetic benefit basis'}));
   const previewToken=digestRows(prepareSalaryRows(source,bulkStaff));
   const protectedTables=['payroll_salary_rates','payroll_runs','payroll_run_lines','payroll_loans','zermatt_payroll_split_settings'];
   const protectedSnapshot=async()=>JSON.stringify(await Promise.all(protectedTables.map(async table=>(await pool.query('SELECT row_to_json(t) row FROM '+table+' t ORDER BY row_to_json(t)::text')).rows)));
   const before=await protectedSnapshot();
   const input={organizationId:'bulk',actorUserId:'hr',source,previewToken,loadEmployees};
   assert.equal(await savePreparedSalaryRows(actualPrisma,input),315);
   assert.equal(await savePreparedSalaryRows(actualPrisma,input),315,'Repeat save updates preparations without duplicate rows');
   assert.equal(Number((await pool.query(`SELECT count(*) n FROM zermatt_salary_split_preparations WHERE "organizationId"='bulk'`)).rows[0].n),315);
   const saved=(await pool.query(`SELECT sum("fullMonthlyGross") total FROM zermatt_salary_split_preparations WHERE "organizationId"='bulk'`)).rows[0].total;
   await assert.rejects(savePreparedSalaryRows(actualPrisma,{...input,previewToken:'stale'}),/Preview the upload again/);
   await pool.query(`UPDATE zermatt_salary_split_preparations SET "activatedAt"=CURRENT_TIMESTAMP WHERE "organizationId"='bulk' AND "employeeId"='bulk-e-1'`);
   const changedSource=source.map(row=>({...row,'Full Monthly Gross Salary':140000}));
   await assert.rejects(savePreparedSalaryRows(actualPrisma,{...input,source:changedSource,previewToken:digestRows(prepareSalaryRows(changedSource,bulkStaff))}),/activated record cannot be overwritten/);
   assert.equal((await pool.query(`SELECT sum("fullMonthlyGross") total FROM zermatt_salary_split_preparations WHERE "organizationId"='bulk'`)).rows[0].total,saved,'Protected-row failure rolls back the entire 315-row update');
   assert.equal(Number((await pool.query(`SELECT count(*) n FROM organization_audits WHERE "organizationId"='bulk' AND action='IMPORTED_FOR_REVIEW'`)).rows[0].n),2,'Failed imports create no success audit');
   assert.equal(await protectedSnapshot(),before,'Real adapter benefit imports leave payroll and loan data unchanged');
   console.log('TRANSPORT_IMPORT_PRISMA_315_ROWS=passed; atomicRollback=passed; payrollUnchanged=passed');
  } finally {await actualPrisma.$disconnect();}

  // Exercise Benefits mode inside a rolled-back transaction with existing approved payroll.
  const benefitsClient=await pool.connect();
  await benefitsClient.query('BEGIN');
  try {
   await benefitsClient.query(`INSERT INTO payroll_salary_rates(id,"organizationId","employeeId",amount,"fullMonthlyGross",frequency,"effectiveFrom",status) VALUES('protected-benefit-rate','zll','e1',150000,200000,'MONTHLY','2026-01-01','ACTIVE');
    INSERT INTO payroll_periods VALUES('protected-period','zll','2026-11-01','2026-11-30');
    INSERT INTO payroll_runs VALUES('protected-run','zll','protected-period','APPROVED','APPROVED',CURRENT_TIMESTAMP);
    INSERT INTO payroll_run_lines VALUES('protected-line','zll','e1','protected-run');`);
   for(const e of staff)await benefitsClient.query(`INSERT INTO employee_onboardings VALUES($1,'zll',$2,$3::jsonb,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,['benefit-bank-'+e.id,e.id,JSON.stringify({'payment-details':{bankName:'Fixture Bank',accountName:'Fixture',accountNumber:'1234567890'}})]);
   const protectedTables=['payroll_salary_rates','payroll_periods','payroll_runs','payroll_run_lines','payroll_loans','zermatt_payroll_split_settings'];
   const snapshot=async()=>JSON.stringify(await Promise.all(protectedTables.map(async table=>(await benefitsClient.query('SELECT row_to_json(t) AS row FROM '+table+' t ORDER BY row_to_json(t)::text')).rows)));
   await benefitsClient.query(`INSERT INTO employees(id,"organizationId","employeeNumber","firstName","middleName","lastName","employmentType","hireDate",status) VALUES
    ('benefit-exempt','zll','Z-EXEMPT','Exempt',NULL,'Fixture','Expatriate','2020-01-01','ACTIVE'),
    ('benefit-future','zll','Z-FUTURE','Future',NULL,'Fixture','Full-Time','2026-11-16','ACTIVE')`);
   const beforeBenefits=await snapshot();
   const benefitWrap={...wrap(benefitsClient)};
   const execute=benefitWrap.$executeRawUnsafe;
   benefitWrap.$executeRawUnsafe=async(sql,...args)=>{
    assert.doesNotMatch(sql,/\b(?:UPDATE|INSERT INTO|DELETE FROM)\s+(?:public\.)?(?:payroll_|zermatt_payroll_split_settings)/i,'Benefits must not write salary or regular payroll');
    return execute(sql,...args);
   };
   const benefitsDb={...benefitWrap,$transaction:async fn=>{
    await benefitsClient.query('SAVEPOINT benefits_operation');
    try{const result=await fn(benefitWrap);await benefitsClient.query('RELEASE SAVEPOINT benefits_operation');return result;}
    catch(error){await benefitsClient.query('ROLLBACK TO SAVEPOINT benefits_operation');await benefitsClient.query('RELEASE SAVEPOINT benefits_operation');throw error;}
   }};
   const benefits=require('../src/services/zermattMidmonthService').createService(benefitsDb,{benefitsOnly:true});
   await assert.rejects(benefits.activate('zll','outsider','2026-11'),/assigned/);
   const coverage=await benefits.getPreparationReadiness('zll','hr','2026-11');
   assert.equal(coverage.eligibleEmployees,3);
   assert.equal(coverage.completeEmployees,3);
   assert.equal(coverage.canActivate,true,'Exempt and post-15th employees without bases do not block activation');
   await assert.rejects(benefits.getPreparationReadiness('zll','auditor','2026-11'),/assigned HEAD HR/);
   await benefitsClient.query(`UPDATE zermatt_salary_split_preparations SET "effectiveFrom"='2026-12-01' WHERE id='p1'`);
   const incomplete=await benefits.getPreparationReadiness('zll','hr','2026-11');
   assert.deepEqual(incomplete.missingEmployeeNumbers,['Z2']);
   await assert.rejects(benefits.activate('zll','hr','2026-11'),error=>error.code==='BENEFIT_BASIS_INCOMPLETE'&&error.details.missingEmployeeNumbers.includes('Z2'));
   await benefitsClient.query(`UPDATE zermatt_salary_split_preparations SET "effectiveFrom"='2026-10-01' WHERE id='p1'`);
   assert.equal((await benefits.getPreparationReadiness('zll','hr','2026-11')).canActivate,true,'Earlier reviewed basis remains valid');
   await benefitsClient.query(`UPDATE zermatt_salary_split_preparations SET "effectiveFrom"='2026-11-01' WHERE id='p1'`);
   const enabled=await benefits.activate('zll','hr','2026-11');
   assert.equal(enabled.module,'BENEFITS');
   assert.equal(enabled.payrollWrites,false);
   await benefitsClient.query(`INSERT INTO employees VALUES('new-hire','zll','Z9','New',NULL,'Hire','Full-Time','2026-11-06','ACTIVE')`);
   await require('../src/services/transportBenefitOnboardingService').createOpeningBenefitBasis(benefitWrap,{organizationId:'zll',actorUserId:'hr',employee:{id:'new-hire',employmentType:'Full-Time',hireDate:'2026-11-06'},salary:{amount:144000,currency:'NGN',effectiveFrom:'2026-11-06'}});
   await benefitsClient.query(`INSERT INTO employee_onboardings VALUES('new-hire-bank','zll','new-hire','{"payment-details":{"bankName":"Fixture","accountName":"Fixture","accountNumber":"0012345678"}}'::jsonb,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`);
   const benefitRun=await benefits.generate('zll','hr','2026-11');
   const benefitDetail=await benefits.detail('zll','hr',benefitRun);
   assert.ok(benefitDetail.lines.length>0);
   assert.equal(benefitDetail.lines.find(line=>line.employeeId==='new-hire').snapshot.currentEntitlement,24000,'New hire flows from opening salary mapping into the calculated benefit run');
   assert.ok(!benefitDetail.lines.some(line=>['benefit-exempt','benefit-future'].includes(line.employeeId)),'Zero-entitlement employees do not need a basis or receive guessed support');
   assert.ok(benefitDetail.lines.every(line=>line.snapshot.loanRecovery===0 && line.snapshot.statutoryDeductions===0));
   const first=benefitDetail.lines[0];
   const readMetadata=benefitWrap.employee.findMany;
   let metadataReads=0;
   benefitWrap.employee.findMany=async(args)=>{
    const rows=await readMetadata(args);metadataReads++;
    return metadataReads===2?rows.map(row=>({...row,location:{name:'Concurrent metadata change'}})):rows;
   };
   await assert.rejects(benefits.saveBenefitInputs('zll','hr',benefitRun,first.id,{bonus:9000},'Concurrent source test'),/Source records changed while saving/);
   benefitWrap.employee.findMany=readMetadata;
   assert.equal(Number((await benefits.detail('zll','hr',benefitRun)).lines[0].netPay),Number(first.netPay),'Concurrent source change rolls back benefit edits');

   await assert.rejects(benefits.saveBenefitInputs('zll','auditor',benefitRun,first.id,{bonus:1000},'Unauthorized'),/assigned HEAD HR/);
   await benefits.saveBenefitInputs('zll','hr',benefitRun,first.id,{extraDays:2,phDays:1,bonus:1000,overtimePhPay:2500},'Approved benefit extras');
   let changed=await benefits.detail('zll','hr',benefitRun);
   assert.equal(Number(changed.lines[0].netPay),Number(first.netPay)+3500);
   assert.equal(changed.register.headers.length,20);
   assert.equal(changed.register.rows[0][1],'Fixture Branch');
   assert.equal(changed.register.rows[0][4],'Fixture Position');
   assert.equal(changed.register.rows[0][5],'Fixture Department');
   await benefits.generate('zll','hr','2026-11');
   changed=await benefits.detail('zll','hr',benefitRun);
   assert.equal(changed.lines[0].snapshot.benefitInputs.bonus,1000,'Recalculation preserves saved benefit extras');
   const correctedLine=changed.lines[0];
   const correctedInputs={...correctedLine.snapshot.benefitInputs,previousShortPayment:2000,previousOverpayment:100000};
   await benefits.saveBenefitInputs('zll','hr',benefitRun,correctedLine.id,correctedInputs,'Correct documented opening benefit balances');
   await benefits.generate('zll','hr','2026-11');
   changed=await benefits.detail('zll','hr',benefitRun);
   const correctedSnapshot=changed.lines.find(l=>l.employeeId===correctedLine.employeeId).snapshot;
   assert.equal(correctedSnapshot.previousUnpaid,2000);
   assert.equal(correctedSnapshot.previousOverpaid,100000);
   assert.ok(correctedSnapshot.overpaidRemaining>0);
   await assert.rejects(benefits.decide('zll','auditor',benefitRun,'HEAD_HR_APPROVE','Wrong actor'),/assigned HEAD HR/);
   await benefits.decide('zll','hr',benefitRun,'HEAD_HR_APPROVE','Head HR approved for external Auditor, GM and Accounts');
   await assert.rejects(benefits.saveBenefitInputs('zll','hr',benefitRun,changed.lines[0].id,{bonus:9000},'Locked'),/Only draft or rejected/);
   await assert.rejects(benefits.recordExternalExport('zll','auditor',benefitRun,'external'),/assigned HEAD HR/);
   await benefits.recordExternalExport('zll','hr',benefitRun,'external');
   const approvedBenefit=await benefits.detail('zll','finance',benefitRun);
   await benefits.decide('zll','finance',benefitRun,'CONFIRM_PAYMENT','Benefit fixture receipt',approvedBenefit.lines.map(line=>({lineId:line.id,actualPaid:line.netPay,reference:'Fixture only'})));
   assert.equal((await benefits.detail('zll','hr',benefitRun)).run.status,'PAID');
   const carried=await benefitsClient.query(`SELECT amount FROM zermatt_midmonth_balances WHERE "organizationId"=$1 AND "employeeId"=$2 AND kind='OVERPAID' AND amount>0`,['zll',correctedLine.employeeId]);
   assert.equal(carried.rows.reduce((total,row)=>total+Number(row.amount),0),correctedSnapshot.overpaidRemaining,'Corrected residual carries forward exactly once');
   await assert.rejects(benefits.decide('zll','finance',benefitRun,'CONFIRM_PAYMENT','Duplicate receipt',approvedBenefit.lines.map(line=>({lineId:line.id,actualPaid:line.netPay,reference:'Duplicate'}))),/unavailable/);

   assert.equal(await snapshot(),beforeBenefits,'Benefits activation, approval and payment must leave protected payroll tables byte-identical');
  } finally {await benefitsClient.query('ROLLBACK');benefitsClient.release();}

  await assert.rejects(service.activate('zll','outsider','2026-11'),/assigned/);
  const result=await service.activate('zll','hr','2026-11');assert.equal(result.employees,4);
  await assert.rejects(preparation.preview('zll','hr',correction),/already activated/);
  const rates=(await pool.query('SELECT "employeeId",amount,"fullMonthlyGross" FROM payroll_salary_rates ORDER BY "employeeId"')).rows;
  assert.deepEqual(rates.map(r=>Number(r.amount)),[150000,67200,120000,90000]);
  assert.deepEqual(rates.map(r=>Number(r.fullMonthlyGross)),gross);
  await assert.rejects(service.activate('zll','hr','2026-11'),/already activated/);
  await pool.query(`INSERT INTO employees VALUES('e5','zll','Z5','Five',NULL,'Employee','Full-Time','2026-11-10','ACTIVE')`);
  await assert.rejects(service.generate('zll','hr','2026-11'),/Full salary is missing/);
  await pool.query(`INSERT INTO payroll_salary_rates(id,"organizationId","employeeId",amount,"effectiveFrom",status) VALUES('newhire-rate','zll','e5',100000,'2026-11-10','ACTIVE')`);
  await pool.query(`INSERT INTO employee_onboardings SELECT 'bank-'||id,'zll',id,'{"payment-details":{"bankName":"Fixture Bank","accountName":"Fixture Employee","accountNumber":"0000000000"}}'::jsonb,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM employees`);
  const auto=(await pool.query(`SELECT amount,"fullMonthlyGross" FROM payroll_salary_rates WHERE id='newhire-rate'`)).rows[0];assert.equal(Number(auto.amount),75000);assert.equal(Number(auto.fullMonthlyGross),100000);
  await assert.rejects(service.generate('zll','hr','2026-12'),/cannot be skipped/);
  const run=await service.generate('zll','hr','2026-11');
  await assert.rejects(service.detail('other','outsider',run),/not found/);
  const snapshot=await service.detail('zll','hr',run);assert.equal(snapshot.lines.length,4);
  assert.equal(snapshot.lines.find(l=>l.employeeId==='e5').snapshot.currentEntitlement,10000);
  assert.ok(snapshot.lines.every(l=>l.snapshot.loanRecovery===0&&l.snapshot.statutoryDeductions===0));
  await service.decide('zll','hr',run,'SUBMIT','Ready');
  await assert.rejects(service.decide('zll','hr',run,'AUDIT_APPROVE','Invalid actor'),/assignee/);
  await pool.query(`UPDATE employees SET "lastName"='Changed' WHERE id='e1'`);
  await assert.rejects(service.decide('zll','auditor',run,'AUDIT_APPROVE','Stale'),/records changed/);
  await service.decide('zll','auditor',run,'AUDIT_REJECT','Regenerate after employee correction');
  await service.generate('zll','hr','2026-11');
  await service.decide('zll','hr',run,'SUBMIT','Revalidated');
  await service.decide('zll','auditor',run,'AUDIT_APPROVE','Checked');
  await service.decide('zll','gm',run,'GM_APPROVE','Approved');
  await assert.rejects(service.generate('zll','hr','2026-11'),/locked/);
  const approved=await service.detail('zll','finance',run);
  await assert.rejects(service.decide('zll','finance',run,'CONFIRM_PAYMENT','Missing receipts',[]),/every payroll line/);
  const payments=approved.lines.map(l=>({lineId:l.id,actualPaid:l.employeeId==='e1'?25000:l.employeeId==='e2'?18000:l.employeeId==='e4'?0:Number(l.netPay),reference:'Test receipt or explicit nonpayment'}));
  await service.decide('zll','finance',run,'CONFIRM_PAYMENT','November reconciliation',payments);
  const balancesBefore=(await pool.query('SELECT * FROM zermatt_midmonth_balances ORDER BY id')).rows;
  await assert.rejects(service.decide('zll','finance',run,'CONFIRM_PAYMENT','Duplicate',payments),/current approval stage/);
  assert.deepEqual((await pool.query('SELECT * FROM zermatt_midmonth_balances ORDER BY id')).rows,balancesBefore);
  const december=await service.generate('zll','hr','2026-12');const dec=await service.detail('zll','hr',december);
  const one=dec.lines.find(l=>l.employeeId==='e1').snapshot,two=dec.lines.find(l=>l.employeeId==='e2').snapshot,four=dec.lines.find(l=>l.employeeId==='e4').snapshot;
  assert.equal(one.previousUnpaid,25000);assert.equal(one.netPay,75000);
  assert.equal(two.previousOverpaid,5200);assert.equal(two.netPay,7600);
  assert.equal(four.previousUnpaid,20000);assert.equal(four.netPay,50000);
  await pool.query(`UPDATE employees SET status='INACTIVE' WHERE id='e4';INSERT INTO employee_lifecycle_events VALUES('dec-deactivation','zll','e4','DEACTIVATED','2026-12-15'),('same-month-reactivated','zll','e1','DEACTIVATED','2026-12-10');`);
  await service.generate('zll','hr','2026-12');
  const excluded=await service.detail('zll','hr',december);
  assert.ok(!excluded.lines.some(l=>['e4','e1'].includes(l.employeeId)),'deactivation excludes its full month even with unpaid balances or same-month reactivation');
  assert.equal(Number((await pool.query(`SELECT SUM(amount) amount FROM zermatt_midmonth_balances WHERE "employeeId"='e4' AND kind='UNPAID'`)).rows[0].amount),20000,'carry-forward ledger is retained');
  assert.equal(Number((await pool.query('SELECT amount FROM payroll_loans')).rows[0].amount),70000);
  assert.equal((await pool.query('SELECT count(*)::int as n FROM payroll_runs')).rows[0].n,0);
  assert.equal((await pool.query(`SELECT has_table_privilege('anon','public.zermatt_midmonth_lines','SELECT') as allowed`)).rows[0].allowed,false);
 } finally {await pool.end();}
});


