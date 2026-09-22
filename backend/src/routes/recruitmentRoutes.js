const express = require("express");
const prisma = require("../config/prisma");
const {
  requireAuth,
  requirePermission,
} = require("../middleware/authMiddleware");
const recruitment = require("../services/recruitmentService");

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
    code: "HEAD_OFFICE_REQUIRED_FOR_RECRUITMENT_APPROVAL",
    message: `${operation} is a Head Office recruitment control. Switch to HEAD OFFICE before performing this action.`,
  });
}

router.get(
  "/options",
  requirePermission("recruitment.view"),
  async (req, res) => {
    try {
      const locationWhere = req.auth.activeLocationId
        ? { id: req.auth.activeLocationId }
        : { type: { in: ["BRANCH", "OFFICE", "SITE"] } };
      const [locations, designations] = await Promise.all([
        prisma.organizationLocation.findMany({
          where: {
            organizationId: req.auth.organizationId,
            isActive: true,
            ...locationWhere,
          },
          select: { id: true, code: true, name: true, type: true },
          orderBy: [{ name: "asc" }],
        }),
        prisma.designation.findMany({
          where: { organizationId: req.auth.organizationId, isActive: true },
          select: {
            id: true,
            code: true,
            name: true,
            departmentId: true,
            department: { select: { id: true, code: true, name: true, isActive: true } },
          },
          orderBy: [{ name: "asc" }],
        }),
      ]);
      return res.json({
        status: "success",
        data: {
          scope: scopeDescriptor(req),
          locations,
          designations: designations.filter((row) => !row.department || row.department.isActive !== false),
          employmentTypes: ["Full-Time", "Part-Time", "Expatriate", "Contract", "Temporary", "Intern / Trainee"],
        },
      });
    } catch (error) {
      return sendError(res, error, "Unable to load recruitment requisition options.");
    }
  }
);

router.get(
  "/summary",
  requirePermission("recruitment.view"),
  async (req, res) => {
    try {
      const data = await recruitment.getSummary({
        organizationId: req.auth.organizationId,
        scopeLocationId: req.auth.activeLocationId || null,
      });
      return res.json({ status: "success", data: { ...data, scope: scopeDescriptor(req) } });
    } catch (error) {
      return sendError(res, error, "Unable to load recruitment summary.");
    }
  }
);

router.get(
  "/requisitions",
  requirePermission("recruitment.view"),
  async (req, res) => {
    try {
      const data = await recruitment.listRequisitions({
        organizationId: req.auth.organizationId,
        scopeLocationId: req.auth.activeLocationId || null,
        status: req.query.status || null,
      });
      return res.json({ status: "success", data, scope: scopeDescriptor(req) });
    } catch (error) {
      return sendError(res, error, "Unable to load job requisitions.");
    }
  }
);

router.get(
  "/requisitions/:id",
  requirePermission("recruitment.view"),
  async (req, res) => {
    try {
      const data = await recruitment.getRequisition({
        organizationId: req.auth.organizationId,
        requisitionId: req.params.id,
        scopeLocationId: req.auth.activeLocationId || null,
      });
      if (!data) {
        return res.status(404).json({
          status: "error",
          code: "REQUISITION_NOT_FOUND",
          message: "Job requisition not found in the permitted operating context.",
        });
      }
      return res.json({ status: "success", data });
    } catch (error) {
      return sendError(res, error, "Unable to load job requisition.");
    }
  }
);

router.post(
  "/requisitions",
  requirePermission("recruitment.manage"),
  async (req, res) => {
    try {
      const data = await recruitment.createRequisition({
        organizationId: req.auth.organizationId,
        actorUserId: req.auth.userId,
        scopeLocationId: req.auth.activeLocationId || null,
        input: req.body || {},
      });
      return res.status(201).json({
        status: "success",
        message: `${data.requisitionNumber} created as Draft.`,
        data,
      });
    } catch (error) {
      return sendError(res, error, "Unable to create job requisition.");
    }
  }
);

router.patch(
  "/requisitions/:id",
  requirePermission("recruitment.manage"),
  async (req, res) => {
    try {
      const data = await recruitment.updateRequisition({
        organizationId: req.auth.organizationId,
        requisitionId: req.params.id,
        actorUserId: req.auth.userId,
        scopeLocationId: req.auth.activeLocationId || null,
        input: req.body || {},
      });
      return res.json({ status: "success", message: `${data.requisitionNumber} updated.`, data });
    } catch (error) {
      return sendError(res, error, "Unable to update job requisition.");
    }
  }
);

router.post(
  "/requisitions/:id/submit",
  requirePermission("recruitment.manage"),
  async (req, res) => {
    try {
      const data = await recruitment.submitRequisition({
        organizationId: req.auth.organizationId,
        requisitionId: req.params.id,
        actorUserId: req.auth.userId,
        scopeLocationId: req.auth.activeLocationId || null,
        notes: req.body?.notes,
      });
      return res.json({ status: "success", message: `${data.requisitionNumber} submitted for Head Office approval.`, data });
    } catch (error) {
      return sendError(res, error, "Unable to submit job requisition.");
    }
  }
);

router.post(
  "/requisitions/:id/cancel",
  requirePermission("recruitment.manage"),
  async (req, res) => {
    try {
      const data = await recruitment.cancelRequisition({
        organizationId: req.auth.organizationId,
        requisitionId: req.params.id,
        actorUserId: req.auth.userId,
        scopeLocationId: req.auth.activeLocationId || null,
        notes: req.body?.notes,
      });
      return res.json({ status: "success", message: `${data.requisitionNumber} cancelled.`, data });
    } catch (error) {
      return sendError(res, error, "Unable to cancel job requisition.");
    }
  }
);

router.post(
  "/requisitions/:id/decision",
  requirePermission("recruitment.manage"),
  async (req, res) => {
    if (req.auth.activeLocationId) {
      return headOfficeRequired(res, "Requisition approval / return / rejection");
    }
    try {
      const data = await recruitment.decideRequisition({
        organizationId: req.auth.organizationId,
        requisitionId: req.params.id,
        actorUserId: req.auth.userId,
        decision: req.body?.decision,
        notes: req.body?.notes,
      });
      return res.json({ status: "success", message: `${data.requisitionNumber} moved to ${data.status}.`, data });
    } catch (error) {
      return sendError(res, error, "Unable to decide job requisition.");
    }
  }
);

router.post(
  "/requisitions/:id/close",
  requirePermission("recruitment.manage"),
  async (req, res) => {
    if (req.auth.activeLocationId) {
      return headOfficeRequired(res, "Requisition closure");
    }
    try {
      const data = await recruitment.closeRequisition({
        organizationId: req.auth.organizationId,
        requisitionId: req.params.id,
        actorUserId: req.auth.userId,
        notes: req.body?.notes,
      });
      return res.json({ status: "success", message: `${data.requisitionNumber} closed.`, data });
    } catch (error) {
      return sendError(res, error, "Unable to close job requisition.");
    }
  }
);

module.exports = router;
