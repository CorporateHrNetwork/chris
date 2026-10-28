const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname,'../src/services/eosbService.js'),'utf8');
function fixture({type='Full-time',amount=200000,committed=false,cover=300000,suretyType='Full-time',surety='S', own=159485.76, totalExposure=0, currentLoan=0, excludeLoanId=null}={}) {
 const employees = [{id:'app',employeeNumber:'A',employmentType:type,status:'ACTIVE',hireDate:'2020-01-01'}, {id:'surety',employeeNumber:'S',employmentType:suretyType,status:'ACTIVE',hireDate:'2020-01-01'}];
 const client = {organization:{findUnique:async()=>({id:'org',slug:'zermatt-liquor-limited'})},employee:{findFirst:async({where})=>employees.find(e=>e.employeeNumber===where.employeeNumber)},$queryRawUnsafe:async(sql,...params)=>{
  if(sql.includes('JOIN LATERAL')) return committed && params[1]==='S' ? [{id:'other',outstandingAmount:1000,assessment:{surety:{coveredAmount:1000}}}]:[];
  if(sql.includes('payroll_salary_rates'))return employees.map(e=>({employeeId:e.id,amount:(e.id==='app'?own:cover)/(.075*(2492/30)),effectiveFrom:'2010-01-01'}));
  if(sql.includes('SELECT \"outstandingAmount\"')) return [{outstandingAmount:currentLoan}];
  if(sql.includes('payroll_loans'))return totalExposure ? [{employeeId:'app',status:'ACTIVE',outstandingAmount:totalExposure}] : [];
  throw Error(sql);
 }};
 const module={exports:{}};vm.runInNewContext(source,{require:()=>client,module,exports:module.exports,Date,Number,Math,Set});
 return module.exports.assessLoanCollateral({organizationId:'org',employeeNumber:'A',requestedAmount:amount,suretyEmployeeNumber:surety,excludeLoanId,asOf:'2026-10-28',prismaClient:client});
}
test('only the shortfall is guaranteed',async()=>{const a=await fixture();assert.equal(a.surety.coveredAmount,40514.24);assert.equal(a.applicantCoveredAmount,159485.76);});
test('a loan within own EoSB needs no surety',async()=>{assert.equal((await fixture({amount:100000,surety:null})).surety,null);});
test('missing surety and insufficient surety capacity block recording',async()=>{await assert.rejects(fixture({surety:null}),{code:'LOAN_SURETY_REQUIRED'});await assert.rejects(fixture({cover:20000}),{code:'LOAN_SURETY_COLLATERAL_INSUFFICIENT'});});
test('one outstanding loan per surety, including expatriates',async()=>{await assert.rejects(fixture({committed:true}),{code:'LOAN_SURETY_ALREADY_COMMITTED'});await assert.rejects(fixture({committed:true,suretyType:'Expatriate'}),{code:'LOAN_SURETY_ALREADY_COMMITTED'});});
test('expatriates may guarantee without EoSB',async()=>{const a=await fixture({suretyType:'Expatriate',cover:0});assert.equal(a.surety.eosbExempt,true);assert.equal(a.surety.coveredAmount,40514.24);});
test('other employment types require full cover and cannot act as sureties',async()=>{assert.equal((await fixture({type:'Part-time'})).surety.coveredAmount,200000);await assert.rejects(fixture({suretyType:'Part-time'}),{code:'LOAN_SURETY_TYPE_INELIGIBLE'});});
test('self guarantee is blocked',async()=>{await assert.rejects(fixture({surety:'A'}),{code:'LOAN_SELF_SURETY_NOT_ALLOWED'});});

test('Postgres reservations isolate tenants and release only closed or repaid loans',async()=>{
 const { PGlite } = require('@electric-sql/pglite');
 const db = new PGlite();
 try {
 await db.exec(`CREATE TABLE payroll_loans (id text,"organizationId" text,status text,"outstandingAmount" numeric);
 CREATE TABLE organization_audits (id text,"organizationId" text,"entityId" text,"entityType" text,"newValue" jsonb,"createdAt" timestamp);
 INSERT INTO payroll_loans VALUES ('live','org','PAUSED',200000),('paid','org','COMPLETED',0),('foreign','other','ACTIVE',10000);
 INSERT INTO organization_audits VALUES ('a','org','live','PayrollLoan','{"collateral":{"surety":{"employeeNumber":"S","coveredAmount":40514.24}}}','2026-10-01'),('b','org','paid','PayrollLoan','{"collateral":{"surety":{"employeeNumber":"S","coveredAmount":999}}}','2026-10-01'),('c','other','foreign','PayrollLoan','{"collateral":{"surety":{"employeeNumber":"S","coveredAmount":999}}}','2026-10-01');`);
 const client={$queryRawUnsafe:async(sql,...params)=>(await db.query(sql,params)).rows};
 const module={exports:{}};vm.runInNewContext(source+'\nmodule.exports.commitments=suretyCommitments;',{require:()=>client,module,exports:module.exports,Date,Number,Math,Set});
 const rows=await module.exports.commitments(client,'org','S');
 assert.equal(rows.length,1);assert.equal(rows[0].id,'live');assert.equal(rows[0].assessment.surety.coveredAmount,40514.24);
 assert.equal((await module.exports.commitments(client,'org','S','live')).length,0);
 await db.exec(`UPDATE payroll_loans SET "outstandingAmount"=0 WHERE id='live'`);
 assert.equal((await module.exports.commitments(client,'org','S')).length,0);
 } finally { await db.close(); }
});

test('top-up restores only its own exposure before assessing the merged balance',async()=>{
 const a=await fixture({amount:300000,totalExposure:250000,currentLoan:200000,excludeLoanId:'current'});
 assert.equal(a.availableCollateral,109485.76);assert.equal(a.surety.coveredAmount,190514.24);
});
