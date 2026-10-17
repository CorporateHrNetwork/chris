'use strict';

// CHRiS commercial catalogue. Draft, review-required; not enabled in production.
// Money amounts are integer NGN. Licence/ESS per employee monthly,
// onboarding one-time per employee, support annually per employee.
const PLANS = Object.freeze({
  basic: Object.freeze({ label: 'Basic', licenceMonthly: 1200, essMonthly: 700, onboardingOnce: 500, supportAnnual: 700, tier: 1 }),
  standard: Object.freeze({ label: 'Standard', licenceMonthly: 1500, essMonthly: 800, onboardingOnce: 500, supportAnnual: 800, tier: 2 }),
  premium: Object.freeze({ label: 'Premium', licenceMonthly: 1700, essMonthly: 900, onboardingOnce: 500, supportAnnual: 900, tier: 3 }),
});
const HRIS = Object.freeze({
  dashboard: 1, support_requests: 1, employees: 1, recruitment: 2,
  time_attendance: 2, leave: 1, payroll: 1, compensation_rewards: 2,
  benefits: 2, statutories: 1, performance: 3, training_development: 3,
  assets: 2, documents: 1, reports_analytics: 3, organization: 1,
  workflows_approvals: 2, employment_types: 1, settings: 1, billing_subscription: 1
});
const ESS = Object.freeze({
  overview: 1, my_profile: 1, onboarding: 1, statutory: 1,
  payment_payroll: 1, payslips: 1, leave_attendance: 2,
  performance_evaluation: 3, gratuity: 3, birthdays_anniversaries: 2,
  internal_communications: 2, documents: 1
});
function getEntitlements(planId, includeEss = true) {
  const plan = PLANS[planId];
  if (!plan) throw new RangeError('Unknown plan');
  const allowed = catalog => Object.keys(catalog).filter(key => catalog[key] <= plan.tier);
  return { hris: allowed(HRIS), ess: includeEss ? allowed(ESS) : [] };
}
function calculateQuote({ planId, employeeCount, includeEss = true, waiveOnboarding = false, vatBasisPoints = 750 }) {
  const p = PLANS[planId];
  if (!p) throw new RangeError('Unknown plan');
  if (!Number.isSafeInteger(employeeCount) || employeeCount < 1) throw new RangeError('Employee count must be a positive integer');
  if (!Number.isSafeInteger(vatBasisPoints) || vatBasisPoints < 0 || vatBasisPoints > 10000) throw new RangeError('Invalid VAT rate');
  const licence = p.licenceMonthly * employeeCount * 12;
  const ess = includeEss ? p.essMonthly * employeeCount * 12 : 0;
  const onboarding = waiveOnboarding ? 0 : p.onboardingOnce * employeeCount;
  const support = p.supportAnnual * employeeCount;
  const subtotal = licence + ess + onboarding + support;
  const vat = Math.round(subtotal * vatBasisPoints / 10000);
  if (![licence, ess, onboarding, support, subtotal, vat].every(Number.isSafeInteger)) throw new RangeError('Amount exceeds safe range');
  const renewalSubtotal = licence + ess + support;
  return {
    currency: 'NGN', planId, employeeCount, includeEss, waiveOnboarding,
    terms: { licence: '12 months from verified payment date', ess: '12 months from verified payment date', onboarding: 'once per employee', support: '12 months', implementation: 'within one calendar month from verified payment (subject to client readiness)', gracePeriod: 'none', upfrontPayment: '100% required before implementation' },
    lineItems: { licence, ess, onboarding, support },
    subtotal, vatBasisPoints, vat, total: subtotal + vat,
    renewalEstimate: renewalSubtotal + Math.round(renewalSubtotal * vatBasisPoints / 10000),
    entitlements: getEntitlements(planId, includeEss)
  };
}
// Renewal quotation is distinct from first-year onboarding. Complimentary seats are
// a separately approved tenant-specific concession, never a catalogue default.
function calculateRenewalQuote({ planId, employeeCount, includeEss = true, complimentarySeats = 0, vatBasisPoints = 750 }) {
  const p = PLANS[planId];
  if (!p) throw new RangeError('Unknown plan');
  if (!Number.isSafeInteger(employeeCount) || employeeCount < 1) throw new RangeError('Employee count must be a positive integer');
  if (!Number.isSafeInteger(complimentarySeats) || complimentarySeats < 0 || complimentarySeats > employeeCount) {
    throw new RangeError('Invalid complimentary seat count');
  }
  if (!Number.isSafeInteger(vatBasisPoints) || vatBasisPoints < 0 || vatBasisPoints > 10000) {
    throw new RangeError('Invalid VAT rate');
  }
  const billableSeats = employeeCount - complimentarySeats;
  const licence = p.licenceMonthly * billableSeats * 12;
  const ess = includeEss ? p.essMonthly * billableSeats * 12 : 0;
  const support = p.supportAnnual * billableSeats;
  const subtotal = licence + ess + support;
  const vat = Math.round(subtotal * vatBasisPoints / 10000);
  if (![licence, ess, support, subtotal, vat, subtotal + vat].every(Number.isSafeInteger)) throw new RangeError('Amount exceeds safe range');
  return {
    currency: 'NGN', planId, employeeCount, includeEss, complimentarySeats,
    billableSeats, onboarding: 0,
    lineItems: { licence, ess, onboarding: 0, support },
    subtotal, vatBasisPoints, vat, total: subtotal + vat,
    quoteType: 'RENEWAL_ESTIMATE_ONLY'
  };
}
module.exports = { PLANS, HRIS, ESS, getEntitlements, calculateQuote, calculateRenewalQuote };
