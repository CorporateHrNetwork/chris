const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const {createRequire}=require('node:module');
process.env.DATABASE_URL||='postgresql://test:test@127.0.0.1:5432/chris_test';
const actual=require('../src/services/payrollPayslipEmailService');
const approved={employeeNumber:'SYN-001',employeeName:'Synthetic Employee',employeeEmail:'',runStatus:'APPROVED',organizationName:'Synthetic QA',currency:'NGN',periodCode:'2026-10',periodName:'October 2026',grossPay:120000,netPreview:107483.2,details:{salaryStructure:{basic:68400},statutory:{payeTax:5028.8,employeePension:7488}}};
function handler(prisma){const routes=new Map(),router={get:(p,...h)=>routes.set(p,h.at(-1)),post:()=>{}};const file=path.join(__dirname,'../src/routes/essRoutes.js'),module={exports:{}};const normal=createRequire(file);vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,exports:module.exports,require:id=>id==='express'?{Router:()=>router}:id==='../config/prisma'?prisma:id==='../middleware/authMiddleware'?{requireEssAuth:()=>{}}:normal(id),Buffer,console,process,Date,Set,Map,URL});return routes.get('/payslips/:id/download');}
function response(){return {headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v;},status(v){this.statusCode=v;return this;},json(v){this.body=v;return this;},send(v){this.body=v;return this;}};}
test('ESS returns the same official PDF as email with correct MIME/extension and without requiring an employee email',async()=>{
 const calls=[];const prisma={$queryRawUnsafe:async(sql,...params)=>{calls.push({sql,params});return calls.length===1?[{id:'line'}]:[approved];}};
 const res=response();await handler(prisma)({essAuth:{organizationId:'org',employeeId:'employee'},params:{id:'line'}},res);
 assert.equal(res.statusCode,200);assert.equal(res.headers['Content-Type'],'application/pdf');assert.match(res.headers['Content-Disposition'],/2026-10-SYN-001\.pdf/);assert.equal(res.headers['Cache-Control'],'private, no-store');assert.equal(res.body.subarray(0,5).toString(),'%PDF-');assert.equal(Number(res.headers['Content-Length']),res.body.length);
 assert.deepEqual(calls[0].params,['org','employee','line']);assert.match(calls[0].sql,/"status"='APPROVED'/);
 const expected=await actual.buildPayslipEmail(approved);assert.deepEqual(res.body,Buffer.from(expected.attachment.content,'base64'));
 assert.match(res.body.toString('binary'),/Generated from an approved payroll/);assert.match(res.body.toString('binary'),/Powered by CHRiS/);
 await assert.rejects(()=>actual.loadApprovedPayslip({organizationId:'org',payrollRunLineId:'line',prismaClient:{$queryRawUnsafe:async()=>[approved]}}),/does not have an email address/);
});
test('ESS rejects a payslip outside the authenticated employee scope before loading PDF details',async()=>{
 let calls=0;const res=response();await handler({$queryRawUnsafe:async()=>{calls++;return [];}})({essAuth:{organizationId:'other-org',employeeId:'other-employee'},params:{id:'line'}},res);assert.equal(res.statusCode,404);assert.equal(calls,1);assert.equal(res.headers['Content-Type'],undefined);
});
