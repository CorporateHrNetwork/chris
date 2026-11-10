const test=require('node:test');const assert=require('node:assert/strict');
const {salaryBasis,isNorthstar,standardDaysFor}=require('../src/services/northstarPayrollBasis');
const {fictionalSections,ensureNorthstarPayrollRecords}=require('../src/services/northstarPayrollRecords');
const input={organizationId:'chris-demo-org-20261022',slug:'chris-demo-company',policy:{standardDays:{'Full-Time':26,'Part-time':16}},employee:{employmentType:'FULL_TIME'},rate:{amount:176250,fullMonthlyGross:235000},periodMonth:'2026-11'};
test('Northstar full-gross metadata never enters private salary split or exemption logic',()=>{
 const result=salaryBasis(input);assert.equal(result.splitAllocation,null);assert.equal(result.monthlyGross,235000);assert.equal(result.standardDays,26);
 for(const type of ['FULL_TIME','Full-Time','Full Time'])assert.equal(salaryBasis({...input,employee:{employmentType:type}}).standardDays,26);
 assert.equal(salaryBasis({...input,employee:{employmentType:'PART_TIME'}}).standardDays,16);
});
test('private salary split calculations retain their existing allocation',()=>{
 const result=salaryBasis({...input,organizationId:'private-org',slug:'zermatt-liquor-limited',employee:{employmentType:'Full-Time'}});
 assert.equal(result.splitAllocation.midMonthPercentage,25);assert.equal(result.monthlyGross,176250);assert.equal(result.standardDays,26);
});
test('Northstar policy requires both exact identity fields and valid configured standard days',()=>{
 assert.equal(isNorthstar(input.organizationId,'other-company'),false);assert.equal(isNorthstar('other-org',input.slug),false);
 assert.ok(Number.isNaN(standardDaysFor({policy:{standardDays:{}},employmentType:'FULL_TIME',northstar:true})));
});
const employee={id:'fictional-1',employeeNumber:'NSD0001',email:'employee001@northstar-demo.example',firstName:'Example',lastName:'Employee'};
test('fictional statutory and payment records are clearly marked and idempotent',()=>{
 const sections=fictionalSections(employee);assert.match(sections['statutory-details'].taxIdentificationNumber,/DEMO.*NOT-VALID/);
 assert.match(sections['statutory-details'].pensionPin,/DEMO.*NOT-VALID/);assert.equal(sections['payment-details'].accountNumber.length,10);
 assert.equal(sections['payment-details'].demoOnly,true);assert.deepEqual(fictionalSections(employee,sections),sections);
});
test('fixture completion preserves existing profile values and unrelated onboarding sections',()=>{
 const current={'statutory-details':{taxIdentificationNumber:'EXISTING-DEMO-TIN',payeState:'Lagos'},'payment-details':{bankName:'Existing demo bank',accountNumber:'0000000999'},'personal-details':{preferredName:'Example'}};
 const result=fictionalSections(employee,current);assert.equal(result['statutory-details'].taxIdentificationNumber,'EXISTING-DEMO-TIN');
 assert.equal(result['payment-details'].accountNumber,'0000000999');assert.deepEqual(result['personal-details'],current['personal-details']);
});
test('only explicitly fictional Northstar employee identifiers can receive fixture fields',()=>{
 assert.equal(fictionalSections({...employee,email:'person@example.com'}),null);assert.equal(fictionalSections({...employee,employeeNumber:'ZLL000001'}),null);
});
test('other tenants never enter fixture persistence',async()=>{
 await ensureNorthstarPayrollRecords({organizationId:'another-org',prismaClient:new Proxy({},{get(){throw Error('unexpected persistence');}})});
 const result=await ensureNorthstarPayrollRecords({organizationId:input.organizationId,prismaClient:{organization:{findUnique:async()=>({slug:'wrong-company'})}}});
 assert.equal(result.updated,0);
});
test('fixture persistence is scoped, audited and does not alter onboarding completion',async()=>{
 const writes=[];let record={id:'onboarding-1',sectionData:{},completionPercent:25,status:'IN_PROGRESS'};
 const tx={employee:{findMany:async query=>{assert.equal(query.where.organizationId,input.organizationId);return [employee];}},
 employeeOnboarding:{findFirst:async()=>record,update:async query=>{writes.push(query);record={...record,...query.data};}},
 organizationAudit:{create:async query=>{assert.equal(query.data.organizationId,input.organizationId);assert.equal(query.data.newValue.demoOnly,true);}}};
 const client={organization:{findUnique:async()=>({slug:input.slug})},$transaction:async callback=>callback(tx)};
 assert.equal((await ensureNorthstarPayrollRecords({organizationId:input.organizationId,prismaClient:client})).updated,1);
 assert.equal(record.status,'IN_PROGRESS');assert.equal(record.completionPercent,25);assert.equal(writes[0].where.organizationId_id.organizationId,input.organizationId);
 assert.equal((await ensureNorthstarPayrollRecords({organizationId:input.organizationId,prismaClient:client})).updated,0);
});
