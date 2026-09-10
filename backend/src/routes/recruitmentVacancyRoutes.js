const express = require("express");
const {
  requireAuth,
  requirePermission,
} = require("../middleware/authMiddleware");
const vacancies = require("../services/recruitmentVacancyService");

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
  const location = (req.auth.availableLocations || []).find(
    (row) => row.id === req.auth.activeLocationId
  );
  if (!req.auth.activeLocationId) {
    return {
      mode: "HEAD_OFFICE_CONSOLIDATED",
      locationId: null,
      locationName: "HEAD OFFICE",
      locationCode: "HO",
    };
  }
  return {
    mode: "BRANCH",
    locationId: req.auth.activeLocationId,
    locationName: location?.name || "BRANCH",
    locationCode: location?.code || null,
  };
}

function headOfficeRequired(res, operation) {
  return res.status(409).json({
    status: "error",
    code: "HEAD_OFFICE_REQUIRED_FOR_VACANCY_PUBLICATION",
    message: `${operation} is a Head Office recruitment control. Switch to HEAD OFFICE before performing this action.`,
  });
}

router.get(
  "/vacancies/summary",
  requirePermission("recruitment.view"),
  async (req, res) => {
    try {
      const data = await vacancies.getSummary({
        organizationId: req.auth.organizationId,
        scopeLocationId: req.auth.activeLocationId || null,
      });
      return res.json({ status: "success", data: { ...data, scope: scopeDescriptor(req) } });
    } catch (error) {
      return sendError(res, error, "Unable to load vacancy summary.");
    }
  }
);

router.get(
  "/vacancies/options",
  requirePermission("recruitment.view"),
  async (req, res) => {
    try {
      const requisitions = await vacancies.listEligibleRequisitions({
        organizationId: req.auth.organizationId,
        scopeLocationId: req.auth.activeLocationId || null,
      });
      return res.json({
        status: "success",
        data: {
          scope: scopeDescriptor(req),
          requisitions,
        },
      });
    } catch (error) {
      return sendError(res, error, "Unable to load approved requisitions for vacancies.");
    }
  }
);

router.get(
  "/vacancies",
  requirePermission("recruitment.view"),
  async (req, res) => {
    try {
      const data = await vacancies.listVacancies({
        organizationId: req.auth.organizationId,
        scopeLocationId: req.auth.activeLocationId || null,
        status: req.query.status || null,
      });
      return res.json({ status: "success", data, scope: scopeDescriptor(req) });
    } catch (error) {
      return sendError(res, error, "Unable to load vacancies.");
    }
  }
);

router.get(
  "/vacancies/:id",
  requirePermission("recruitment.view"),
  async (req, res) => {
    try {
      const data = await vacancies.getVacancy({
        organizationId: req.auth.organizationId,
        vacancyId: req.params.id,
        scopeLocationId: req.auth.activeLocationId || null,
      });
      if (!data) {
        return res.status(404).json({
          status: "error",
          code: "VACANCY_NOT_FOUND",
          message: "Vacancy not found in the permitted operating context.",
        });
      }
      return res.json({ status: "success", data });
    } catch (error) {
      return sendError(res, error, "Unable to load vacancy.");
    }
  }
);

router.post(
  "/vacancies",
  requirePermission("recruitment.manage"),
  async (req, res) => {
    try {
      const data = await vacancies.createVacancy({
        organizationId: req.auth.organizationId,
        actorUserId: req.auth.userId,
        scopeLocationId: req.auth.activeLocationId || null,
        input: req.body || {},
      });
      return res.status(201).json({
        status: "success",
        message: `${data.vacancyNumber} created as Draft.`,
        data,
      });
    } catch (error) {
      return sendError(res, error, "Unable to create vacancy.");
    }
  }
);

router.patch(
  "/vacancies/:id",
  requirePermission("recruitment.manage"),
  async (req, res) => {
    try {
      const data = await vacancies.updateVacancy({
        organizationId: req.auth.organizationId,
        vacancyId: req.params.id,
        actorUserId: req.auth.userId,
        scopeLocationId: req.auth.activeLocationId || null,
        input: req.body || {},
      });
      return res.json({ status: "success", message: `${data.vacancyNumber} updated.`, data });
    } catch (error) {
      return sendError(res, error, "Unable to update vacancy.");
    }
  }
);

router.post(
  "/vacancies/:id/publish",
  requirePermission("recruitment.manage"),
  async (req, res) => {
    if (req.auth.activeLocationId) return headOfficeRequired(res, "Vacancy publication");
    try {
      const data = await vacancies.publishVacancy({
        organizationId: req.auth.organizationId,
        vacancyId: req.params.id,
        actorUserId: req.auth.userId,
      });
      return res.json({ status: "success", message: `${data.vacancyNumber} published.`, data });
    } catch (error) {
      return sendError(res, error, "Unable to publish vacancy.");
    }
  }
);

router.post(
  "/vacancies/:id/close",
  requirePermission("recruitment.manage"),
  async (req, res) => {
    if (req.auth.activeLocationId) return headOfficeRequired(res, "Vacancy closure");
    try {
      const data = await vacancies.closeVacancy({
        organizationId: req.auth.organizationId,
        vacancyId: req.params.id,
        actorUserId: req.auth.userId,
        reason: req.body?.reason,
      });
      return res.json({ status: "success", message: `${data.vacancyNumber} closed.`, data });
    } catch (error) {
      return sendError(res, error, "Unable to close vacancy.");
    }
  }
);

router.post(
  "/vacancies/:id/cancel",
  requirePermission("recruitment.manage"),
  async (req, res) => {
    try {
      const data = await vacancies.cancelDraftVacancy({
        organizationId: req.auth.organizationId,
        vacancyId: req.params.id,
        actorUserId: req.auth.userId,
        scopeLocationId: req.auth.activeLocationId || null,
        reason: req.body?.reason,
      });
      return res.json({ status: "success", message: `${data.vacancyNumber} cancelled.`, data });
    } catch (error) {
      return sendError(res, error, "Unable to cancel vacancy.");
    }
  }
);

module.exports = router;
