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

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}
function invoiceMoney(value) {
  return 'NGN ' + Number(value || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
router.post('/invoice/email', async (req, res) => {
  try {
    const { recipientEmail, pdfBase64, invoice } = req.body || {};
    if (!validEmail(recipientEmail)) return res.status(400).json({ error: 'A valid recipient email is required' });
    if (typeof pdfBase64 !== 'string' || pdfBase64.length < 100 || pdfBase64.length > 12000000) {
      return res.status(400).json({ error: 'Invoice PDF attachment is invalid or too large' });
    }
    if (!invoice || typeof invoice !== 'object') return res.status(400).json({ error: 'Invoice details are required' });
    const apiKey = String(process.env.RESEND_API_KEY || '').trim();
    if (!apiKey) return res.status(503).json({ error: 'Invoice email delivery is not configured' });
    const from = String(process.env.BILLING_EMAIL_FROM || process.env.RESEND_FROM || 'Corporate Resources Network <noreply@crnetwork.com.ng>').trim();
    const invoiceNumber = String(invoice.invoiceNumber || 'CHRIS-INVOICE').slice(0, 80);
    const product = 'CHRiS | CorporateHr Network Information System';
    const subject = product + ' Invoice ' + invoiceNumber;
    const amount = invoiceMoney(invoice.total);
    const html = '<!doctype html><html><body style="font-family:Arial,sans-serif;color:#17211c">' +
      '<h2 style="color:#064e3b">Corporate Resources Network</h2><p><strong>' + product + '</strong></p>' +
      '<p>Invoice <strong>' + invoiceNumber + '</strong> for <strong>' + String(invoice.planLabel || 'Selected Plan') + '</strong>.</p>' +
      '<p>Total payable: <strong>' + amount + '</strong></p><p>The official invoice PDF is attached.</p><hr>' +
      '<p style="font-size:12px;color:#64748b">Corporate Resources Network · Zenith Bank · 1312432840<br>Office 10 & 12, Palatable Plaza, Agbara Estate, Lagos · 08068120880 · chris@crnetwork.com.ng</p>' +
      '</body></html>';
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [String(recipientEmail).trim()],
        subject,
        html,
        text: 'Corporate Resources Network\n' + product + '\nInvoice: ' + invoiceNumber + '\nPlan: ' + (invoice.planLabel || 'Selected Plan') + '\nTotal: ' + amount + '\n\nThe official invoice PDF is attached.',
        attachments: [{ filename: invoiceNumber + '.pdf', content: pdfBase64, content_type: 'application/pdf' }],
      }),
    });
    let body = null; try { body = await response.json(); } catch { body = null; }
    if (!response.ok) return res.status(502).json({ error: body?.message || ('Invoice email delivery failed (' + response.status + ')') });
    return res.json({ data: { status: 'SENT', channel: 'RESEND_API', providerMessageId: body?.id || null } });
  } catch (err) {
    console.error('[billing-invoice-email] delivery failed', err.message);
    return res.status(500).json({ error: 'Unable to send invoice email' });
  }
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
