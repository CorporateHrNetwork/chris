const express = require("express");
const { requireAuth, requireAnyPermission } = require("../middleware/authMiddleware");
const { reopenApprovedPayroll } = require("../services/payrollReopenService");

const router = express.Router();
router.use(requireAuth);

router.post("/runs/:id/reopen", requireAnyPermission("payroll.manage", "payroll.approve"), async (req, res) => {
  try {
    const data = await reopenApprovedPayroll({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      runId: req.params.id,
      reason: req.body?.reason,
    });
    return res.json({
      status: "success",
      message: "Approved payroll reopened to Draft. Posted Loan and Salary Advance recoveries were reversed and the payroll now requires recalculation.",
      data,
    });
  } catch (error) {
    if (error?.code) {
      return res.status(error.statusCode || 400).json({ status: "error", code: error.code, message: error.message, details: error.details });
    }
    console.error("Payroll reopen error:", error);
    return res.status(500).json({ status: "error", message: error?.message || "Unable to reopen approved payroll." });
  }
});

module.exports = router;
