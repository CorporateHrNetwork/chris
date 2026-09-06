const express = require("express");
const multer = require("multer");

const { requireAuth, requireAnyPermission } = require("../middleware/authMiddleware");
const { getLoanPolicies, validateLoanPurpose } = require("../services/loanPolicyService");
const loans = require("../services/loanService");
const prisma = require("../config/prisma");
const workflow = require("../services/loanOriginationWorkflowService");
const { deliverNotification } = require("../services/loanWorkflowNotificationService");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
router.use(requireAuth);

function sendError(res, error, fallback = "Loan workflow operation failed.") {
  if (error?.code) {
    return res.status(error.statusCode || 400).json({ status: "error", code: error.code, message: error.message || fallback, details: error.details });
  }
  console.error("Loan workflow error:", error);
  return res.status(500).json({ status: "error", message: error?.message || fallback });
}

const mayApply = requireAnyPermission("loans.apply", "payroll.manage");
const mayVerify = requireAnyPermission("loans.verify", "payroll.manage");
const mayApprove = requireAnyPermission("loans.approve", "payroll.manage");
const mayDisburse = requireAnyPermission("loans.disburse", "payroll.manage");
const mayView = requireAnyPermission("loans.view", "payroll.view", "loans.apply", "loans.verify", "loans.approve", "loans.disburse", "payroll.manage");

// These read routes intentionally shadow the older payroll.view-only loan routes so branch workflow
// users can open the same Loans workspace without being granted broad payroll access.
router.get("/summary", mayView, async (req, res) => {
  try {
    return res.json({ status: "success", data: await loans.getLoanSummary({ organizationId: req.auth.organizationId }) });
  } catch (error) {
    return sendError(res, error, "Unable to load loan summary.");
  }
});

router.get("/recoveries", mayView, async (req, res) => {
  try {
    return res.json({ status: "success", data: await loans.listRecoveries({ organizationId: req.auth.organizationId, loanId: req.query?.loanId || null }) });
  } catch (error) {
    return sendError(res, error, "Unable to load loan recoveries.");
  }
});

router.get("/policies", mayView, async (req, res) => {
  try {
    return res.json({ status: "success", data: await getLoanPolicies({ organizationId: req.auth.organizationId, prismaClient: prisma }) });
  } catch (error) {
    return sendError(res, error, "Unable to load loan policies.");
  }
});

router.get("/", mayView, async (req, res) => {
  try {
    return res.json({
      status: "success",
      data: await loans.listLoans({ organizationId: req.auth.organizationId, status: req.query?.status || null, employeeNumber: req.query?.employeeNumber || null }),
    });
  } catch (error) {
    return sendError(res, error, "Unable to load loans.");
  }
});

router.post("/applications", mayApply, async (req, res) => {
  try {
    const purpose = await validateLoanPurpose({ organizationId: req.auth.organizationId, purpose: req.body?.purpose, prismaClient: prisma });
    const data = await workflow.createDraftApplication({ organizationId: req.auth.organizationId, actorUserId: req.auth.userId, input: req.body || {}, purpose });
    return res.status(201).json({ status: "success", message: "Loan application draft created. Attach the completed loan application form before submission for HR verification.", data });
  } catch (error) {
    return sendError(res, error, "Unable to create loan application draft.");
  }
});

router.post("/:id/application-form", mayApply, upload.single("file"), async (req, res) => {
  try {
    const data = await workflow.addApplicationForm({ organizationId: req.auth.organizationId, actorUserId: req.auth.userId, loanId: req.params.id, file: req.file });
    return res.status(201).json({ status: "success", message: "Loan application form attached.", data });
  } catch (error) {
    return sendError(res, error, "Unable to attach the loan application form.");
  }
});

router.get("/:id/attachments", mayView, async (req, res) => {
  try {
    const data = await workflow.listAttachments({ organizationId: req.auth.organizationId, loanId: req.params.id });
    return res.json({ status: "success", data });
  } catch (error) {
    return sendError(res, error, "Unable to load loan attachments.");
  }
});

router.get("/:id/attachments/:attachmentId/download", mayView, async (req, res) => {
  try {
    const file = await workflow.getAttachment({ organizationId: req.auth.organizationId, loanId: req.params.id, attachmentId: req.params.attachmentId });
    res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${String(file.fileName || "loan-application").replace(/"/g, "")}"`);
    res.setHeader("Cache-Control", "no-store");
    return res.send(file.content);
  } catch (error) {
    return sendError(res, error, "Unable to download loan attachment.");
  }
});

router.post("/:id/submit-for-hr-verification", mayApply, async (req, res) => {
  try {
    const data = await workflow.submitForHrVerification({ organizationId: req.auth.organizationId, actorUserId: req.auth.userId, loanId: req.params.id, comments: req.body?.comments });
    return res.json({ status: "success", message: "Loan application submitted to Head HR for verification.", data });
  } catch (error) {
    return sendError(res, error, "Unable to submit loan application for HR verification.");
  }
});

router.post("/:id/hr-verification", mayVerify, async (req, res) => {
  try {
    const data = await workflow.hrVerificationDecision({ organizationId: req.auth.organizationId, actorUserId: req.auth.userId, loanId: req.params.id, decision: req.body?.decision, comments: req.body?.comments });
    return res.json({ status: "success", message: `Head HR decision recorded: ${String(req.body?.decision || "").toUpperCase()}.`, data });
  } catch (error) {
    return sendError(res, error, "Unable to record Head HR verification decision.");
  }
});

router.get("/email-approval/:token", mayApprove, async (req, res) => {
  try {
    const data = await workflow.resolveEmailApprovalToken({ organizationId: req.auth.organizationId, token: req.params.token, actorUserId: req.auth.userId });
    return res.json({ status: "success", data });
  } catch (error) {
    return sendError(res, error, "Unable to validate the GM approval link.");
  }
});

router.post("/:id/gm-decision", mayApprove, async (req, res) => {
  try {
    const data = await workflow.gmDecision({ organizationId: req.auth.organizationId, actorUserId: req.auth.userId, loanId: req.params.id, decision: req.body?.decision, comments: req.body?.comments, token: req.body?.token || null });
    return res.json({ status: "success", message: `General Manager decision recorded: ${String(req.body?.decision || "").toUpperCase()}.`, data });
  } catch (error) {
    return sendError(res, error, "Unable to record General Manager decision.");
  }
});

router.post("/:id/disbursement", mayDisburse, async (req, res) => {
  try {
    const data = await workflow.disburseApprovedLoan({ organizationId: req.auth.organizationId, actorUserId: req.auth.userId, loanId: req.params.id, input: req.body || {} });
    return res.json({ status: "success", message: "Loan disbursement recorded. The loan is now active for payroll recovery from the configured recovery month.", data });
  } catch (error) {
    return sendError(res, error, "Unable to process approved loan disbursement.");
  }
});

router.get("/:id/workflow", mayView, async (req, res) => {
  try {
    const data = await workflow.getWorkflow({ organizationId: req.auth.organizationId, loanId: req.params.id });
    return res.json({ status: "success", data });
  } catch (error) {
    return sendError(res, error, "Unable to load loan workflow history.");
  }
});

router.post("/notifications/:id/retry", requireAnyPermission("payroll.manage", "loans.verify"), async (req, res) => {
  try {
    const data = await deliverNotification({ notificationId: req.params.id });
    return res.json({ status: "success", data });
  } catch (error) {
    return sendError(res, error, "Unable to retry loan workflow notification.");
  }
});

module.exports = router;
