const express = require("express");

const { requireAuth, requirePermission } = require("../middleware/authMiddleware");
const payroll = require("../services/payrollOperationsService");
const { markDraftRunsRecalculationRequired } = require("../services/payrollDraftFreshnessService");
const prisma = require("../config/prisma");

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
  console.error("Payroll draft freshness error:", error);
  return res.status(500).json({ status: "error", message: error?.message || fallback });
}

router.post("/payroll/salary-advances", requirePermission("payroll.manage"), async (req, res) => {
  try {
    const data = await payroll.createSalaryAdvance({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      input: req.body || {},
    });
    const freshness = await markDraftRunsRecalculationRequired({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      reason: `Salary Advance ${data.id} was recorded and payroll drafts must be recalculated.`,
    });
    return res.status(201).json({ status: "success", data: { ...data, payrollDraftFreshness: freshness } });
  } catch (error) {
    return sendError(res, error, "Unable to create salary advance.");
  }
});

router.patch("/payroll/salary-advances/:id/status", requirePermission("payroll.manage"), async (req, res) => {
  try {
    const data = await payroll.updateSalaryAdvanceStatus({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      advanceId: req.params.id,
      status: req.body?.status,
      reason: req.body?.reason,
    });
    const freshness = await markDraftRunsRecalculationRequired({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      reason: `Salary Advance ${req.params.id} status changed and payroll drafts must be recalculated.`,
    });
    return res.json({ status: "success", data: { ...data, payrollDraftFreshness: freshness } });
  } catch (error) {
    return sendError(res, error, "Unable to update salary advance.");
  }
});

router.post("/payroll/runs/:id/submit", requirePermission("payroll.process"), async (req, res) => {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT "id","status","statutoryStatus"
         FROM "payroll_runs"
        WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,
      req.auth.organizationId,
      req.params.id
    );
    const run = rows[0];
    if (!run) throw payroll.operationalError("PAYROLL_RUN_NOT_FOUND", "Payroll run not found.", 404);
    if (run.statutoryStatus === "RECALCULATION_REQUIRED") {
      throw payroll.operationalError(
        "PAYROLL_RECALCULATION_REQUIRED",
        "Payroll inputs changed after this draft was calculated. Recalculate the payroll period before submitting it for approval.",
        409
      );
    }

    const data = await payroll.submitPayrollRun({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      runId: req.params.id,
      notes: req.body?.notes,
    });
    return res.json({ status: "success", data });
  } catch (error) {
    return sendError(res, error, "Unable to submit payroll run.");
  }
});

module.exports = router;
