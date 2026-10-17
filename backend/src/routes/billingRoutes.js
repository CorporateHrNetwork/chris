"use strict";
const express = require("express");
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
module.exports = router;
