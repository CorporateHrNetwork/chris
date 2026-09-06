const express = require("express");
const prisma = require("../config/prisma");
const { requireAuth, requirePermission } = require("../middleware/authMiddleware");
const { updateSalaryAdvance, updateLoan } = require("../services/payrollLiabilityEditService");
const { cancelSalaryAdvance, deleteSalaryAdvance } = require("../services/salaryAdvanceControlService");
const { markDraftRunsRecalculationRequired } = require("../services/payrollDraftFreshnessService");
const { validateLoanPurpose } = require("../services/loanPolicyService");
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

function isSuperUser(req) {
  const roles = (req.auth?.roles || []).map((role) => String(role || "").trim().toUpperCase().replace(/[\s_-]+/g, ""));
  const permissions = new Set(req.auth?.permissions || []);
  const organizationSlug = String(req.auth?.organization?.slug || "").trim().toLowerCase();
  const superRole = roles.some((role) => [
    "SUPERUSER",
    "SUPERADMIN",
    "ORGANIZATIONSUPERUSER",
    "ORGANIZATIONADMINISTRATOR",
    "ADMINISTRATOR",
  ].includes(role));
  const superPermissionProfile = [
    "payroll.manage",
    "users.manage",
    "roles.manage",
    "settings.manage",
  ].every((permission) => permissions.has(permission));

  return organizationSlug === "zermatt-liquor-limited" && (superRole || superPermissionProfile);
}

function requireZermattSuperUser(req, res, next) {
  if (!isSuperUser(req)) {
    return res.status(403).json({
      status: "error",
      code: "ZERMATT_SUPER_USER_REQUIRED",
      message: "Only the ZERMATT Super User can cancel or delete salary advances.",
    });
  }
  next();
}

router.get("/payroll/salary-advances/control-capabilities", requirePermission("payroll.manage"), (req, res) => {
  return res.json({
    status: "success",
    data: {
      canCancelDelete: isSuperUser(req),
      deleteRule: "UNUSED_ONLY",
      cancelRule: "ACTIVE_OR_PAUSED",
      historicalRecoveryImmutable: true,
    },
  });
});

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

router.post("/payroll/salary-advances/:id/cancel", requirePermission("payroll.manage"), requireZermattSuperUser, async (req, res) => {
  try {
    const data = await cancelSalaryAdvance({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      advanceId: req.params.id,
      reason: req.body?.reason,
    });
    const freshness = await markDraftRunsRecalculationRequired({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      reason: `Salary Advance ${req.params.id} was cancelled by the ZERMATT Super User and payroll drafts must be recalculated.`,
    });
    return res.json({ status: "success", data: { ...data, payrollDraftFreshness: freshness } });
  } catch (error) {
    return sendError(res, error, "Unable to cancel salary advance.");
  }
});

router.delete("/payroll/salary-advances/:id", requirePermission("payroll.manage"), requireZermattSuperUser, async (req, res) => {
  try {
    const data = await deleteSalaryAdvance({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      advanceId: req.params.id,
      reason: req.body?.reason,
    });
    const freshness = await markDraftRunsRecalculationRequired({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      reason: `Salary Advance ${req.params.id} was deleted by the ZERMATT Super User and payroll drafts must be recalculated.`,
    });
    return res.json({ status: "success", data: { ...data, payrollDraftFreshness: freshness } });
  } catch (error) {
    return sendError(res, error, "Unable to delete salary advance.");
  }
});

router.patch("/loans/:id", requirePermission("payroll.manage"), async (req, res) => {
  try {
    const input = { ...(req.body || {}) };
    if (input.purpose !== undefined) {
      input.purpose = await validateLoanPurpose({
        organizationId: req.auth.organizationId,
        purpose: input.purpose,
        prismaClient: prisma,
      });
    }
    const data = await updateLoan({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      loanId: req.params.id,
      input,
    });
    return res.json({ status: "success", data });
  } catch (error) {
    return sendError(res, error, "Unable to edit loan.");
  }
});

module.exports = router;
