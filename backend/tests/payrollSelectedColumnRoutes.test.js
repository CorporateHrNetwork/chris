const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),XLSX=require('xlsx');
function fixture(){
 const source=fs.readFileSync(require.resolve('../src/routes/payrollRoutes'),'utf8');
 const segment=source.slice(source.indexOf('// Selected-column copies'),source.indexOf('router.get("/runs/:id/draft-review.xlsx"'));
 const handlers={},audits=[];
 const context={run:{status:'SUBMITTED',periodCode:'2026-11'},lines:[],employeeMeta:new Map()};
 vm.runInNewContext(segment,{router:{get:(path,...fns)=>{handlers[path]=fns;}},requirePermission:()=>()=>{},isZermatt:()=>true,isHeadHr:req=>req.auth.userId==='hr',isPayrollAuditor:()=>false,isGeneralManager:()=>false,isChiefAccountant:()=>false,
  payrollExportContext:async(org,id)=>{assert.equal(org,'org');assert.equal(id,'run');return context;},
  payrollWorkbookModel:()=>({headers:['Employee No','Branch','Net Pay','Account Number'],rows:[{cells:['Z1','ABUJA BRANCH',50000,'0012345678']}]}),
  XLSX,require:()=>require('../src/services/payrollRegisterExport'),prisma:{organizationAudit:{create:async({data})=>audits.push(data)}},payroll:{operationalError:(code,message,statusCode)=>Object.assign(new Error(message),{code,statusCode})},sendError:(res,e)=>res.status(e.statusCode||500).json({message:e.message}),JSON});
 return {handlers,audits};
}
function response(){return {statusCode:200,status(n){this.statusCode=n;return this;},json(value){this.body=value;return this;},setHeader(){},type(){return this;},send(value){this.body=value;return this;}};}
test('selected-column endpoint rejects non-workflow users and exports only selected fields without payout transition',async()=>{
 const f=fixture(),route=f.handlers['/runs/:id/register-export.xlsx'];
 const denied=response();route[1]({auth:{userId:'branch'}},denied,()=>assert.fail('Unauthorized'));
 assert.equal(denied.statusCode,403);
 const req={auth:{organizationId:'org',userId:'hr'},params:{id:'run'},query:{columns:'[0,1,2]',schema:JSON.stringify(['Employee No','Branch','Net Pay','Account Number'])}};
 const res=response();await route.at(-1)(req,res);assert.equal(res.statusCode,200);
 const book=XLSX.read(res.body,{type:'buffer'});assert.ok(book.SheetNames.includes('Port Harcourt'));
 assert.deepEqual(XLSX.utils.sheet_to_json(book.Sheets['Payroll Register'],{header:1})[0],['Employee No','Branch','Net Pay']);
 for(const sheet of Object.values(book.Sheets))assert.ok(!JSON.stringify(sheet).includes('0012345678'),'Unselected bank account must not appear elsewhere');
 assert.equal(f.audits.length,1);assert.equal(f.audits[0].newValue.status,'SUBMITTED');
 const stale=response();await route.at(-1)({...req,query:{...req.query,schema:'[]'}},stale);assert.equal(stale.statusCode,409);assert.equal(f.audits.length,1);
 const invalid=response();await route.at(-1)({...req,query:{...req.query,columns:'[]'}},invalid);assert.equal(invalid.statusCode,400);
});
