'use strict';

// Tenant-authorized pricing preview for the CHRiS Billing & Subscription module.
// Read-only: no invoice, payment, subscription, entitlement or payroll changes.
const express = require('express');
const { requireAuth, requirePermission } = require('../middleware/authMiddleware');
const { PLANS, calculateQuote, calculateRenewalQuote } = require('../services/subscriptionPricing');

const router = express.Router();
const ZERMATT = 'zermatt-liquor-limited';
const VERSION = 'CHRIS-PRICING-V2-2026-10';
const standardTerms = Object.freeze({
  licenceStart: 'VERIFIED_PAYMENT_DATE',
  licenceMonths: 12,
  onboardingOncePerEmployee: true,
  implementationMonthsFromPayment: 1,
  initialPaymentPercent: 100,
  graceDays: 0,
  vatBasisPointsIllustrative: 750,
});
const pendingZermattOffer = Object.freeze({
  planId: 'premium',
  status: 'COUNTEROFFER_PENDING_SIGNED_ACCEPTANCE',
  firstYearAmountExcludingVat: 10000000,
  onboardingWaivedIfAccepted: true,
  complimentaryRenewalSeatsIfAccepted: 30,
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
    const negotiatedRenewal = mayPreview
      ? calculateRenewalQuote({ planId, employeeCount, includeEss, complimentarySeats: Math.min(30, employeeCount) })
      : null;
    return res.json({
      data: {
        version: VERSION,
        quote,
        renewal,
        negotiatedRenewal,
        negotiatedFirstYear: mayPreview ? {
          status: pendingZermattOffer.status,
          amountExcludingVat: pendingZermattOffer.firstYearAmountExcludingVat,
          indicativeVat: 750000,
          indicativeTotal: 10750000,
          onboardingWaivedIfAccepted: true,
          note: 'Proposal only. Requires signed acceptance and independent verification of full payment.',
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
