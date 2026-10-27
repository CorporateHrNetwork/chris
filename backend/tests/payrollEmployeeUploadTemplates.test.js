const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const XLSX = require('xlsx');
const T = require('../src/services/payrollVariableInputTemplateService');
const employees = [
  { employeeNumber:'ZLL000001',firstName:'Synthetic',middleName:'Test',lastName:'One',locationId:'a',location:{name:'Abuja'} },
  { employeeNumber:'ZLL000002',firstName:'Synthetic',lastName:'Two',locationId:'b',location:{name:'Lagos'} },
];
const components=[{kind:'ALLOWANCE',code:'ALW-BON',name:'Bonus',calculationType:'ENTERED_AMOUNT',status:'ACTIVE'},{kind:'ALLOWANCE',code:'ALW-PH',name:'Public Holiday',calculationType:'DAY_BASED',status:'ACTIVE'},{kind:'DEDUCTION',code:'DED-TEST',name:'Test deduction',calculationType:'ENTERED_AMOUNT',installmentEligible:true,status:'ACTIVE'}];
const periods=[{id:'period',code:'2026-10',name:'October 2026',periodStart:'2026-10-01',periodEnd:'2026-10-31',status:'OPEN'}];
function harness() {
 const routes=[];const auth=()=>{};let employeeWhere;
 const router={get:(...args)=>routes.push(['GET',...args]),post:(...args)=>routes.push(['POST',...args]),patch(){},put(){},delete(){},use(){}};
 const prisma={employee:{findMany:async options=>{employeeWhere=options.where;return employees.filter(e=>{
   if(options.where.organizationId!=='session-org')return false;
   if(!options.where.locationId)return true;
   return typeof options.where.locationId==='string'?e.locationId===options.where.locationId:options.where.locationId.in.includes(e.locationId);
 })}}};
 const payroll={listPeriods:async({organizationId})=>{assert.equal(organizationId,'session-org');return periods},operationalError:(code,message)=>Object.assign(new Error(message),{code,statusCode:400})};
 const variable={listVariableComponents:async({organizationId,kind})=>{assert.equal(organizationId,'session-org');return components.filter(c=>c.kind===kind)},buildInstallmentSchedule:()=>({schedule:[]})};
 const multer=()=>({single:()=>()=>{}});multer.memoryStorage=()=>({});
 const sandbox={module:{exports:{}},console,Buffer,process,require:id=>{
  if(id==='express')return {Router:()=>router};if(id==='multer')return multer;if(id==='xlsx')return XLSX;
  if(id==='../config/prisma')return prisma;
  if(id==='../middleware/authMiddleware')return {requireAuth:auth,requirePermission:()=>auth};
  if(id==='../services/payrollOperationsService')return payroll;
  if(id==='../services/zermattVariablePayrollService')return variable;
  if(id==='../services/payrollVariableInputTemplateService')return T;
  return {};
 }};
 const source=fs.readFileSync(path.join(__dirname,'../src/routes/payrollRoutes.js'),'utf8');
 vm.runInNewContext(source+'\nmodule.exports.testPrepareVariableInputWorkbook = prepareVariableInputWorkbook;',sandbox);
 const res={headers:{},setHeader(k,v){this.headers[k]=v},send(buffer){this.buffer=buffer;return this},status(code){this.statusCode=code;return this},json(body){this.body=body;return this}};
 return {routes,res,prepare:sandbox.module.exports.testPrepareVariableInputWorkbook,where:()=>employeeWhere};
}
function workbookRows(buffer) {const book=XLSX.read(buffer,{type:'buffer'});return XLSX.utils.sheet_to_json(book.Sheets['Payroll Inputs'],{defval:'',raw:false});}
function enteredBuffer(kind, edits) {
 const buffer=T.variableInputTemplateBuffer({kind,employees,components,periods,payrollPeriodCode:'2026-10'});
 const book=XLSX.read(buffer,{type:'buffer'});const rows=XLSX.utils.sheet_to_json(book.Sheets['Payroll Inputs'],{header:1,defval:''});
 for(const [row,col,value] of edits)rows[row][T.HEADERS.indexOf(col)]=value;
 book.Sheets['Payroll Inputs']=XLSX.utils.aoa_to_sheet(rows);return XLSX.write(book,{type:'buffer',bookType:'xlsx'});
}
const auth={organizationId:'session-org',locationScope:'ALL_LOCATIONS',availableLocations:[]};

test('both downloadable templates contain authoritative employee numbers, full names and branches',()=>{
 for(const kind of ['ALLOWANCE','DEDUCTION']){
  const buffer=T.variableInputTemplateBuffer({kind,employees,components,periods,payrollPeriodCode:'2026-10'});
  const book=XLSX.read(buffer,{type:'buffer'});assert.equal(book.SheetNames[0],'Payroll Inputs');
  const rows=workbookRows(buffer);assert.equal(rows.length,2);
  assert.equal(rows[0]['Employee No'],'ZLL000001');assert.equal(rows[0]['Employee Name'],'Synthetic Test One');assert.equal(rows[0].Branch,'Abuja');
  assert.equal(rows[1]['Employee No'],'ZLL000002');assert.equal(rows[1]['Employee Name'],'Synthetic Two');assert.equal(rows[1].Branch,'Lagos');
  assert.equal(rows[0].Kind,kind);assert.equal(rows[0]['Payroll Period'],'2026-10');assert.equal(rows[0].Amount,'');
  assert.ok(rows.every(row=>!T.hasPayrollEntry(row)));
  const catalogue=XLSX.utils.sheet_to_json(book.Sheets['Component Catalogue']);assert.ok(catalogue.every(row=>row.Kind===kind));
 }
});
test('template roster lookup enforces tenant, active branch and assigned-location scope',async()=>{
 for(const [requestAuth,expectedCount] of [[auth,2],[{...auth,activeLocationId:'b'},1],[{...auth,locationScope:'ASSIGNED_LOCATIONS',availableLocations:[{id:'a'}]},1],[{...auth,locationScope:'ASSIGNED_LOCATIONS',availableLocations:[]},0],[{...auth,locationScope:'ASSIGNED_LOCATIONS',availableLocations:[{id:'a'}],activeLocationId:'b'},0]]){
  const h=harness();const route=h.routes.find(r=>r[0]==='GET'&&r[1]==='/variable-inputs/template');
  await route.at(-1)({auth:requestAuth,query:{kind:'DEDUCTION',organizationId:'foreign-org',payrollPeriodId:'period'}},h.res);
  assert.equal(h.where().organizationId,'session-org');assert.equal(h.res.headers['Cache-Control'],'no-store');assert.equal(workbookRows(h.res.buffer).length,expectedCount);
 }
});
test('unknown and closed/foreign period requests fail instead of selecting another tenant period',async()=>{
 const h=harness();const route=h.routes.find(r=>r[0]==='GET'&&r[1]==='/variable-inputs/template');
 await route.at(-1)({auth,query:{kind:'DEDUCTION',payrollPeriodId:'foreign-period'}},h.res);assert.equal(h.res.statusCode,400);assert.equal(h.res.body.code,'INVALID_PAYROLL_PERIOD');
});
test('populated roster skips untouched employees and preserves actual worksheet row numbers',async()=>{
 const h=harness();const buffer=enteredBuffer('DEDUCTION',[[2,'Component Code','DED-TEST'],[2,'Amount',2500]]);
 const result=await h.prepare({auth},buffer,'DEDUCTION');assert.equal(result.length,1);assert.equal(result[0].rowNumber,3);assert.equal(result[0].valid,true);assert.equal(result[0].input.employeeNumber,'ZLL000002');assert.equal(result[0].input.amount,2500);
 await assert.rejects(h.prepare({auth},enteredBuffer('DEDUCTION',[]),'DEDUCTION'),{code:'EMPTY_PAYROLL_INPUTS'});
});
test('employee name mismatch fails validation; identity is never resolved by row order',async()=>{
 const h=harness();let rows=await h.prepare({auth},enteredBuffer('ALLOWANCE',[[1,'Component Code','ALW-BON'],[1,'Amount',5000],[1,'Employee Name','Synthetic Two']]),'ALLOWANCE');
 assert.equal(rows[0].valid,false);assert.ok(rows[0].errors.some(e=>e.includes('Employee Name does not match')));assert.equal(rows[0].input,null);
 rows=await h.prepare({auth},enteredBuffer('ALLOWANCE',[[1,'Component Code','ALW-BON'],[1,'Amount',5000],[1,'Employee Name','  synthetic   TEST one  ']]),'ALLOWANCE');assert.equal(rows[0].valid,true);
});
test('entered rows outside branch scope remain blocked and never produce an import input',async()=>{
 const h=harness();const rows=await h.prepare({auth:{...auth,activeLocationId:'a'}},enteredBuffer('DEDUCTION',[[2,'Component Code','DED-TEST'],[2,'Amount',2500]]),'DEDUCTION');
 assert.equal(rows[0].valid,false);assert.equal(rows[0].input,null);assert.ok(rows[0].errors.some(e=>e.includes('outside the active branch')));
});
test('formula-based allowances still require quantities and legacy files without Employee Name remain accepted',async()=>{
 const h=harness();const rows=await h.prepare({auth},enteredBuffer('ALLOWANCE',[[1,'Component Code','ALW-PH'],[1,'Amount',5000]]),'ALLOWANCE');assert.equal(rows[0].valid,false);assert.ok(rows[0].errors.some(e=>e.includes('Quantity')));
 const legacy=XLSX.utils.book_new();XLSX.utils.book_append_sheet(legacy,XLSX.utils.json_to_sheet([{'Employee No':'ZLL000001',Kind:'ALLOWANCE','Component Code':'ALW-BON',Frequency:'ONE_TIME','Payroll Period':'2026-10',Amount:5000}]),'Payroll Inputs');
 const result=await h.prepare({auth},XLSX.write(legacy,{type:'buffer',bookType:'xlsx'}),'ALLOWANCE');assert.equal(result[0].valid,true);
});

test('recurring deduction columns round-trip, and an entered zero is validated rather than skipped',async()=>{
 const h=harness();const recurring=enteredBuffer('DEDUCTION',[[1,'Component Code','DED-TEST'],[1,'Frequency','RECURRING'],[1,'Total Amount',30000],[1,'Schedule By','INSTALLMENT_COUNT'],[1,'Number of Installments',3],[1,'Start Payroll Period','2026-10']]);
 const rows=await h.prepare({auth},recurring,'DEDUCTION');assert.equal(rows[0].valid,true);assert.equal(rows[0].input.totalAmount,30000);assert.equal(rows[0].input.installmentCount,3);assert.equal(rows[0].input.startPayrollPeriodId,'period');
 const zero=await h.prepare({auth},enteredBuffer('DEDUCTION',[[1,'Component Code','DED-TEST'],[1,'Amount',0]]),'DEDUCTION');assert.equal(zero.length,1);assert.equal(zero[0].valid,false);
});
