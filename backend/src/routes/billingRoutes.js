"use strict";
const express = require("express");
const prisma = require("../config/prisma");
const { requireAuth } = require("../middleware/authMiddleware");
const { PLANS, ZERMATT_OFFER, annualCatalogueQuote } = require("../services/billingCatalog");
const router = express.Router();
router.use(requireAuth);
router.get("/catalogue", (req, res) => {
  const permissions = new Set(req.auth?.permissions || []);
  if (!permissions.has("settings.view")) {
    return res.status(403).json({ status: "error", message: "Billing access denied." });
  }
  const slug = req.auth?.organization?.slug;
  const isPlatform = slug === "corporatehr-network";
  const isZermatt = slug === "zermatt-liquor-limited";
  return res.json({
    status: "success",
    data: {
      plans: PLANS,
      currency: "NGN",
      pricingBasis: "ANNUAL_PER_EMPLOYEE",
      catalogueStatus: "REFERENCE_ONLY",
      negotiatedOffer: isPlatform || isZermatt ? ZERMATT_OFFER : null,
      examples: isPlatform || isZermatt ? { premium320: annualCatalogueQuote("PREMIUM", 320, { onboarding: false }) } : null,
      subscriptionStatus: "NOT_CONNECTED",
      invoiceStatus: "NOT_CONNECTED",
      paymentStatus: "NOT_CONNECTED",
    },
  });
});
// Read-only: never creates subscriptions, invoices or payments.
router.get("/records", async (req, res) => {
  if (!new Set(req.auth?.permissions || []).has("settings.view")) {
    return res.status(403).json({ status: "error", message: "Billing access denied." });
  }
  const organizationId = req.auth?.organizationId;
  if (!organizationId) return res.status(403).json({ status: "error", message: "Organization required." });
  try {
    const [subscriptions, invoices, payments] = await Promise.all([
      prisma.billingSubscription.findMany({
        where: { organizationId },
        select: { id: true, planCode: true, status: true, contractedSeats: true, complimentarySeats: true, annualAmountMinor: true, currency: true, startsAt: true, endsAt: true, graceDays: true, contractReference: true },
        orderBy: { createdAt: "desc" }, take: 50,
      }),
      prisma.billingInvoice.findMany({
        where: { organizationId },
        select: { id: true, subscriptionId: true, invoiceNumber: true, status: true, currency: true, subtotalMinor: true, vatMinor: true, totalMinor: true, dueAt: true, issuedAt: true, createdAt: true },
        orderBy: { createdAt: "desc" }, take: 100,
      }),
      prisma.billingPayment.findMany({
        where: { organizationId },
        select: { id: true, invoiceId: true, amountMinor: true, currency: true, status: true, receivedAt: true, createdAt: true },
        orderBy: { createdAt: "desc" }, take: 100,
      }),
    ]);
    const normalize = (records) => records.map((record) =>
      Object.fromEntries(Object.entries(record).map(([key, value]) =>
        [key, typeof value === "bigint" ? value.toString() : value])));
    return res.json({ status: "success", data: {
      subscriptions: normalize(subscriptions), invoices: normalize(invoices), payments: normalize(payments),
      readOnly: true,
    } });
  } catch (error) {
    console.error("Billing records read failed", { code: error.code, organizationId });
    return res.status(503).json({ status: "error", message: "Billing records unavailable. Migration may not be installed." });
  }
});
module.exports = router;
