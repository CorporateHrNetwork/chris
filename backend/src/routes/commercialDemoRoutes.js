const express = require("express");
const prisma = require("../config/prisma");
const { requireAuth } = require("../middleware/authMiddleware");
const {
  PLATFORM_SLUG,
  createDemoLead,
  getPlatformOrganization,
  getLead,
  listLeads,
  updateLead,
} = require("../services/commercialLeadService");

const router = express.Router();
const intakeWindow = new Map();
const MAX_REQUESTS_PER_WINDOW = 8;
const WINDOW_MS = 10 * 60 * 1000;

function requestKey(req) {
  return String(req.ip || req.headers["x-forwarded-for"] || "unknown").split(",")[0].trim();
}

function publicRateLimit(req, res, next) {
  const key = requestKey(req);
  const now = Date.now();
  const state = intakeWindow.get(key) || { count: 0, resetAt: now + WINDOW_MS };
  if (now >= state.resetAt) {
    state.count = 0;
    state.resetAt = now + WINDOW_MS;
  }
  state.count += 1;
  intakeWindow.set(key, state);
  if (state.count > MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({ status: "error", code: "DEMO_REQUEST_RATE_LIMITED", message: "Too many demo requests. Please try again later." });
  }
  return next();
}

function requirePlatformCommercial(req, res, next) {
  if (req.auth?.organization?.slug !== PLATFORM_SLUG) {
    return res.status(403).json({ status: "error", code: "PLATFORM_COMMERCIAL_FORBIDDEN", message: "Commercial operations are available only in the CHRiS platform environment." });
  }
  const permissions = new Set(req.auth?.permissions || []);
  if (!permissions.has("settings.view") && !permissions.has("reports.view")) {
    return res.status(403).json({ status: "error", code: "COMMERCIAL_PERMISSION_FORBIDDEN", message: "You do not have permission to access commercial operations." });
  }
  return next();
}

router.post("/public/demo-requests", publicRateLimit, async (req, res) => {
  try {
    if (String(req.body?.websiteField || "").trim()) {
      return res.status(202).json({ status: "success", message: "Thank you. Your request has been received." });
    }
    const lead = await createDemoLead(prisma, req.body || {});
    return res.status(201).json({
      status: "success",
      data: {
        leadNumber: lead.leadNumber,
        status: lead.status,
        preferredDemoDate: lead.preferredDemoDate,
      },
      message: "Thank you. Your CHRiS demo request has been received and routed to our Commercial team.",
    });
  } catch (error) {
    const statusCode = error.code === "DEMO_REQUEST_VALIDATION_FAILED" ? 400 : 500;
    return res.status(statusCode).json({ status: "error", code: error.code || "DEMO_REQUEST_FAILED", message: error.message || "Unable to submit demo request." });
  }
});

router.use("/internal", requireAuth, requirePlatformCommercial);

router.get("/internal/summary", async (req, res) => {
  try {
    const organization = await getPlatformOrganization(prisma);
    const leads = await listLeads(prisma, organization.id, 5000);
    const summary = {
      total: leads.length,
      new: leads.filter((lead) => lead.status === "NEW").length,
      qualified: leads.filter((lead) => lead.status === "QUALIFIED").length,
      demosScheduled: leads.filter((lead) => lead.status === "DEMO_SCHEDULED").length,
      proposalStage: leads.filter((lead) => ["PROPOSAL_REQUIRED", "PROPOSAL_SENT", "NEGOTIATION"].includes(lead.status)).length,
      won: leads.filter((lead) => lead.status === "WON").length,
      highPriority: leads.filter((lead) => lead.commercialPriority === "HIGH" && !["WON", "LOST"].includes(lead.status)).length,
    };
    return res.json({ status: "success", data: summary });
  } catch (error) {
    return res.status(500).json({ status: "error", code: error.code || "COMMERCIAL_SUMMARY_FAILED", message: error.message });
  }
});

router.get("/internal/leads", async (req, res) => {
  try {
    const organization = await getPlatformOrganization(prisma);
    let leads = await listLeads(prisma, organization.id, req.query.limit || 1000);
    const status = String(req.query.status || "").trim().toUpperCase();
    if (status) leads = leads.filter((lead) => lead.status === status);
    return res.json({ status: "success", results: leads.length, data: leads });
  } catch (error) {
    return res.status(500).json({ status: "error", code: error.code || "COMMERCIAL_LEADS_FAILED", message: error.message });
  }
});

router.get("/internal/leads/:leadNumber", async (req, res) => {
  try {
    const organization = await getPlatformOrganization(prisma);
    const lead = await getLead(prisma, organization.id, req.params.leadNumber);
    if (!lead) return res.status(404).json({ status: "error", code: "COMMERCIAL_LEAD_NOT_FOUND", message: "Commercial lead not found." });
    return res.json({ status: "success", data: lead });
  } catch (error) {
    return res.status(500).json({ status: "error", code: error.code || "COMMERCIAL_LEAD_FAILED", message: error.message });
  }
});

router.patch("/internal/leads/:leadNumber", async (req, res) => {
  try {
    const organization = await getPlatformOrganization(prisma);
    const lead = await updateLead(prisma, {
      organizationId: organization.id,
      actorUserId: req.auth.userId,
      leadNumber: req.params.leadNumber,
      patch: req.body?.patch || {},
      reason: req.body?.reason,
    });
    return res.json({ status: "success", data: lead, message: "Commercial lead updated." });
  } catch (error) {
    const statusCode = error.code === "COMMERCIAL_LEAD_NOT_FOUND" ? 404 : 400;
    return res.status(statusCode).json({ status: "error", code: error.code || "COMMERCIAL_LEAD_UPDATE_FAILED", message: error.message });
  }
});

module.exports = router;
