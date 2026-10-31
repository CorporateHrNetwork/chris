const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {PGlite}=require('@electric-sql/pglite');
function load(name,deps) {const module={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/services',name),'utf8'),{module,exports:module.exports,require:id=>id in deps ? deps[id] : require(id),process,console,Date,Set,Map,Proxy,Reflect,AbortSignal,fetch});return module.exports;}
const access=load('zermattHrFinancialAccessService.js',{'../config/prisma':{}});
const approvals=load('payrollApprovalWorkflowService.js',{'../config/prisma':{},'./payrollStageEmailService':{TASKS:{},queueStageEmail:async()=>{}}});
const variable=load('zermattVariablePayrollService.js',{'../config/prisma':{}});
const request=(role='Head of HR & Admin',userId='hr',branch=null)=>({auth:{userId,organizationId:'z',organization:{slug:'zermatt-liquor-limited'},roles:[role],permissions:[],locationScope:branch ? 'ASSIGNED_LOCATIONS' : 'ALL_LOCATIONS',availableLocations:[{id:branch || 'b'}],activeLocationId:branch}});
async function fixture(t) {
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
 CREATE TABLE organizations(id text PRIMARY KEY,slug text);
 INSERT INTO organizations VALUES ('z','zermatt-liquor-limited'),('other','other');
 CREATE TABLE users(id text PRIMARY KEY,"organizationId" text,"firstName" text,"lastName" text,email text,"isActive" boolean);
 INSERT INTO users VALUES ('hr','z','Head','HR','hr@example.invalid',true),('audit','z','Head','Audit','audit@example.invalid',true),('branch','z','Branch','HR','branch@example.invalid',true);
 CREATE TABLE roles(id text PRIMARY KEY,name text);INSERT INTO roles VALUES ('hr','Head of HR & Admin'),('audit','Head of Audit & Internal Controls');
 CREATE TABLE user_roles("userId" text,"roleId" text);INSERT INTO user_roles VALUES ('hr','hr'),('audit','audit');
 CREATE TABLE payroll_approval_assignments(id text,"organizationId" text,responsibility text,"assignedUserId" text,"assignedByUserId" text,"isActive" boolean,"assignedAt" timestamp DEFAULT now());
 INSERT INTO payroll_approval_assignments VALUES ('ah','z','HEAD_HR','hr','hr',true,now()),('aa','z','PAYROLL_AUDITOR','audit','hr',true,now());
 CREATE TABLE employees(id text PRIMARY KEY,"organizationId" text,"employeeNumber" text,"firstName" text,"middleName" text,"lastName" text,"locationId" text);
 INSERT INTO employees VALUES ('e','z','001','Test',null,'Employee','b'),('away','z','002','Other',null,'Branch','away'),('foreign','other','003','Foreign',null,'Employee','b');
 CREATE TABLE organization_locations(id text,"organizationId" text,name text);INSERT INTO organization_locations VALUES ('b','z','Test Branch');
 CREATE TABLE payroll_periods(id text,"organizationId" text,code text,name text,"periodStart" date,"periodEnd" date,status text);
 INSERT INTO payroll_periods VALUES ('p','z','2026-10','October','2026-10-01','2026-10-31','OPEN');
 CREATE TABLE payroll_approval_workflows(id text,"organizationId" text,"runId" text,stage text);
 CREATE TABLE payroll_runs(id text PRIMARY KEY,"organizationId" text,"periodId" text,status text,"grossTotal" numeric,"deductionTotal" numeric,"netPreviewTotal" numeric,"updatedAt" timestamp DEFAULT now());
 INSERT INTO payroll_runs VALUES ('run','z','p','DRAFT',200000,20000,180000,now());
 CREATE TABLE payroll_run_lines(id text PRIMARY KEY,"organizationId" text,"runId" text,"employeeId" text,"employeeNumber" text,"employeeName" text,currency text,"baseSalary" numeric,allowances numeric,deductions numeric,"advanceRecovery" numeric,"loanRecovery" numeric,"grossPay" numeric,"netPreview" numeric,details jsonb,"createdAt" timestamp DEFAULT now(),"updatedAt" timestamp DEFAULT now());
 INSERT INTO payroll_run_lines VALUES ('line','z','run','e','001','Test Employee','NGN',100000,100000,20000,0,0,200000,180000,'{"statutory":{"payeTax":20000}}',now(),now());
 CREATE TABLE payroll_variable_components(id text PRIMARY KEY,"organizationId" text,code text,name text,kind text,"calculationType" text,taxable boolean,"installmentEligible" boolean,"isSystem" boolean,status text,notes text,UNIQUE("organizationId",code));
 CREATE TABLE payroll_variable_inputs(id text PRIMARY KEY,"organizationId" text,"employeeId" text,"componentId" text,"payrollPeriodId" text,"manualAmount" numeric,quantity numeric,"referencePayrollPeriodId" text,reference text,remarks text,source text,status text,"createdByUserId" text,"createdAt" timestamp DEFAULT now(),"updatedAt" timestamp DEFAULT now());
 CREATE TABLE attendance_payroll_inputs(id text,"organizationId" text,"employeeId" text,"periodStart" date,"periodEnd" date,"workedDays" numeric,notes text,"recordedByUserId" text,UNIQUE("organizationId","employeeId","periodStart","periodEnd"));
 `);
 await db.exec('ALTER TABLE payroll_periods ADD COLUMN \"createdAt\" timestamp DEFAULT now(),ADD COLUMN \"updatedAt\" timestamp DEFAULT now()');
 const original=fs.readFileSync(path.join(__dirname,'../prisma/migrations/20261007190000_chris_payroll_performance_automation/migration.sql'),'utf8');
 await db.exec(original.slice(0,original.indexOf('CREATE TABLE IF NOT EXISTS "chris_performance_cycles"')));
 await db.exec(fs.readFileSync(path.join(__dirname,'../prisma/migrations/20261017002000_zermatt_payroll_notes_agent/migration.sql'),'utf8'));
 const makeClient=connection=>({
  $transaction:fn=>connection.transaction(tx=>fn(makeClient(tx))),
  $queryRawUnsafe:async(sql,...args)=>(await connection.query(sql,args)).rows,
  $executeRawUnsafe:async(sql,...args)=>(await connection.query(sql,args)).affectedRows,
  employee:{findFirst:async({where})=>(await connection.query('SELECT * FROM employees WHERE "organizationId"=$1 AND id=$2',[where.organizationId,where.id])).rows[0]},
  organizationAudit:{create:async()=>({})},
  attendancePayrollInput:{upsert:async({create:c,update:u})=>connection.query('INSERT INTO attendance_payroll_inputs (id,"organizationId","employeeId","periodStart","periodEnd","workedDays",notes,"recordedByUserId") VALUES (\'att\',$1,$2,$3,$4,$5,$6,$7) ON CONFLICT ("organizationId","employeeId","periodStart","periodEnd") DO UPDATE SET "workedDays"=$5,notes=$6', [c.organizationId,c.employeeId,c.periodStart,c.periodEnd,u.workedDays,u.notes,u.recordedByUserId])}
 });
 const client=makeClient(db);
 const nigeria={executeNigeriaDraftPayroll:async({prismaClient:tx})=>{
  const override=(await tx.$queryRawUnsafe('SELECT "monthlyGross" FROM "chris_payroll_note_salary_overrides"'))[0];
  const inputs=await tx.$queryRawUnsafe('SELECT "manualAmount" FROM payroll_variable_inputs WHERE status=\'ACTIVE\'');
  const att=(await tx.$queryRawUnsafe('SELECT "workedDays" FROM attendance_payroll_inputs'))[0];
  const gross=Number(override?.monthlyGross || 200000)*Number(att?.workedDays ?? 26)/26+inputs.reduce((s,r)=>s+Number(r.manualAmount || 0),0);
  await tx.$executeRawUnsafe('UPDATE payroll_run_lines SET "grossPay"=$1::numeric,"baseSalary"=$1::numeric/2,allowances=$1::numeric/2,deductions=$1::numeric/10,"netPreview"=$1::numeric*0.9,"updatedAt"=CURRENT_TIMESTAMP,details=$2::jsonb',gross,JSON.stringify({statutory:{payeTax:gross/10},scheduledMonthlyGross:Number(override?.monthlyGross || 200000),attendance:{payableDays:Number(att?.workedDays ?? 26)}}));
 }};
 const service=load('payrollNoteWorkflowService.js',{'../config/prisma':client,'./zermattHrFinancialAccessService':access,'./payrollApprovalWorkflowService':approvals,'./zermattVariablePayrollService':variable,'./nigeriaPayrollComplianceService':nigeria});
 await variable.ensureZermattComponentCatalogue({organizationId:'z',prismaClient:client});
 const submit=()=>service.submit({req:request('HR & Admin Officer','branch','b'),input:{employeeId:'e',payrollPeriodId:'p',originalNote:'Please add bonus 10000 for October.'},prismaClient:client});
 const review=async(note,actions=[{type:'VARIABLE_INPUT',componentCode:'ALW-BONUS',mode:'ADD',amount:10000}])=>service.review({req:request(),id:note.id,input:{revision:note.revision,reviewedNote:'Approved October bonus 10000',actions},prismaClient:client});
 return {db,client,service,submit,review};
}
test('branch note routes to both inboxes; HR review, rollback preview, atomic execution, retry, audit and history',async t=>{
 const {db,client,service,submit,review}=await fixture(t);
 const n=await submit();assert.equal((await db.query('SELECT * FROM chris_payroll_note_inbox')).rows.length,2);
 const reviewed=await review(n);assert.equal(reviewed.originalNote,n.originalNote);assert.equal(reviewed.revision,1);
 const p=await service.preview({req:request(),id:n.id,input:{revision:1},prismaClient:client});
 assert.equal(p.afterTotals.netPreview,189000);assert.equal((await db.query('SELECT * FROM payroll_variable_inputs')).rows.length,0,'preview rolls back inputs');
 assert.equal(Number((await db.query('SELECT "netPreview" FROM payroll_run_lines')).rows[0].netPreview),180000,'preview rolls back payroll');
 const implement=()=>service.implement({req:request(),id:n.id,input:{revision:1,previewId:p.id},prismaClient:client});
 await implement();await implement();assert.equal((await db.query('SELECT * FROM payroll_variable_inputs')).rows.length,1,'retry cannot duplicate allowance');
 assert.equal(Number((await db.query('SELECT "netPreviewTotal" FROM payroll_runs')).rows[0].netPreviewTotal),189000);
 const a=await service.detail({req:request('Head of Audit & Internal Controls','audit'),id:n.id,prismaClient:client});assert.equal(a.currentMatchesImplementation,true);assert.ok(a.events.some(e=>e.action==='AGENT_IMPLEMENTED'));
 await service.audit({req:request('Head of Audit & Internal Controls','audit'),id:n.id,input:{revision:1,decision:'VERIFIED',notes:'Checked payroll figures.'},prismaClient:client});
 assert.equal((await db.query('SELECT * FROM chris_payroll_note_events WHERE action=\'AUDITOR_VERIFIED\'')).rows.length,1);
 const branch=await service.detail({req:request('HR & Admin Officer','branch','b'),id:n.id,prismaClient:client});assert.equal(branch.note.preview,null);assert.equal(branch.note.implementation.changes,undefined);
 await assert.rejects(()=>review({...n,revision:1}),/immutable/);
});
test('branch isolation, foreign employees, role spoofing and audit execution are rejected',async t=>{
 const {client,service,submit}=await fixture(t);const n=await submit();
 for(const employeeId of ['away','foreign']) await assert.rejects(()=>service.submit({req:request('HR & Admin Officer','branch','b'),input:{employeeId,payrollPeriodId:'p',originalNote:'Test'},prismaClient:client}));
 await assert.rejects(()=>service.detail({req:request('HR & Admin Officer','branch','away'),id:n.id,prismaClient:client}),/outside/);
 await assert.rejects(()=>service.review({req:request('Head of Audit & Internal Controls','audit'),id:n.id,input:{reviewedNote:'Test',actions:[]},prismaClient:client}),/restricted/);
 await assert.rejects(()=>service.implement({req:request('HR & Admin Officer','branch','b'),id:n.id,input:{revision:0},prismaClient:client}),/restricted/);
 const spoof=request('Chief Accountant','hr');spoof.auth.permissions=['payroll.manage','loans.verify'];assert.equal(service.capabilities(spoof).canReview,false);
});
test('stale previews, final payroll, changed inputs and concurrent note revisions cannot mutate payroll',async t=>{
 const {db,client,service,submit,review}=await fixture(t);const n=await submit();await review(n);
 await assert.rejects(()=>review(n),/changed/);
 const p=await service.preview({req:request(),id:n.id,input:{revision:1},prismaClient:client});
 await db.exec('UPDATE payroll_run_lines SET "netPreview"=179999');
 await assert.rejects(()=>service.implement({req:request(),id:n.id,input:{revision:1,previewId:p.id},prismaClient:client}),/changed since preview/);
 assert.equal((await db.query('SELECT * FROM payroll_variable_inputs')).rows.length,0);
 await db.exec('UPDATE payroll_runs SET status=\'APPROVED\'');
 await assert.rejects(()=>service.preview({req:request(),id:n.id,input:{revision:1},prismaClient:client}),/draft payroll/);
 assert.equal((await db.query('SELECT * FROM payroll_variable_inputs')).rows.length,0);
});
test('monthly gross and attendance corrections remain scoped and previewable',async t=>{
 const {db,client,service,submit,review}=await fixture(t);const n=await submit();await review(n,[{type:'MONTHLY_GROSS',amount:260000},{type:'ATTENDANCE',workedDays:20}]);
 const p=await service.preview({req:request(),id:n.id,input:{revision:1},prismaClient:client});assert.equal(p.afterTotals.grossPay,200000);assert.equal((await db.query('SELECT * FROM chris_payroll_note_salary_overrides')).rows.length,0);
 await service.implement({req:request(),id:n.id,input:{revision:1,previewId:p.id},prismaClient:client});
 const override=(await db.query('SELECT * FROM chris_payroll_note_salary_overrides')).rows[0];assert.equal(override.periodId,'p');assert.equal(Number(override.monthlyGross),260000);
});
test('changed payroll inputs roll back execution; active audit/GM review blocks previews',async t=>{
 const {db,client,service,submit,review}=await fixture(t);const n=await submit();await review(n);
 const p=await service.preview({req:request(),id:n.id,input:{revision:1},prismaClient:client});
 await variable.createVariableInput({organizationId:'z',actorUserId:'hr',input:{employeeNumber:'001',componentCode:'ALW-BONUS',kind:'ALLOWANCE',payrollPeriodId:'p',amount:2000},prismaClient:client});
 await assert.rejects(()=>service.implement({req:request(),id:n.id,input:{revision:1,previewId:p.id},prismaClient:client}),/inputs have changed/);
 assert.equal(Number((await db.query('SELECT "manualAmount" FROM payroll_variable_inputs WHERE status=\'ACTIVE\'')).rows[0].manualAmount),2000,'uncommitted ADD and recalculation are rolled back');
 assert.equal(Number((await db.query('SELECT "netPreview" FROM payroll_run_lines')).rows[0].netPreview),180000);
 await db.exec('INSERT INTO payroll_approval_workflows VALUES (\'wf\',\'z\',\'run\',\'PENDING_GM\')');
 await assert.rejects(()=>service.preview({req:request(),id:n.id,input:{revision:1},prismaClient:client}),/under review/);
});

test('removing a reviewed component preserves its cancelled history and requires a new preview',async t=>{
 const {db,client,service,submit,review}=await fixture(t);
 await variable.createVariableInput({organizationId:'z',actorUserId:'hr',input:{employeeNumber:'001',componentCode:'ALW-BONUS',kind:'ALLOWANCE',payrollPeriodId:'p',amount:10000},prismaClient:client});
 const n=await submit();await review(n,[{type:'VARIABLE_INPUT',componentCode:'ALW-BONUS',mode:'REMOVE'}]);
 const p=await service.preview({req:request(),id:n.id,input:{revision:1},prismaClient:client});
 assert.equal((await db.query('SELECT status FROM payroll_variable_inputs')).rows[0].status,'ACTIVE');
 await service.implement({req:request(),id:n.id,input:{revision:1,previewId:p.id},prismaClient:client});
 assert.equal((await db.query('SELECT status FROM payroll_variable_inputs')).rows[0].status,'CANCELLED');
});
