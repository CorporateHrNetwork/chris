const express = require("express");

const prisma = require("../config/prisma");
const { requireAuth, requirePermission } = require("../middleware/authMiddleware");
const loans = require("../services/loanService");
const { getLoanPolicies, validateLoanPurpose } = require("../services/loanPolicyService");
const { getLoanProfile, getBulkLoanReport } = require("../services/loanProfileService");
const { exportIndividualLoan, exportBulkLoans } = require("../services/loanReportExportService");

const router = express.Router();
router.use(requireAuth);

function sendError(res, error, fallback = "Loan operation failed.") {
  if (error?.code) {
    return res.status(error.statusCode || 400).json({
      status: "error",
      code: error.code,
      message: error.message || fallback,
      details: error.details,
    });
  }
  console.error("Loan operation error:", error);
  return res.status(500).json({ status: "error", message: error?.message || fallback });
}

function exportFormat(value) {
  const format = String(value || "").trim().toLowerCase();
  if (!["xlsx", "csv", "pdf"].includes(format)) {
    const error = new Error("Export format must be xlsx, csv or pdf.");
    error.code = "INVALID_LOAN_EXPORT_FORMAT";
    error.statusCode = 400;
    throw error;
  }
  return format;
}

function sendExport(res, file) {
  res.setHeader("Content-Type", file.contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${file.fileName}"`);
  res.setHeader("Cache-Control", "no-store");
  return res.send(file.buffer);
}

router.get("/summary", requirePermission("payroll.view"), async (req, res) => {
  try {
    const data = await loans.getLoanSummary({ organizationId: req.auth.organizationId });
    return res.json({ status: "success", data });
  } catch (error) {
    return sendError(res, error, "Unable to load loan summary.");
  }
});

router.get("/policies", requirePermission("payroll.view"), async (req, res) => {
  try {
    const data = await getLoanPolicies({
      organizationId: req.auth.organizationId,
      prismaClient: prisma,
    });
    return res.json({ status: "success", data });
  } catch (error) {
    return sendError(res, error, "Unable to load loan policies.");
  }
});

router.get("/recoveries", requirePermission("payroll.view"), async (req, res) => {
  try {
    const data = await loans.listRecoveries({
      organizationId: req.auth.organizationId,
      loanId: req.query?.loanId || null,
    });
    return res.json({ status: "success", data });
  } catch (error) {
    return sendError(res, error, "Unable to load loan recoveries.");
  }
});

router.get("/reports/export", requirePermission("payroll.view"), async (req, res) => {
  try {
    const format = exportFormat(req.query?.format);
    const rows = await getBulkLoanReport({ organizationId: req.auth.organizationId });
    return sendExport(res, exportBulkLoans(rows, format));
  } catch (error) {
    return sendError(res, error, "Unable to export bulk loan report.");
  }
});

router.get("/:id/profile", requirePermission("payroll.view"), async (req, res) => {
  try {
    const data = await getLoanProfile({
      organizationId: req.auth.organizationId,
      loanId: req.params.id,
    });
    return res.json({ status: "success", data });
  } catch (error) {
    return sendError(res, error, "Unable to load loan profile.");
  }
});

router.get("/:id/export", requirePermission("payroll.view"), async (req, res) => {
  try {
    const format = exportFormat(req.query?.format);
    const profile = await getLoanProfile({
      organizationId: req.auth.organizationId,
      loanId: req.params.id,
    });
    return sendExport(res, exportIndividualLoan(profile, format));
  } catch (error) {
    return sendError(res, error, "Unable to export loan profile.");
  }
});

router.get("/", requirePermission("payroll.view"), async (req, res) => {
  try {
    const data = await loans.listLoans({
      organizationId: req.auth.organizationId,
      status: req.query?.status || null,
      employeeNumber: req.query?.employeeNumber || null,
    });
    return res.json({ status: "success", data });
  } catch (error) {
    return sendError(res, error, "Unable to load loans.");
  }
});

router.post("/", requirePermission("payroll.manage"), async (req, res) => {
  try {
    const purpose = await validateLoanPurpose({
      organizationId: req.auth.organizationId,
      purpose: req.body?.purpose,
      prismaClient: prisma,
    });
    const data = await loans.createLoan({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      input: { ...(req.body || {}), purpose },
    });
    return res.status(201).json({ status: "success", data });
  } catch (error) {
    return sendError(res, error, "Unable to create loan application.");
  }
});

router.patch("/:id/decision", requirePermission("payroll.manage"), async (req, res) => {
  try {
    const data = await loans.decideLoan({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      loanId: req.params.id,
      decision: req.body?.decision,
      notes: req.body?.notes,
    });
    return res.json({ status: "success", data });
  } catch (error) {
    return sendError(res, error, "Unable to decide loan application.");
  }
});

router.patch("/:id/disburse", requirePermission("payroll.manage"), async (req, res) => {
  try {
    const data = await loans.disburseLoan({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      loanId: req.params.id,
      input: req.body || {},
    });
    return res.json({ status: "success", data });
  } catch (error) {
    return sendError(res, error, "Unable to activate approved loan for recovery.");
  }
});

router.patch("/:id/status", requirePermission("payroll.manage"), async (req, res) => {
  try {
    const data = await loans.updateLoanStatus({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      loanId: req.params.id,
      action: req.body?.action,
      reason: req.body?.reason,
    });
    return res.json({ status: "success", data });
  } catch (error) {
    return sendError(res, error, "Unable to update loan status.");
  }
});

router.post("/:id/top-up", requirePermission("payroll.manage"), async (req, res) => {
  try {
    const purpose = await validateLoanPurpose({
      organizationId: req.auth.organizationId,
      purpose: req.body?.purpose,
      prismaClient: prisma,
    });
    const data = await loans.createTopUp({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      loanId: req.params.id,
      input: { ...(req.body || {}), purpose },
    });
    return res.status(201).json({ status: "success", data });
  } catch (error) {
    return sendError(res, error, "Unable to create top-up loan application.");
  }
});

module.exports = router;
