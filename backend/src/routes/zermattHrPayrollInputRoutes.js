const express = require("express");

const prisma = require("../config/prisma");
const { requireAuth, requirePermission } = require("../middleware/authMiddleware");
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

function visibleInCurrentHrScope(req, locationId) {
  const activeLocationId = req.auth?.activeLocationId || null;
  if (activeLocationId) return locationId === activeLocationId;
  if (req.auth?.locationScope === "ALL_LOCATIONS") return true;
  const allowed = new Set((req.auth?.availableLocations || []).map((location) => location.id).filter(Boolean));
  return Boolean(locationId && allowed.has(locationId));
}

function dateValue(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : null;
}

function mapScopedSalaryRate(row) {
  const { employeeLocationId, ...rest } = row;
  return {
    ...rest,
    amount: Number(row.amount || 0),
    effectiveFrom: dateValue(row.effectiveFrom),
    effectiveTo: dateValue(row.effectiveTo),
  };
}

function mapScopedSalaryAdvance(row) {
  const { employeeLocationId, ...rest } = row;
  return {
    ...rest,
    amount: Number(row.amount || 0),
    outstandingAmount: Number(row.outstandingAmount || 0),
    installmentAmount: Number(row.installmentAmount || 0),
    issuedDate: dateValue(row.issuedDate),
    recoveryStartDate: dateValue(row.recoveryStartDate),
  };
}

async function listScopedSalaryRates(req) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT sr."id",sr."employeeId",e."employeeNumber",
            CONCAT_WS(' ',e."firstName",e."middleName",e."lastName") AS "employeeName",
            e."locationId" AS "employeeLocationId",
            sr."amount",sr."currency",sr."frequency",sr."effectiveFrom",sr."effectiveTo",
            sr."status",sr."reason",sr."createdAt",sr."updatedAt"
       FROM "payroll_salary_rates" sr
       JOIN "employees" e ON e."id"=sr."employeeId" AND e."organizationId"=sr."organizationId"
      WHERE sr."organizationId"=$1
      ORDER BY e."employeeNumber" ASC,sr."effectiveFrom" DESC`,
    req.auth.organizationId
  );
  return rows.filter((row) => visibleInCurrentHrScope(req, row.employeeLocationId)).map(mapScopedSalaryRate);
}

async function listScopedSalaryAdvances(req) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT pa."id",pa."employeeId",e."employeeNumber",
            CONCAT_WS(' ',e."firstName",e."middleName",e."lastName") AS "employeeName",
            e."locationId" AS "employeeLocationId",
            pa."amount",pa."outstandingAmount",pa."installmentAmount",pa."issuedDate",pa."recoveryStartDate",
            pa."status",pa."reason",pa."createdAt",pa."updatedAt"
       FROM "payroll_salary_advances" pa
       JOIN "employees" e ON e."id"=pa."employeeId" AND e."organizationId"=pa."organizationId"
      WHERE pa."organizationId"=$1
      ORDER BY pa."createdAt" DESC`,
    req.auth.organizationId
  );
  return rows.filter((row) => visibleInCurrentHrScope(req, row.employeeLocationId)).map(mapScopedSalaryAdvance);
}

router.get("/payroll/hr-input-capabilities", zermattOnly, (req, res) => {
  return res.json({ status: "success", data: capabilitySnapshot(req) });
});

// Branch HR reads the same authoritative salary-rate records, restricted to the
// active/assigned branch. Head HR sees all branches in the consolidated HEAD OFFICE
// context and can still switch to a single branch through the global branch selector.
router.get(
  "/payroll/salary-rates",
  zermattOnly,
  requirePermission("payroll.view"),
  async (req, res) => {
    try {
      return res.json({ status: "success", data: await listScopedSalaryRates(req) });
    } catch (error) {
      return sendError(res, error, "Unable to load salary rates.");
    }
  }
);

// Salary Advances follow the same visibility rule: branch entry is immediately
// reflected in the organization-wide HEAD OFFICE register because there is only
// one underlying tenant record, not a branch copy and a head-office copy.
router.get(
  "/payroll/salary-advances",
  zermattOnly,
  requirePermission("payroll.view"),
  async (req, res) => {
    try {
      return res.json({ status: "success", data: await listScopedSalaryAdvances(req) });
    } catch (error) {
      return sendError(res, error, "Unable to load salary advances.");
    }
  }
);

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