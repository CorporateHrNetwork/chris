const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),XLSX=require('xlsx');
const access=require('../src/services/branchAccountantPayrollAccessService');
const locations=[{id:'abj',code:'ABJ',type:'BRANCH',name:'Abuja'},{id:'lag',code:'LAG',type:'BRANCH',name:'Lagos'},{id:'phc',code:'PHC',type:'BRANCH',name:'PHC'}];
const request=(branch,scope)=>({auth:{organizationId:'tenant',userId:'accountant',organization:{slug:'zermatt-liquor-limited'},roles:['Branch Accountant'],permissions:['payroll.view','reports.export'],locationScope:'ASSIGNED_LOCATIONS',activeLocationId:branch,availableLocations:locations.filter(l=>l.id===branch)},query:scope?{scope}:{},params:{id:'run'}});
test('branch accountants stay assigned; only Abuja gains payroll-only Head Office access',()=>{
 for(const branch of ['lag','phc']){
  assert.deepEqual(access.options(request(branch)).map(s=>s.id),[branch]);
  assert.throws(()=>access.resolve(request(branch,'HEAD_OFFICE')),e=>e.statusCode===403);
  assert.throws(()=>access.resolve(request(branch,'abj')),e=>e.statusCode===403);
 }
 const req=request('abj','HEAD_OFFICE'),before=JSON.stringify(req.auth);
 assert.equal(access.resolve(req).locationIds,null);assert.deepEqual(access.options(req).map(s=>s.id),['abj','HEAD_OFFICE']);assert.equal(JSON.stringify(req.auth),before);
 assert.throws(()=>access.resolve(request('abj','lag')),e=>e.statusCode===403);
 const other=request('abj');other.auth.organization.slug='different-tenant';assert.throws(()=>access.options(other));
 const hr=request('abj');hr.auth.roles=['Head of HR & Admin'];assert.throws(()=>access.options(hr));
 const unassigned=request('none');assert.throws(()=>access.resolve(unassigned));
});
test('run totals query binds tenant and selected locations and excludes archived payrolls',async()=>{
 const calls=[];await access.listRuns({$queryRawUnsafe:async(...a)=>(calls.push(a),[])},'tenant',access.resolve(request('lag')));
 assert.deepEqual(calls[0].slice(1),['tenant',['lag']]);assert.match(calls[0][0],/e\."locationId"=ANY\(\$2::text\[\]\)/);assert.match(calls[0][0],/pr\."archivedAt" IS NULL AND pp\."archivedAt" IS NULL/);
});
test('PostgreSQL run totals reconcile for each branch and Head Office without archived or foreign rows',async()=>{
 const {PGlite}=require('@electric-sql/pglite');const db=new PGlite();
 try {
  await db.exec(`CREATE TABLE payroll_periods(id text PRIMARY KEY,"organizationId" text,code text,name text,"periodStart" date,"periodEnd" date,"payDate" date,"archivedAt" timestamptz);
   CREATE TABLE payroll_runs(id text PRIMARY KEY,"organizationId" text,"periodId" text,status text,"statutoryStatus" text,"createdAt" timestamptz,"updatedAt" timestamptz,"archivedAt" timestamptz);
   CREATE TABLE employees(id text PRIMARY KEY,"organizationId" text,"locationId" text);
   CREATE TABLE payroll_run_lines(id text,"organizationId" text,"runId" text,"employeeId" text,"grossPay" numeric,deductions numeric,"advanceRecovery" numeric,"loanRecovery" numeric,"netPreview" numeric,details jsonb);
   INSERT INTO payroll_periods VALUES('p','tenant','2026-10','October','2026-10-01','2026-10-31','2026-10-31',NULL),('old','tenant','OCT-2026','Old','2026-10-01','2026-10-31','2026-10-31',now());
   INSERT INTO payroll_runs VALUES('run','tenant','p','DRAFT','CALCULATED',now(),now(),NULL),('old','tenant','old','DRAFT','CALCULATED',now(),now(),NULL),('archived','tenant','p','DRAFT','CALCULATED',now(),now(),now());
   INSERT INTO employees VALUES('1','tenant','abj'),('2','tenant','lag'),('3','tenant','phc'),('4','other','lag');
   INSERT INTO payroll_run_lines SELECT 'line'||id,'tenant','run',id,100000,5000,1000,1000,97000,'{"leaveAllowance":{"amount":4000}}'::jsonb FROM employees;
   INSERT INTO payroll_run_lines VALUES('old','tenant','old','1',999999,0,0,0,999999,'{}'),('archived','tenant','archived','1',999999,0,0,0,999999,'{}');`);
  const client={$queryRawUnsafe:async(sql,...values)=>(await db.query(sql,values)).rows};
  for(const branch of ['abj','lag','phc']){
   const runs=await access.listRuns(client,'tenant',access.resolve(request(branch)));
   assert.equal(runs.length,1);assert.equal(runs[0].employeeCount,1);assert.equal(runs[0].grossTotal,100000);assert.equal(runs[0].deductionTotal,7000);assert.equal(runs[0].netPreviewTotal,97000);assert.equal(runs[0].leaveAllowanceTotal,4000);
  }
  const all=await access.listRuns(client,'tenant',access.resolve(request('abj','HEAD_OFFICE')));
  assert.equal(all.length,1);assert.equal(all[0].employeeCount,3);assert.equal(all[0].grossTotal,300000);
  assert.deepEqual(await access.listRuns(client,'foreign',access.resolve(request('lag'))),[]);
 } finally {await db.close();}
});
function harness(status='DRAFT'){
 const routes=new Map(),audits=[],queries=[];
 const run={id:'run',periodId:'period',periodCode:'2026-10',status,employeeCount:3,grossTotal:300000,deductionTotal:21000,netPreviewTotal:279000,leaveAllowanceTotal:0};
 const employees=locations.map((l,i)=>({id:String(i+1),location:l,email:'synthetic@example.invalid',employmentType:'FULL_TIME',department:{name:'Finance'},designation:{name:'Synthetic'},onboardings:[{sectionData:{'statutory-details':{pensionPfa:'PFA',pensionPin:'PEN'+i,taxIdentificationNumber:'TIN'+i,payeState:l.name}}}]}));
 const lines=employees.map(e=>({id:'line'+e.id,employeeId:e.id,employeeNumber:'SYN'+e.id,employeeName:'Synthetic '+e.location.name,currency:'NGN',grossPay:100000,baseSalary:57000,allowances:43000,deductions:5000,advanceRecovery:1000,loanRecovery:1000,netPreview:93000,details:{organizationSnapshot:{locationName:e.location.name},statutory:{payeTax:5000},attendance:{standardDays:26,payableDays:26}}}));
 const db={employee:{findMany:async({where})=>employees.filter(e=>where.id.in.includes(e.id)&&(!where.locationId||where.locationId.in.includes(e.location.id)))},organization:{findUnique:async()=>({name:'Synthetic Organization',slug:'zermatt-liquor-limited'})},organizationAudit:{create:async({data})=>audits.push(data)},$queryRawUnsafe:async(sql,...args)=>{queries.push({sql,args});return [];}};
 const router={use(){},get(p,...handlers){routes.set(p,handlers);},post(){},put(){},patch(){},delete(){}};
 const multer=()=>({single:()=>()=>{}});multer.memoryStorage=()=>({});
 // Exercise the real permission middleware without opening a database connection.
 const authSandbox={module:{exports:{}},require:()=>({})};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/middleware/authMiddleware.js'),'utf8'),authSandbox);
 const sandbox={module:{exports:{}},Buffer,process,console,require:id=>{
  if(id==='express')return {Router:()=>router};if(id==='multer')return multer;if(id==='xlsx')return XLSX;
  if(id==='../config/prisma')return db;
  if(id==='../middleware/authMiddleware')return authSandbox.module.exports;
  if(id==='../services/branchAccountantPayrollAccessService')return access;
  if(id==='../services/payrollOperationsService')return {listRuns:async({organizationId})=>organizationId==='tenant'?[run]:[],listRunLines:async()=>lines,operationalError:(code,message,statusCode)=>Object.assign(new Error(message),{code,statusCode})};
  if(id==='../services/payrollReportIncidentService')return require('../src/services/payrollReportIncidentService');
  if(id==='../services/payrollSupplementaryReportService')return require('../src/services/payrollSupplementaryReportService');
  if(id==='../services/excelNativeChartService')return {addNativeExcelCharts:b=>b};
  return {};
 }};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/routes/payrollRoutes.js'),'utf8'),sandbox);
 async function call(route,req){
  const res={statusCode:200,headers:{},status(n){this.statusCode=n;return this;},json(data){this.data=data;return this;},send(data){this.data=data;return this;},setHeader(k,v){this.headers[k]=v;}};
  const handlers=routes.get(route);assert.ok(handlers,route);let index=0;
  const pending=[];
  function next(){const handler=handlers[index++];if(handler){const task=Promise.resolve(handler(req,res,next));pending.push(task);return task;}}
  next();await Promise.all(pending);return res;
 }
 return {call,audits,queries,run,lines};
}
test('scoped view and real workbook contain only permitted employees, totals, incidents and loan evidence',async()=>{
 const h=harness();const before=JSON.stringify([h.run,h.lines]);
 for(const branch of ['abj','lag','phc']){
  const req=request(branch);
  const detail=await h.call('/accountant/runs/:id',req);assert.equal(detail.statusCode,200);assert.equal(detail.data.data.lines.length,1);assert.equal(detail.data.data.run.employeeCount,1);assert.equal(detail.data.data.run.grossTotal,100000);assert.equal(detail.data.data.run.deductionTotal,7000);assert.equal(detail.data.data.run.netPreviewTotal,93000);
  const exported=await h.call('/accountant/runs/:id/export.xlsx',req);assert.equal(exported.statusCode,200);
  const wb=XLSX.read(exported.data,{type:'buffer'}),rows=XLSX.utils.sheet_to_json(wb.Sheets['Payroll Register']);
  assert.equal(rows.length,1);assert.equal(rows[0]['Employee Name'],'Synthetic '+locations.find(l=>l.id===branch).name);assert.equal(rows[0]['Net Pay'],93000);
  assert.ok(wb.Sheets['Pension - Details Present']);assert.ok(!wb.Sheets['Payment Register']);assert.ok(!wb.Sheets['External Handoff']);assert.ok(!wb.Sheets['External HR Review']);
 }
 assert.equal(h.audits.length,3);assert.ok(h.audits.every(a=>a.action==='ACCOUNTANT_PAYROLL_EXPORTED'&&a.newValue.employeeCount===1));
 assert.ok(!h.queries.some(q=>/reviewRunId/.test(q.sql)),'branch copies omit consolidated HR decision narratives');
 for(const q of h.queries.filter(q=>/FROM payroll_loans/.test(q.sql)))assert.equal(q.args[1].length,1);
 assert.equal(JSON.stringify([h.run,h.lines]),before);
});
test('Abuja consolidated copy preserves status without payout action; forbidden scopes, tenants and exports fail closed',async()=>{
 const h=harness('APPROVED');
 const req=request('abj','HEAD_OFFICE');
 const detail=await h.call('/accountant/runs/:id',req);assert.equal(detail.data.data.lines.length,3);
 const exported=await h.call('/accountant/runs/:id/export.xlsx',req),wb=XLSX.read(exported.data,{type:'buffer'});
 assert.equal(XLSX.utils.sheet_to_json(wb.Sheets['Payroll Register']).length,3);
 assert.match(wb.Sheets['Workflow Control'].B5.v,/APPROVED.*ACCOUNTANT REVIEW COPY/);assert.ok(!wb.Sheets['Payment Register']);assert.equal(h.run.status,'APPROVED');
 for(const branch of ['lag','phc'])assert.equal((await h.call('/accountant/runs/:id/export.xlsx',request(branch,'HEAD_OFFICE'))).statusCode,403);
 const noExport=request('lag');noExport.auth.permissions=['payroll.view'];assert.equal((await h.call('/accountant/runs/:id/export.xlsx',noExport)).statusCode,403);
 const foreign=request('abj');foreign.auth.organizationId='other';assert.equal((await h.call('/accountant/runs/:id',foreign)).statusCode,404);
 assert.equal(h.audits.length,1);
});
