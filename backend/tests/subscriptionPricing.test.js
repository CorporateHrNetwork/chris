'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateQuote, getEntitlements } = require('../src/services/subscriptionPricing');
test('Zermatt 320 employee quotations, including 7.5% illustrative VAT', () => {
 const expected = { basic:1298600, standard:1556600, premium:1943600 };
 // Reconcile against itemized totals: annual rates are per employee per year.
 for (const [planId,total] of Object.entries(expected)) {
   const q=calculateQuote({planId,employeeCount:320});
   assert.equal(q.total,total);
 }
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
