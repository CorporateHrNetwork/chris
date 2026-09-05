const express = require("express");

const { requireAuth, requirePermission } = require("../middleware/authMiddleware");
const loans = require("../services/loanService");

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

router.get("/summary", requirePermission("payroll.view"), async (req, res) => {
  try {
    const data = await loans.getLoanSummary({ organizationId: req.auth.organizationId });
    return res.json({ status: "success", data });
  } catch (error) {
    return sendError(res, error, "Unable to load loan summary.");
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
    const data = await loans.createLoan({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      input: req.body || {},
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
    const data = await loans.createTopUp({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      loanId: req.params.id,
      input: req.body || {},
    });
    return res.status(201).json({ status: "success", data });
  } catch (error) {
    return sendError(res, error, "Unable to create top-up loan application.");
  }
});

module.exports = router;
