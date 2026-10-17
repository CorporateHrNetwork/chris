"use strict";

// Commercial configuration only: no database writes, payment capture or activation.
const PLANS = Object.freeze({
  BASIC: Object.freeze({ license: 1200, ess: 700, support: 700, onboarding: 500 }),
  STANDARD: Object.freeze({ license: 1500, ess: 800, support: 800, onboarding: 500 }),
  PREMIUM: Object.freeze({ license: 1700, ess: 900, support: 900, onboarding: 500 }),
});
const ZERMATT_OFFER = Object.freeze({
  organization: "Zermatt Liquor Limited",
  plan: "PREMIUM",
  firstYearOfferExcludingVat: 10000000,
  onboardingWaived: true,
  complimentaryRenewalSeats: 30,
  renewalGraceDays: 14,
  firstYearMidMonthPayrollIncluded: true,
  quickBooksIntegration: "SEPARATELY_QUOTED",
  status: "PROPOSED_NOT_ACTIVATED",
});
function nonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(label + " must be a non-negative integer");
  return value;
}
function annualCatalogueQuote(plan, seats, { onboarding = true } = {}) {
  const p = PLANS[plan];
  if (!p) throw new RangeError("Unknown plan");
  nonNegativeInteger(seats, "seats");
  const recurring = seats * (p.license + p.ess + p.support);
  const oneTime = onboarding ? seats * p.onboarding : 0;
  return { plan, seats, recurringExcludingVat: recurring, onboardingExcludingVat: oneTime, totalExcludingVat: recurring + oneTime, vat: "CALCULATE_AT_APPLICABLE_RATE" };
}
function zermattRenewalIllustration(contractedSeats, ratePerSeat, options = {}) {
  nonNegativeInteger(contractedSeats, "contractedSeats");
  nonNegativeInteger(ratePerSeat, "ratePerSeat");
  const complimentarySeats = ZERMATT_OFFER.complimentaryRenewalSeats;
  // Complimentary seats increase entitlement, not the contracted paid-seat count.
  return { paidSeats: contractedSeats, complimentarySeats, entitledSeats: contractedSeats + complimentarySeats, annualRenewalExcludingVat: contractedSeats * ratePerSeat, graceDays: ZERMATT_OFFER.renewalGraceDays, vat: "CALCULATE_AT_APPLICABLE_RATE", note: "Illustration only; renewal unit rate requires signed agreement." };
}
module.exports = { PLANS, ZERMATT_OFFER, annualCatalogueQuote, zermattRenewalIllustration };
