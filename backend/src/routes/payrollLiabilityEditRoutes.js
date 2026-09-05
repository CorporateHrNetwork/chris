const express = require("express");
const { requireAuth, requirePermission } = require("../middleware/authMiddleware");
const { updateSalaryAdvance, updateLoan } = require("../services/payrollLiabilityEditService");
const { markDraftRunsRecalculationRequired } = require("../services/payrollDraftFreshnessService");
const payrollDraftFreshnessRoutes = require("./payrollDraftFreshnessRoutes");

const router = express.Router();
router.use(requireAuth);
router.use(payrollDraftFreshnessRoutes);

function sendError(res, error, fallback) {
  if (error?.code) {
    return res.status(error.statusCode || 400).json({
      status: "error",
      code: error.code,
      message: error.message || fallback,
      details: error.details,
    });
  }
  console.error("Payroll liability edit error:", error);
  return res.status(500).json({ status: "error", message: error?.message || fallback });
}

router.patch("/payroll/salary-advances/:id", requirePermission("payroll.manage"), async (req, res) => {
  try {
    const data = await updateSalaryAdvance({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      advanceId: req.params.id,
      input: req.body || {},
    });
    const freshness = await markDraftRunsRecalculationRequired({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      reason: `Salary Advance ${req.params.id} was edited and payroll drafts must be recalculated.`,
    });
    return res.json({ status: "success", data: { ...data, payrollDraftFreshness: freshness } });
  } catch (error) {
    return sendError(res, error, "Unable to edit salary advance.");
  }
});

router.patch("/loans/:id", requirePermission("payroll.manage"), async (req, res) => {
  try {
    const data = await updateLoan({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      loanId: req.params.id,
      input: req.body || {},
    });
    const freshness = await markDraftRunsRecalculationRequired({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      reason: `Loan ${req.params.id} was edited and open payroll drafts must be recalculated.`,
    });
    return res.json({ status: "success", data: { ...data, payrollDraftFreshness: freshness } });
  } catch (error) {
    return sendError(res, error, "Unable to edit loan.");
  }
});

module.exports = router;
