const express = require("express");

const { requireAuth } = require("../middleware/authMiddleware");
const payroll = require("../services/payrollOperationsService");
const {
  requireEmployeeFinancialInputEditor,
  requireHeadHrFinancialControl,
  assertEmployeeNumberAccess,
  assertSalaryRateAccess,
  capabilitySnapshot,
  isZermatt,
} = require("../services/zermattHrFinancialAccessService");
const {
  updateSalaryRate,
  deleteUnusedSalaryRate,
} = require("../services/zermattSalaryRateControlService");
const { markDraftRunsRecalculationRequired } = require("../services/payrollDraftFreshnessService");

const router = express.Router();
router.use(requireAuth);

function zermattOnly(req, res, next) {
  if (!isZermatt(req)) return next("route");
  return next();
}

function sendError(res, error, fallback) {
  if (error?.code) {
    return res.status(error.statusCode || 400).json({
      status: "error",
      code: error.code,
      message: error.message || fallback,
      details: error.details,
    });
  }
  console.error("Zermatt HR payroll input error:", error);
  return res.status(500).json({ status: "error", message: error?.message || fallback });
}

router.get("/payroll/hr-input-capabilities", zermattOnly, (req, res) => {
  return res.json({ status: "success", data: capabilitySnapshot(req) });
});

// Individual salary-rate maintenance is employee master/payroll-input data, not
// payroll execution authority. Branch HR may maintain assigned-branch employees;
// Head HR sees the same records organization-wide through HEAD OFFICE.
router.post(
  "/payroll/salary-rates",
  zermattOnly,
  requireEmployeeFinancialInputEditor,
  async (req, res) => {
    try {
      await assertEmployeeNumberAccess({ req, employeeNumber: req.body?.employeeNumber });
      const data = await payroll.saveSalaryRate({
        organizationId: req.auth.organizationId,
        actorUserId: req.auth.userId,
        input: req.body || {},
      });
      const freshness = await markDraftRunsRecalculationRequired({
        organizationId: req.auth.organizationId,
        actorUserId: req.auth.userId,
        reason: `Salary rate ${data.id} was recorded by HR; draft payroll must be recalculated.`,
      });
      return res.status(201).json({ status: "success", data: { ...data, payrollDraftFreshness: freshness } });
    } catch (error) {
      return sendError(res, error, "Unable to save salary rate.");
    }
  }
);

router.patch(
  "/payroll/salary-rates/:id",
  zermattOnly,
  requireEmployeeFinancialInputEditor,
  async (req, res) => {
    try {
      await assertSalaryRateAccess({ req, rateId: req.params.id });
      const data = await updateSalaryRate({
        organizationId: req.auth.organizationId,
        actorUserId: req.auth.userId,
        rateId: req.params.id,
        input: req.body || {},
      });
      return res.json({ status: "success", data });
    } catch (error) {
      return sendError(res, error, "Unable to edit salary rate.");
    }
  }
);

router.patch(
  "/payroll/salary-rates/:id/retire",
  zermattOnly,
  requireEmployeeFinancialInputEditor,
  async (req, res) => {
    try {
      await assertSalaryRateAccess({ req, rateId: req.params.id });
      const data = await payroll.retireSalaryRate({
        organizationId: req.auth.organizationId,
        actorUserId: req.auth.userId,
        rateId: req.params.id,
        effectiveTo: req.body?.effectiveTo,
        reason: req.body?.reason,
      });
      const freshness = await markDraftRunsRecalculationRequired({
        organizationId: req.auth.organizationId,
        actorUserId: req.auth.userId,
        reason: `Salary rate ${req.params.id} was retired/end-dated by HR; draft payroll must be recalculated.`,
      });
      return res.json({ status: "success", data: { ...data, payrollDraftFreshness: freshness } });
    } catch (error) {
      return sendError(res, error, "Unable to retire salary rate.");
    }
  }
);

router.delete(
  "/payroll/salary-rates/:id",
  zermattOnly,
  requireHeadHrFinancialControl,
  async (req, res) => {
    try {
      await assertSalaryRateAccess({ req, rateId: req.params.id });
      const data = await deleteUnusedSalaryRate({
        organizationId: req.auth.organizationId,
        actorUserId: req.auth.userId,
        rateId: req.params.id,
        reason: req.body?.reason,
      });
      return res.json({ status: "success", data });
    } catch (error) {
      return sendError(res, error, "Unable to delete salary rate.");
    }
  }
);

module.exports = router;