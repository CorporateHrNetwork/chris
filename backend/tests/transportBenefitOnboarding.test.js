const test=require('node:test'),assert=require('node:assert/strict');
const {createOpeningBenefitBasis}=require('../src/services/transportBenefitOnboardingService');
const employee={id:'e',employeeNumber:'Z1',employmentType:'Full-Time',hireDate:new Date('2026-11-06')};
function fixture(){const writes=[],audits=[];return {writes,audits,tx:{$executeRawUnsafe:async(sql,...values)=>{writes.push({sql,values});return 1;},organizationAudit:{create:async({data})=>audits.push(data)}}};}
test('opening gross maps a benefit-only basis and applies hire-date proration',async()=>{
 const f=fixture();const result=await createOpeningBenefitBasis(f.tx,{organizationId:'org',actorUserId:'hr',employee,salary:{amount:144000,currency:'NGN',effectiveFrom:'2026-11-06'}});
 assert.equal(result.effectiveFrom,'2026-11-01');assert.equal(result.allocation.midMonthPayable,24000);
 assert.equal(f.writes.length,1);assert.ok(f.writes[0].sql.includes('zermatt_salary_split_preparations'));
 assert.equal(f.writes[0].values[1],'org');assert.equal(f.writes[0].values[2],'e');
 assert.equal(f.audits[0].action,'ONBOARDING_BENEFIT_BASIS_CREATED');assert.equal(f.audits[0].newValue.payrollWrites,false);
});
test('future and non-fulltime hires do not receive invented support; non-NGN is not converted',async()=>{
 const f=fixture();const late=await createOpeningBenefitBasis(f.tx,{organizationId:'org',employee:{...employee,hireDate:'2026-11-20'},salary:{amount:144000,currency:'NGN',effectiveFrom:'2026-11-20'}});
 assert.equal(late.effectiveFrom,'2026-12-01');assert.equal(late.allocation.midMonthPayable,36000);
 const exempt=await createOpeningBenefitBasis(f.tx,{organizationId:'org',employee:{...employee,employmentType:'Part-time'},salary:{amount:144000,currency:'NGN',effectiveFrom:'2026-11-01'}});
 assert.equal(exempt.allocation.midMonthPayable,0);
 assert.equal(await createOpeningBenefitBasis(f.tx,{organizationId:'org',employee,salary:{amount:1000,currency:'USD',effectiveFrom:'2026-11-01'}}),null);
 assert.equal(f.writes.length,2);
});
