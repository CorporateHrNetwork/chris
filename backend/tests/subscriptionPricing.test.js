'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateQuote, calculateRenewalQuote, getEntitlements } = require('../src/services/subscriptionPricing');
test('Zermatt 320 employee quotations, including 7.5% illustrative VAT', () => {
 const expected = { basic:8256000, standard:9941600, premium:11214400 };
 // Reconcile against itemized totals: annual rates are per employee per year.
 for (const [planId,total] of Object.entries(expected)) {
   const q=calculateQuote({planId,employeeCount:320});
   assert.equal(q.total,total);
 }
});
test('payment-date licensing, one-time onboarding and no grace period', () => {
 const q=calculateQuote({planId:'basic',employeeCount:320});
 assert.equal(q.lineItems.onboarding,160000);
 assert.equal(q.terms.gracePeriod,'none');
 assert.match(q.terms.licence,/verified payment date/);
 assert.match(q.terms.upfrontPayment,/100%/);
});
test('ESS may be excluded and onboarding waived', () => {
 const q=calculateQuote({planId:'standard',employeeCount:320,includeEss:false,waiveOnboarding:true});
 assert.equal(q.lineItems.ess,0);
 assert.equal(q.lineItems.onboarding,0);
 assert.equal(q.entitlements.ess.length,0);
});
test('plan feature boundaries', () => {
 assert.equal(getEntitlements('basic').ess.includes('gratuity'),false);
 assert.equal(getEntitlements('standard').ess.includes('leave_attendance'),true);
 assert.equal(getEntitlements('premium').ess.includes('gratuity'),true);
});
test('rejects invalid counts', () => {
 assert.throws(()=>calculateQuote({planId:'basic',employeeCount:-1}),RangeError);
});

test('published catalogue covers three plans and excludes first-year onboarding from ordinary renewals', () => {
 for (const planId of ['basic','standard','premium']) {
   const initial = calculateQuote({planId, employeeCount:320});
   const annual = calculateRenewalQuote({planId, employeeCount:320});
   assert.equal(annual.lineItems.onboarding,0);
   assert.equal(annual.complimentarySeats,0);
   assert.equal(initial.lineItems.onboarding,160000);
   assert.ok(annual.total < initial.total);
 }
});
test('Zermatt Premium renewal may use Standard pricing with no complimentary seats', () => {
 const q=calculateRenewalQuote({planId:'premium',pricingBasisPlanId:'standard',employeeCount:320,includeEss:true,complimentarySeats:0});
 assert.equal(q.planId,'premium');
 assert.equal(q.pricingBasisPlanId,'standard');
 assert.equal(q.billableSeats,320);
 assert.equal(q.complimentarySeats,0);
 assert.equal(q.lineItems.licence,5760000);
 assert.equal(q.lineItems.ess,3072000);
 assert.equal(q.lineItems.support,256000);
 assert.equal(q.subtotal,9088000);
 assert.equal(q.vat,681600);
 assert.equal(q.total,9769600);
});

test('legacy complimentary-seat calculation remains supported as a generic pricing primitive', () => {
 const q=calculateRenewalQuote({planId:'premium',employeeCount:320,includeEss:true,complimentarySeats:30});
 assert.equal(q.billableSeats,290);
 assert.equal(q.lineItems.licence,5916000);
 assert.equal(q.lineItems.ess,3132000);
 assert.equal(q.lineItems.support,261000);
 assert.equal(q.subtotal,9309000);
 assert.equal(q.vat,698175);
 assert.equal(q.total,10007175);
});
test('complimentary seats never silently exceed eligible employees', () => {
 assert.throws(()=>calculateRenewalQuote({planId:'premium',employeeCount:320,complimentarySeats:321}),RangeError);
 assert.throws(()=>calculateRenewalQuote({planId:'premium',employeeCount:320,complimentarySeats:-1}),RangeError);
 assert.throws(()=>calculateRenewalQuote({planId:'basic',employeeCount:0}),RangeError);
});


test('CHRiS module catalogue matches the Basic, Standard and Premium service schedule', () => {
 const basic = getEntitlements('basic').hris;
 const standard = getEntitlements('standard').hris;
 const premium = getEntitlements('premium').hris;
 assert.equal(basic.includes('dashboard'), true);
 assert.equal(basic.includes('recruitment'), false);
 assert.equal(standard.includes('recruitment'), true);
 assert.equal(standard.includes('performance'), false);
 assert.equal(premium.includes('performance'), true);
 assert.equal(premium.includes('training_development'), true);
 assert.equal(basic.includes('billing_subscription'), true);
 assert.equal(getEntitlements('basic').ess.includes('leave_attendance'), false);
 assert.equal(getEntitlements('standard').ess.includes('leave_attendance'), true);
 assert.equal(getEntitlements('premium').ess.includes('performance_evaluation'), true);
});
