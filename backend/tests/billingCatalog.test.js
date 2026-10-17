"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { PLANS, ZERMATT_OFFER, annualCatalogueQuote, zermattRenewalIllustration } = require("../src/services/billingCatalog");
test("catalogue rates match agreed per-seat annual components", () => {
  assert.deepEqual(PLANS.PREMIUM, { license: 1700, ess: 900, support: 900, onboarding: 500 });
  assert.equal(annualCatalogueQuote("PREMIUM", 320).totalExcludingVat, 1280000);
  assert.equal(annualCatalogueQuote("PREMIUM", 320, { onboarding: false }).totalExcludingVat, 1120000);
});
test("Zermatt proposal remains separate from public catalogue", () => {
  assert.equal(ZERMATT_OFFER.firstYearOfferExcludingVat, 10000000);
  assert.equal(ZERMATT_OFFER.status, "PROPOSED_NOT_ACTIVATED");
  assert.equal(ZERMATT_OFFER.quickBooksIntegration, "SEPARATELY_QUOTED");
});
test("renewal seat benefit and grace period", () => {
  assert.deepEqual(zermattRenewalIllustration(320, 3500), { paidSeats:320, complimentarySeats:30, entitledSeats:350, annualRenewalExcludingVat:1120000, graceDays:14, vat:"CALCULATE_AT_APPLICABLE_RATE", note:"Illustration only; renewal unit rate requires signed agreement." });
});
test("reject invalid seat counts and plan", () => {
  assert.throws(() => annualCatalogueQuote("OTHER", 1), RangeError);
  assert.throws(() => annualCatalogueQuote("BASIC", -1), RangeError);
  assert.throws(() => annualCatalogueQuote("BASIC", 1.2), RangeError);
});
