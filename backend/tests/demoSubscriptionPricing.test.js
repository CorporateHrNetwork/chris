'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {PLANS,HRIS,ESS,getEntitlements,calculateQuote}=require('../src/services/demoSubscriptionPricing');
test('demo three-plan monthly rates and ESS option',()=>{
 assert.deepEqual([PLANS.basic.licenceMonthly,PLANS.standard.licenceMonthly,PLANS.premium.licenceMonthly],[1500,1700,1900]);
 for(const id of ['basic','standard','premium'])assert.equal(PLANS[id].essMonthly,1000);
 assert.deepEqual([PLANS.basic.onboardingMonthly,PLANS.standard.onboardingMonthly,PLANS.premium.onboardingMonthly],[800,900,1000]);
 assert.deepEqual([PLANS.basic.supportMonthly,PLANS.standard.supportMonthly,PLANS.premium.supportMonthly],[800,900,1000]);
});
test('48-seat first year and renewal with optional ESS and illustrative VAT',()=>{
 const totals={basic:2538720,standard:2786400,premium:3034080};
 const renewal={basic:2043360,standard:2229120,premium:2414880};
 for(const id of Object.keys(totals)){
  const r=calculateQuote({planId:id,employeeCount:48,includeEss:true});
  assert.equal(r.quote.total,totals[id]);assert.equal(r.renewal.total,renewal[id]);
  assert.equal(r.renewal.lineItems.onboarding,0);
  assert.equal(r.quote.lineItems.onboarding,PLANS[id].onboardingMonthly*48*12);
  const without=calculateQuote({planId:id,employeeCount:48,includeEss:false});
  assert.equal(without.quote.lineItems.ess,0);assert.deepEqual(without.quote.entitlements.ess,[]);
 }
});
test('complete main-menu and ESS modules, with progressive plan inclusion',()=>{
 assert.equal(Object.keys(HRIS).length,20);assert.equal(Object.keys(ESS).length,15);
 assert.equal(getEntitlements('basic').hris.includes('billing_subscription'),true);
 assert.equal(getEntitlements('basic').hris.includes('recruitment'),false);
 assert.equal(getEntitlements('standard').hris.includes('recruitment'),true);
 assert.equal(getEntitlements('premium').hris.includes('performance'),true);
 assert.equal(getEntitlements('standard').ess.includes('running_loans'),true);
 assert.equal(getEntitlements('premium').ess.includes('probation_assessments'),true);
 assert.equal(getEntitlements('premium').ess.includes('disciplinary_cases'),true);
 assert.equal(getEntitlements('basic').hris.includes('reports_analytics'),true);
});
test('rejects invalid seats and plan',()=>{
 assert.throws(()=>calculateQuote({planId:'basic',employeeCount:0}),RangeError);
 assert.throws(()=>calculateQuote({planId:'unknown',employeeCount:48}),RangeError);
});

test('renewal uses independently specified renewal seats and then-current plan prices, with no onboarding',()=>{
 const q=calculateQuote({planId:'basic',employeeCount:48,renewalEmployeeCount:65,includeEss:true});
 assert.equal(q.quote.employeeCount,48);
 assert.equal(q.renewal.employeeCount,65);
 assert.equal(q.renewal.lineItems.licence,1500*65*12);
 assert.equal(q.renewal.lineItems.ess,1000*65*12);
 assert.equal(q.renewal.lineItems.support,800*65*12);
 assert.equal(q.renewal.lineItems.onboarding,0);
 assert.equal(q.renewal.total,2767050);
 assert.equal(q.renewal.pricingBasis,'CURRENT_APPROVED_RATES_AT_ACTUAL_RENEWAL_DATE');
 assert.match(q.renewal.pricingNote,/currently published demo rates only/);
 const noEss=calculateQuote({planId:'premium',employeeCount:48,renewalEmployeeCount:65,includeEss:false});
 assert.equal(noEss.renewal.lineItems.ess,0);
 assert.throws(()=>calculateQuote({planId:'basic',employeeCount:48,renewalEmployeeCount:0}),RangeError);
 assert.throws(()=>calculateQuote({planId:'basic',employeeCount:48,renewalEmployeeCount:100001}),RangeError);
});
