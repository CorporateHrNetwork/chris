const express = require("express");
const { requireAuth, requirePermission } = require("../middleware/authMiddleware");
const talent = require("../services/recruitmentTalentService");

const router = express.Router();
router.use(requireAuth);

function sendError(res, error, fallback) {
  if (error?.code) {
    return res.status(error.statusCode || 400).json({
      status: "error",
      code: error.code,
      message: error.message || fallback,
      details: error.details,
    });
  }
  console.error(fallback, error);
  return res.status(500).json({ status: "error", message: error?.message || fallback });
}

function scopeDescriptor(req) {
  const location = (req.auth.availableLocations || []).find((row) => row.id === req.auth.activeLocationId);
  if (!req.auth.activeLocationId) {
    return { mode: "HEAD_OFFICE_CONSOLIDATED", locationId: null, locationName: "HEAD OFFICE", locationCode: "HO" };
  }
  return {
    mode: "BRANCH",
    locationId: req.auth.activeLocationId,
    locationName: location?.name || "BRANCH",
    locationCode: location?.code || null,
  };
}

function headOfficeOnly(req, res, operation) {
  if (!req.auth.activeLocationId) return false;
  res.status(409).json({
    status: "error",
    code: "HEAD_OFFICE_REQUIRED_FOR_RECRUITMENT_CONTROL",
    message: `${operation} is a Head Office recruitment control. Switch to HEAD OFFICE before performing this action.`,
  });
  return true;
}

router.get("/talent/summary", requirePermission("recruitment.view"), async (req, res) => {
  try {
    const data = await talent.getTalentSummary({
      organizationId: req.auth.organizationId,
      scopeLocationId: req.auth.activeLocationId || null,
    });
    return res.json({ status: "success", data: { ...data, scope: scopeDescriptor(req) } });
  } catch (error) {
    return sendError(res, error, "Unable to load recruitment talent summary.");
  }
});

router.get("/candidates/options", requirePermission("recruitment.view"), async (req, res) => {
  try {
    const [vacancies, candidates] = await Promise.all([
      talent.listPublishedVacancies({ organizationId: req.auth.organizationId, scopeLocationId: req.auth.activeLocationId || null }),
      talent.listCandidates({ organizationId: req.auth.organizationId, scopeLocationId: req.auth.activeLocationId || null }),
    ]);
    return res.json({ status: "success", data: { scope: scopeDescriptor(req), vacancies, candidates } });
  } catch (error) {
    return sendError(res, error, "Unable to load candidate options.");
  }
});

router.get("/candidates", requirePermission("recruitment.view"), async (req, res) => {
  try {
    const data = await talent.listCandidates({
      organizationId: req.auth.organizationId,
      scopeLocationId: req.auth.activeLocationId || null,
      search: req.query.search || null,
    });
    return res.json({ status: "success", data, scope: scopeDescriptor(req) });
  } catch (error) {
    return sendError(res, error, "Unable to load candidates.");
  }
});

router.post("/candidates/applications", requirePermission("recruitment.manage"), async (req, res) => {
  try {
    const data = await talent.createCandidateApplication({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      scopeLocationId: req.auth.activeLocationId || null,
      input: req.body || {},
    });
    return res.status(201).json({
      status: "success",
      message: `${data.candidate.candidateNumber} / ${data.application.applicationNumber} created.`,
      data,
    });
  } catch (error) {
    return sendError(res, error, "Unable to create candidate application.");
  }
});

router.patch("/candidates/:id", requirePermission("recruitment.manage"), async (req, res) => {
  try {
    const data = await talent.updateCandidate({
      organizationId: req.auth.organizationId,
      candidateId: req.params.id,
      actorUserId: req.auth.userId,
      scopeLocationId: req.auth.activeLocationId || null,
      input: req.body || {},
    });
    return res.json({ status: "success", message: `${data.candidateNumber} updated.`, data });
  } catch (error) {
    return sendError(res, error, "Unable to update candidate.");
  }
});

router.get("/applications", requirePermission("recruitment.view"), async (req, res) => {
  try {
    const data = await talent.listApplications({
      organizationId: req.auth.organizationId,
      scopeLocationId: req.auth.activeLocationId || null,
      stage: req.query.stage || null,
    });
    return res.json({ status: "success", data, scope: scopeDescriptor(req) });
  } catch (error) {
    return sendError(res, error, "Unable to load applicant pipeline.");
  }
});

router.get("/applications/:id/history", requirePermission("recruitment.view"), async (req, res) => {
  try {
    const data = await talent.listStageHistory({
      organizationId: req.auth.organizationId,
      applicationId: req.params.id,
      scopeLocationId: req.auth.activeLocationId || null,
    });
    return res.json({ status: "success", data });
  } catch (error) {
    return sendError(res, error, "Unable to load application history.");
  }
});

router.post("/applications/:id/stage", requirePermission("recruitment.manage"), async (req, res) => {
  try {
    const data = await talent.transitionApplication({
      organizationId: req.auth.organizationId,
      applicationId: req.params.id,
      actorUserId: req.auth.userId,
      scopeLocationId: req.auth.activeLocationId || null,
      nextStage: req.body?.stage,
      reason: req.body?.reason,
    });
    return res.json({ status: "success", message: `${data.applicationNumber} moved to ${data.stage}.`, data });
  } catch (error) {
    return sendError(res, error, "Unable to move application stage.");
  }
});

router.get("/interviews", requirePermission("recruitment.view"), async (req, res) => {
  try {
    const data = await talent.listInterviews({
      organizationId: req.auth.organizationId,
      scopeLocationId: req.auth.activeLocationId || null,
    });
    return res.json({ status: "success", data, scope: scopeDescriptor(req) });
  } catch (error) {
    return sendError(res, error, "Unable to load interviews.");
  }
});

router.post("/applications/:id/interviews", requirePermission("recruitment.manage"), async (req, res) => {
  try {
    const data = await talent.createInterview({
      organizationId: req.auth.organizationId,
      applicationId: req.params.id,
      actorUserId: req.auth.userId,
      scopeLocationId: req.auth.activeLocationId || null,
      input: req.body || {},
    });
    return res.status(201).json({ status: "success", message: `Interview round ${data.roundNumber} scheduled.`, data });
  } catch (error) {
    return sendError(res, error, "Unable to schedule interview.");
  }
});

router.post("/interviews/:id/complete", requirePermission("recruitment.manage"), async (req, res) => {
  try {
    const data = await talent.completeInterview({
      organizationId: req.auth.organizationId,
      interviewId: req.params.id,
      actorUserId: req.auth.userId,
      scopeLocationId: req.auth.activeLocationId || null,
      input: req.body || {},
    });
    return res.json({ status: "success", message: "Interview completed.", data });
  } catch (error) {
    return sendError(res, error, "Unable to complete interview.");
  }
});

router.post("/interviews/:id/cancel", requirePermission("recruitment.manage"), async (req, res) => {
  try {
    const data = await talent.cancelInterview({
      organizationId: req.auth.organizationId,
      interviewId: req.params.id,
      actorUserId: req.auth.userId,
      scopeLocationId: req.auth.activeLocationId || null,
      reason: req.body?.reason,
    });
    return res.json({ status: "success", message: "Interview cancelled.", data });
  } catch (error) {
    return sendError(res, error, "Unable to cancel interview.");
  }
});

router.get("/offers", requirePermission("recruitment.view"), async (req, res) => {
  try {
    const data = await talent.listOffers({
      organizationId: req.auth.organizationId,
      scopeLocationId: req.auth.activeLocationId || null,
      includeCompensation: !req.auth.activeLocationId,
    });
    return res.json({ status: "success", data, scope: scopeDescriptor(req) });
  } catch (error) {
    return sendError(res, error, "Unable to load offers.");
  }
});

router.post("/applications/:id/offers", requirePermission("recruitment.manage"), async (req, res) => {
  if (headOfficeOnly(req, res, "Offer preparation")) return;
  try {
    const data = await talent.createOffer({
      organizationId: req.auth.organizationId,
      applicationId: req.params.id,
      actorUserId: req.auth.userId,
      input: req.body || {},
    });
    return res.status(201).json({ status: "success", message: `${data.offerNumber} created as Draft.`, data });
  } catch (error) {
    return sendError(res, error, "Unable to prepare offer.");
  }
});

router.post("/offers/:id/:action", requirePermission("recruitment.manage"), async (req, res) => {
  if (headOfficeOnly(req, res, "Offer authorization")) return;
  const action = String(req.params.action || "").toLowerCase();
  if (!["submit", "approve", "issue", "accept", "decline", "withdraw"].includes(action)) {
    return res.status(404).json({ status: "error", message: "Unsupported offer action." });
  }
  try {
    const data = await talent.transitionOffer({
      organizationId: req.auth.organizationId,
      offerId: req.params.id,
      actorUserId: req.auth.userId,
      action,
      reason: req.body?.reason,
    });
    return res.json({ status: "success", message: `${data.offerNumber} is now ${data.status}.`, data });
  } catch (error) {
    return sendError(res, error, "Unable to update offer.");
  }
});

router.get("/talent-pool", requirePermission("recruitment.view"), async (req, res) => {
  try {
    const data = await talent.listTalentPool({
      organizationId: req.auth.organizationId,
      scopeLocationId: req.auth.activeLocationId || null,
    });
    return res.json({ status: "success", data, scope: scopeDescriptor(req) });
  } catch (error) {
    return sendError(res, error, "Unable to load Talent Pool.");
  }
});

router.post("/candidates/:id/talent-pool", requirePermission("recruitment.manage"), async (req, res) => {
  try {
    const data = await talent.setTalentPoolStatus({
      organizationId: req.auth.organizationId,
      candidateId: req.params.id,
      actorUserId: req.auth.userId,
      scopeLocationId: req.auth.activeLocationId || null,
      status: req.body?.status,
      notes: req.body?.notes,
    });
    return res.json({ status: "success", message: `${data.candidateNumber} Talent Pool status updated.`, data });
  } catch (error) {
    return sendError(res, error, "Unable to update Talent Pool status.");
  }
});

module.exports = router;
