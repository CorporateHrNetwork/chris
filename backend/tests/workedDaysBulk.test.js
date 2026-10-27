const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const XLSX=require('xlsx');
function load(relative,resolve) {const sandbox={module:{exports:{}},Buffer,console,require:resolve};vm.runInNewContext(fs.readFileSync(path.join(__dirname,relative),'utf8'),sandbox);return sandbox.module.exports;}
const freshness=load('../src/services/payrollDraftFreshnessService.js',id=>id==='../config/prisma'?{}:require(id));
const service=load('../src/services/workedDaysBulkService.js',id=>id==='./payrollDraftFreshnessService'?freshness:id.startsWith('./')?require('../src/services/'+id.slice(2)):require(id));
const auth={organizationId:'org',userId:'hr',locationScope:'ALL_LOCATIONS',availableLocations:[]};
const roster=[{id:'e1',organizationId:'org',employeeNumber:'ZLL000001',firstName:'Synthetic',lastName:'One',locationId:'a',location:{name:'Abuja'}},{id:'e2',organizationId:'org',employeeNumber:'ZLL000002',firstName:'Synthetic',lastName:'Two',locationId:'b',location:{name:'Lagos'}}];
function database() {
 const state={period:{id:'p',code:'2026-10',periodStart:'2026-10-01',periodEnd:'2026-10-31',status:'OPEN'},canonical:'p',runs:[],workflows:[],inputs:[],audits:[],roster:structuredClone(roster),writes:0,failAudit:false};
 const db={state,employee:{findMany:async({where})=>state.roster.filter(e=>e.organizationId===where.organizationId && (!where.locationId || (typeof where.locationId==='string'?e.locationId===where.locationId:where.locationId.in.includes(e.locationId))))},
 attendancePayrollInput:{findMany:async({where})=>structuredClone(state.inputs.filter(i=>i.organizationId===where.organizationId&&where.employeeId.in.includes(i.employeeId))),upsert:async({where,create,update})=>{state.writes++;const row=state.inputs.find(i=>i.employeeId===where.organizationId_employeeId_periodStart_periodEnd.employeeId);if(row){Object.assign(row,update,{updatedAt:new Date('2026-10-27')});return row;}const n={id:'input-'+state.writes,...create,updatedAt:new Date('2026-10-27')};state.inputs.push(n);return n;}},
 organizationAudit:{create:async({data})=>{if(state.failAudit)throw new Error('synthetic audit failure');state.audits.push(data);return data;}},
 $queryRawUnsafe:async(sql,...params)=>{
  assert.equal(params[0],'org');
  if(sql.startsWith('UPDATE')) return state.runs.map(r=>({...r,periodId:'p',statutoryStatus:'RECALCULATION_REQUIRED'}));
  if(sql.includes('SELECT "id" FROM "payroll_periods"'))return [{id:state.canonical}];
  if(sql.includes('SELECT * FROM "payroll_periods"'))return params[1]==='p'?[state.period]:[];
  if(sql.includes('SELECT w.'))return state.workflows;
  if(sql.includes('SELECT r.'))return state.runs;
  throw new Error(sql);
 },
 $transaction:async(fn,options)=>{assert.equal(options.isolationLevel,'Serializable');const backup=structuredClone(state);try{return await fn(db);}catch(e){Object.assign(state,backup);throw e;}}
 };return db;
}
function buffer(rows,mutate) {const wb=XLSX.utils.book_new();const ws=XLSX.utils.aoa_to_sheet([service.HEADERS,...rows]);if(mutate)mutate(ws);XLSX.utils.book_append_sheet(wb,ws,'Worked Days');return XLSX.write(wb,{type:'buffer',bookType:'xlsx'});}
const entry=(no='ZLL000001',name='Synthetic One',branch='Abuja',days=24,notes='Approved absence')=>[no,name,branch,'2026-10',days,notes];
async function preview(db,b,requestAuth=auth){return (await service.prepare(db,requestAuth,'p',b)).data;}
test('template contains scoped employee identity, selected period and blank days; numbers remain text',async()=>{
 const db=database();const wb=XLSX.read(await service.template(db,{...auth,activeLocationId:'a'},'p'),{type:'buffer'});
 const rows=XLSX.utils.sheet_to_json(wb.Sheets['Worked Days'],{defval:''});assert.equal(rows.length,1);assert.equal(rows[0]['Employee No'],'ZLL000001');assert.equal(rows[0]['Employee Name'],'Synthetic One');assert.equal(rows[0]['Worked Days'],'');assert.equal(rows[0]['Payroll Period'],'2026-10');assert.equal(wb.Sheets['Worked Days'].A2.t,'s');
 const empty=XLSX.read(await service.template(db,{...auth,locationScope:'ASSIGNED_LOCATIONS',availableLocations:[]},'p'),{type:'buffer'});assert.equal(XLSX.utils.sheet_to_json(empty.Sheets['Worked Days']).length,0);
});
test('preview skips blank days, retains explicit zero and reports actual worksheet rows',async()=>{
 const db=database();const p=await preview(db,buffer([entry('ZLL000001','Synthetic One','Abuja',''),entry('ZLL000002','Synthetic Two','Lagos',0)]));assert.equal(p.validRows,1);assert.equal(p.skippedRows,1);assert.equal(p.rows[0].rowNumber,3);assert.equal(p.rows[0].workedDays,0);assert.equal(db.state.writes,0);
});
test('invalid numbers, names, branch, period, duplicate, missing reason and outside-scope rows are blocked atomically',async()=>{
 const cases=[entry('FOREIGN'),entry('ZLL000001','Wrong Name'),entry('ZLL000001','Synthetic One','Wrong Branch'),entry('ZLL000001','Synthetic One','Abuja',-1),entry('ZLL000001','Synthetic One','Abuja',32),entry('ZLL000001','Synthetic One','Abuja','many'),entry('ZLL000001','Synthetic One','Abuja',24,''),[...entry().slice(0,3),'2026-11',24,'reason']];
 for(const row of cases){const db=database();const b=buffer([row]);const p=await preview(db,b);assert.equal(p.invalidRows,1);await assert.rejects(service.importWorkbook(db,auth,'p',b,p.previewToken));assert.equal(db.state.writes,0);}
 const db=database();assert.equal((await preview(db,buffer([entry(),entry()]))).invalidRows,1);
 const out=await preview(db,buffer([entry('ZLL000002','Synthetic Two','Lagos')]),{...auth,activeLocationId:'a'});assert.equal(out.invalidRows,1);
});
test('closed, foreign, duplicate periods and submitted/approved/reviewed payroll cannot be changed',async()=>{
 for(const setup of [s=>s.period.status='CLOSED',s=>s.canonical='other',s=>s.runs=[{id:'r',status:'SUBMITTED'}],s=>s.runs=[{id:'r',status:'APPROVED'}],s=>s.workflows=[{stage:'AUDIT_APPROVED'}]]) {const db=database();setup(db.state);await assert.rejects(service.prepare(db,auth,'p',buffer([entry()])));assert.equal(db.state.writes,0);}
 await assert.rejects(service.template(database(),auth,'foreign'));
});
test('preview shows replacement; import preserves hours, records actor/reason and marks draft stale',async()=>{
 const db=database();db.state.runs=[{id:'r',status:'DRAFT'}];db.state.inputs=[{id:'old',organizationId:'org',employeeId:'e1',workedDays:26,workedHours:208,notes:'Previous',updatedAt:'old'}];
 const b=buffer([entry()]);const p=await preview(db,b);assert.equal(p.rows[0].previousDays,26);assert.equal(p.rows[0].action,'UPDATE');
 const result=await service.importWorkbook(db,auth,'p',b,p.previewToken);assert.equal(result.importedRows,1);assert.equal(db.state.inputs[0].workedDays,24);assert.equal(db.state.inputs[0].workedHours,208);assert.equal(db.state.inputs[0].recordedByUserId,'hr');assert.equal(db.state.audits[0].reason,'Approved absence');assert.equal(db.state.audits[0].oldValue.workedDays,26);assert.equal(result.payrollDraftFreshness.markedRuns,1);
});
test('changed file, changed existing record, changed scope, changed period status require new preview',async()=>{
 const db=database();const b=buffer([entry()]);const p=await preview(db,b);
 await assert.rejects(service.importWorkbook(db,auth,'p',buffer([entry('ZLL000001','Synthetic One','Abuja',25)]),p.previewToken),/Preview again/);
 db.state.inputs.push({id:'new',organizationId:'org',employeeId:'e1',workedDays:20});await assert.rejects(service.importWorkbook(db,auth,'p',b,p.previewToken),/Preview again/);
 await assert.rejects(service.importWorkbook(db,{...auth,activeLocationId:'b'},'p',b,p.previewToken));
 db.state.period.status='CLOSED';await assert.rejects(service.importWorkbook(db,auth,'p',b,p.previewToken));assert.equal(db.state.writes,0);
});
test('audit failure rolls back all entries; retry requires fresh preview after successful import',async()=>{
 const db=database();const b=buffer([entry(),entry('ZLL000002','Synthetic Two','Lagos',25)]);const p=await preview(db,b);db.state.failAudit=true;
 await assert.rejects(service.importWorkbook(db,auth,'p',b,p.previewToken),/audit failure/);assert.equal(db.state.inputs.length,0);assert.equal(db.state.writes,0);
 db.state.failAudit=false;await service.importWorkbook(db,auth,'p',b,p.previewToken);assert.equal(db.state.inputs.length,2);await assert.rejects(service.importWorkbook(db,auth,'p',b,p.previewToken),/Preview again/);
});
test('malformed/empty/formula workbooks are rejected and bulk routes enforce existing HR permissions',async()=>{
 const db=database();await assert.rejects(preview(db,buffer([entry('ZLL000001','Synthetic One','Abuja','')])));
 await assert.rejects(preview(db,buffer([entry()],ws=>{ws.E2={t:'n',v:24,f:'12+12'};})),/formulas/);
 assert.throws(()=>service.parseWorkbook(Buffer.from('not excel')),/template|read/);
 const routes=fs.readFileSync(path.join(__dirname,'../src/routes/workedDaysBulkRoutes.js'),'utf8');assert.match(routes,/router.use\(requireAnyPermission\('attendance.manage','payroll.manage'\)\)/);
 const parent=fs.readFileSync(path.join(__dirname,'../src/routes/attendanceRoutes.js'),'utf8');assert.ok(parent.indexOf('requireAuth\n')<parent.indexOf('router.use("/worked-days/bulk"'));
});


test('Head Office and branch template downloads remain available during payroll review and after approval, with import locks intact',async()=>{
 const contexts=[
  {...auth,activeLocationId:null},
  {...auth,activeLocationId:'a'},
  {...auth,locationScope:'ASSIGNED_LOCATIONS',availableLocations:[{id:'b'}],activeLocationId:'b'},
 ];
 for(const status of ['DRAFT','SUBMITTED','PENDING_APPROVAL','APPROVED']) {
  for(const stage of ['DRAFT','AUDIT_REVIEW','AUDIT_APPROVED','GM_APPROVED']) {
   for(const requestAuth of contexts) {
    const db=database();db.state.runs=[{id:'r',status}];db.state.workflows=[{stage}];
    const b=await service.template(db,requestAuth,'p');
    const rows=XLSX.utils.sheet_to_json(XLSX.read(b,{type:'buffer'}).Sheets['Worked Days']);
    assert.equal(rows.length,requestAuth.activeLocationId?1:2);
    if(requestAuth.activeLocationId) assert.equal(rows[0].Branch,requestAuth.activeLocationId==='a'?'Abuja':'Lagos');
    assert.equal(db.state.writes,0);assert.equal(db.state.audits.length,0);
    if(status!=='DRAFT' || stage!=='DRAFT') {
     const employee=requestAuth.activeLocationId==='b'?entry('ZLL000002','Synthetic Two','Lagos'):entry();
     await assert.rejects(service.prepare(db,requestAuth,'p',buffer([employee])));
     await assert.rejects(service.importWorkbook(db,requestAuth,'p',buffer([employee]),'stale-preview'));
     assert.equal(db.state.writes,0);
    }
   }
  }
 }
});
