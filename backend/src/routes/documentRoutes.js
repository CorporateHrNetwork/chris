const express = require("express");
const prisma = require("../config/prisma");
const { requireAuth, requireAnyPermission } = require("../middleware/authMiddleware");
const { getOverview, createRecord, updateRecord, createRequest, updateRequestStatus } = require("../services/documentControlService");

const router = express.Router();
router.use(requireAuth);

const canView = requireAnyPermission("employees.view", "settings.view", "recruitment.view");
const canManage = requireAnyPermission("employees.manage", "settings.manage", "recruitment.manage", "payroll.manage");

router.get("/overview", canView, async (req, res) => {
  try {
    const data = await getOverview(prisma, req.auth.organizationId);
    return res.json({ status: "success", data });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ status: "error", code: error.code || "DOCUMENT_OVERVIEW_FAILED", message: error.message || "Unable to load document workspace." });
  }
});

router.post("/records", canManage, async (req, res) => {
  try {
    const data = await createRecord(prisma, { organizationId: req.auth.organizationId, actorUserId: req.auth.userId, input: req.body || {} });
    return res.status(201).json({ status: "success", message: "Document record created.", data });
  } catch (error) {
    return res.status(error.statusCode || 400).json({ status: "error", code: error.code || "DOCUMENT_CREATE_FAILED", message: error.message || "Unable to create document record." });
  }
});

router.put("/records/:recordId", canManage, async (req, res) => {
  try {
    const data = await updateRecord(prisma, { organizationId: req.auth.organizationId, actorUserId: req.auth.userId, recordId: req.params.recordId, input: req.body || {} });
    return res.json({ status: "success", message: "Document record updated.", data });
  } catch (error) {
    return res.status(error.statusCode || 400).json({ status: "error", code: error.code || "DOCUMENT_UPDATE_FAILED", message: error.message || "Unable to update document record." });
  }
});

router.post("/requests", canView, async (req, res) => {
  try {
    const data = await createRequest(prisma, { organizationId: req.auth.organizationId, actorUserId: req.auth.userId, input: req.body || {} });
    return res.status(201).json({ status: "success", message: "Document request created.", data });
  } catch (error) {
    return res.status(error.statusCode || 400).json({ status: "error", code: error.code || "DOCUMENT_REQUEST_CREATE_FAILED", message: error.message || "Unable to create document request." });
  }
});

router.put("/requests/:requestId/status", canManage, async (req, res) => {
  try {
    const data = await updateRequestStatus(prisma, { organizationId: req.auth.organizationId, actorUserId: req.auth.userId, requestId: req.params.requestId, status: req.body?.status, note: req.body?.note });
    return res.json({ status: "success", message: "Document request updated.", data });
  } catch (error) {
    return res.status(error.statusCode || 400).json({ status: "error", code: error.code || "DOCUMENT_REQUEST_UPDATE_FAILED", message: error.message || "Unable to update document request." });
  }
});

module.exports = router;
