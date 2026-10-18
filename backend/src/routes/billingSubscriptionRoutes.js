'use strict';

// Tenant-authorized pricing preview for the CHRiS Billing & Subscription module.
// Read-only: no invoice, payment, subscription, entitlement or payroll changes.
const express = require('express');
const { requireAuth, requirePermission } = require('../middleware/authMiddleware');
const { PLANS, MODULE_CATALOGUE, calculateQuote, calculateRenewalQuote } = require('../services/subscriptionPricing');

const router = express.Router();
const ZERMATT = 'zermatt-liquor-limited';
const VERSION = 'CHRIS-PRICING-V4-2026-10';
const standardTerms = Object.freeze({
  licenceStart: 'VERIFIED_PAYMENT_DATE',
  licenceMonths: 12,
  onboardingOncePerEmployee: true,
  implementationMonthsFromPayment: 1,
  initialPaymentPercent: 100,
  graceDays: 0,
  vatBasisPointsIllustrative: 750,
  billingBasis: 'CHRiS licence and optional ESS are charged for 12 months in advance; onboarding is NGN 500 once per employee; technical support is annual.',
  vatTreatment: '7.5% is illustrative and subject to final invoice tax treatment.',
  renewalOnboarding: 'NGN 0 for subsequent annual renewals of an existing deployment.',
});
const pendingZermattOffer = Object.freeze({
  planId: 'premium',
  status: 'COUNTEROFFER_PENDING_SIGNED_ACCEPTANCE',
  firstYearAmountVatInclusive: 10000000,
  firstYearEmployeeCount: 320,
  firstYearIncludesEss: true,
  firstYearLineItems: Object.freeze({ licence: 5800000, ess: 3080000, support: 262325.58, onboarding: 160000 }),
  firstYearSubtotalBeforeVat: 9302325.58,
  firstYearVat: 697674.42,
  renewalPricingBasisPlanId: 'standard',
  renewalGraceDaysIfAccepted: 14,
  firstYearMidMonthPayrollIfAccepted: true,
  thirdPartyQuickBooksIntegrationIncluded: false,
  note: 'Negotiated terms are illustrative only; not activated and not applied to standard catalogue prices.'
});

router.use(requireAuth, requirePermission('settings.view'));
router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.get('/catalogue', (req, res) => {
  const isZermatt = req.auth.organization?.slug === ZERMATT;
  return res.json({
    data: {
      version: VERSION,
      plans: PLANS,
      modules: MODULE_CATALOGUE,
      terms: standardTerms,
      organizationName: req.auth.organization?.name || 'Current organization',
      accountConnection: 'BILLING_LEDGER_NOT_LINKED',
      negotiatedOffer: isZermatt ? pendingZermattOffer : null,
    },
  });
});
router.post('/quotes', (req, res) => {
  try {
    const { planId, includeEss, employeeCount } = req.body || {};
    if (typeof includeEss !== 'boolean') return res.status(400).json({ error: 'includeEss must be true or false' });
    if (!Number.isSafeInteger(employeeCount) || employeeCount < 1 || employeeCount > 100000) {
      return res.status(400).json({ error: 'employeeCount must be an integer between 1 and 100000' });
    }
    const quote = calculateQuote({ planId, employeeCount, includeEss });
    const renewal = calculateRenewalQuote({ planId, employeeCount, includeEss });
    const mayPreview = req.auth.organization?.slug === ZERMATT && planId === 'premium';
    const mayPreviewNegotiatedFirstYear = mayPreview && employeeCount === 320 && includeEss;
    const negotiatedRenewal = mayPreview
      ? calculateRenewalQuote({ planId, pricingBasisPlanId: 'standard', employeeCount, includeEss, complimentarySeats: 0 })
      : null;
    return res.json({
      data: {
        version: VERSION,
        quote,
        renewal,
        negotiatedRenewal,
        negotiatedFirstYear: mayPreviewNegotiatedFirstYear ? {
          status: pendingZermattOffer.status,
          amountVatInclusive: pendingZermattOffer.firstYearAmountVatInclusive,
          employeeCount: pendingZermattOffer.firstYearEmployeeCount,
          includeEss: pendingZermattOffer.firstYearIncludesEss,
          lineItems: pendingZermattOffer.firstYearLineItems,
          subtotalBeforeVat: pendingZermattOffer.firstYearSubtotalBeforeVat,
          vat: pendingZermattOffer.firstYearVat,
          note: 'Negotiated first-year concession: NGN 10,000,000 VAT-inclusive for 320 employees including ESS. Requires signed acceptance and independent verification of full payment.',
        } : null,
        quoteType: 'NON_BINDING_ESTIMATE',
      },
    });
  } catch (err) {
    if (err instanceof RangeError) return res.status(400).json({ error: err.message });
    console.error('[billing-catalogue] quote preview failed', err.message);
    return res.status(500).json({ error: 'Unable to calculate quote' });
  }
});
module.exports = router;
