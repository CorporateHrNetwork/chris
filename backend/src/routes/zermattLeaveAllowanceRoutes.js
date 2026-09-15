const express = require("express");

const prisma = require("../config/prisma");
const { requireAuth, requirePermission } = require("../middleware/authMiddleware");
const { getPayrollReadiness } = require("../services/payrollReadinessService");
const nigeriaPayroll = require("../services/nigeriaPayrollComplianceService");
const { isZermatt } = require("../services/zermattHrFinancialAccessService");
const {
  applyZermattLeaveAllowanceToDraft,
} = require("../services/zermattLeaveAllowanceService");
const {
  listZermattLeaveAllowanceRegister,
} = require("../services/zermattLeaveAllowanceRegisterService");

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
  console.error("Zermatt Leave Allowance error:", error);
  return res.status(500).json({ status: "error", message: error?.message || fallback });
}

function visibleInCurrentHrScope(req, locationId) {
  const activeLocationId = req.auth?.activeLocationId || null;
  if (activeLocationId) return locationId === activeLocationId;
  if (req.auth?.locationScope === "ALL_LOCATIONS") return true;
  const allowed = new Set((req.auth?.availableLocations || []).map((location) => location.id).filter(Boolean));
  return Boolean(locationId && allowed.has(locationId));
}

router.get(
  "/benefits/leave-allowance",
  zermattOnly,
  requirePermission("payroll.view"),
  async (req, res) => {
    try {
      const data = await listZermattLeaveAllowanceRegister({
        organizationId: req.auth.organizationId,
        prismaClient: prisma,
      });
      const rows = (data.rows || []).filter((row) => visibleInCurrentHrScope(req, row.locationId));
      return res.json({
        status: "success",
        data: {
          ...data,
          rows,
          summary: {
            ...data.summary,
            visibleEmployees: rows.length,
            visibleApprovedPayments: rows.reduce((sum, row) => sum + Number(row.paymentHistory?.length || 0), 0),
            visibleApprovedAmount: rows.reduce(
              (sum, row) => sum + (row.paymentHistory || []).reduce((inner, payment) => inner + Number(payment.amount || 0), 0),
              0
            ),
          },
        },
      });
    } catch (error) {
      return sendError(res, error, "Unable to load Zermatt Leave Allowance register.");
    }
  }
);

// ZERMATT draft payroll is intercepted before the generic payroll router so the
// Benefits-owned Leave Allowance is part of the same calculation, totals and
// approved payslip. Other tenants continue through the existing payroll route.
router.post(
  "/payroll/runs/draft",
  zermattOnly,
  requirePermission("payroll.process"),
  async (req, res) => {
    try {
      const readiness = await getPayrollReadiness({ organizationId: req.auth.organizationId });
      if (!readiness.executionEnabled) {
        const incompleteEmployees = (readiness.employees || [])
          .filter((employee) => !employee.readyForExecution)
          .slice(0, 25)
          .map((employee) => ({ employeeNumber: employee.employeeNumber, blockers: employee.blockers }));
        const error = new Error(
          `${Math.max(0, Number(readiness.summary?.currentEmployees || 0) - Number(readiness.summary?.readyForExecution || 0))} current employee(s) are not ready for draft payroll execution.`
        );
        error.code = "PAYROLL_EXECUTION_READINESS_INCOMPLETE";
        error.statusCode = 409;
        error.details = { employees: incompleteEmployees };
        throw error;
      }

      const base = await nigeriaPayroll.executeNigeriaDraftPayroll({
        organizationId: req.auth.organizationId,
        actorUserId: req.auth.userId,
        periodId: req.body?.periodId,
      });
      const runId = base?.run?.id;
      if (!runId) throw new Error("PAYROLL_RUN_NOT_CREATED");

      const leaveAllowance = await applyZermattLeaveAllowanceToDraft({
        organizationId: req.auth.organizationId,
        actorUserId: req.auth.userId,
        runId,
        periodId: req.body?.periodId,
        prismaClient: prisma,
      });

      const runRows = await prisma.$queryRawUnsafe(
        `SELECT pr."id",pr."periodId",pp."code" AS "periodCode",pp."name" AS "periodName",pp."periodStart",pp."periodEnd",pp."payDate",
                pr."status",pr."employeeCount",pr."grossTotal",pr."deductionTotal",pr."netPreviewTotal",pr."statutoryStatus",
                pr."submittedAt",pr."approvedAt",pr."createdAt",pr."updatedAt"
           FROM "payroll_runs" pr
           JOIN "payroll_periods" pp ON pp."id"=pr."periodId" AND pp."organizationId"=pr."organizationId"
          WHERE pr."organizationId"=$1 AND pr."id"=$2 LIMIT 1`,
        req.auth.organizationId,
        runId
      );
      const lineRows = await prisma.$queryRawUnsafe(
        `SELECT "id","runId","employeeId","employeeNumber","employeeName","currency","baseSalary","allowances","deductions",
                "advanceRecovery","loanRecovery","grossPay","netPreview","statutoryStatus","details","createdAt","updatedAt"
           FROM "payroll_run_lines"
          WHERE "organizationId"=$1 AND "runId"=$2 ORDER BY "employeeNumber"`,
        req.auth.organizationId,
        runId
      );
      const mapLine = (row) => ({
        ...row,
        baseSalary: Number(row.baseSalary || 0),
        allowances: Number(row.allowances || 0),
        deductions: Number(row.deductions || 0),
        advanceRecovery: Number(row.advanceRecovery || 0),
        loanRecovery: Number(row.loanRecovery || 0),
        grossPay: Number(row.grossPay || 0),
        netPreview: Number(row.netPreview || 0),
        details: typeof row.details === "object" ? row.details : JSON.parse(row.details || "{}"),
      });
      const run = runRows[0]
        ? {
            ...runRows[0],
            employeeCount: Number(runRows[0].employeeCount || 0),
            grossTotal: Number(runRows[0].grossTotal || 0),
            deductionTotal: Number(runRows[0].deductionTotal || 0),
            netPreviewTotal: Number(runRows[0].netPreviewTotal || 0),
            periodStart: runRows[0].periodStart ? new Date(runRows[0].periodStart).toISOString().slice(0, 10) : null,
            periodEnd: runRows[0].periodEnd ? new Date(runRows[0].periodEnd).toISOString().slice(0, 10) : null,
            payDate: runRows[0].payDate ? new Date(runRows[0].payDate).toISOString().slice(0, 10) : null,
          }
        : base.run;

      return res.status(201).json({
        status: "success",
        message: leaveAllowance.beneficiaryCount
          ? `Draft payroll calculated. ${leaveAllowance.beneficiaryCount} employee(s) received Zermatt Leave Allowance for this period.`
          : "Draft payroll calculated. No Zermatt Leave Allowance fell due in this period.",
        data: {
          run,
          lines: lineRows.map(mapLine),
          leaveAllowance,
        },
      });
    } catch (error) {
      return sendError(res, error, "Unable to calculate Zermatt payroll with Leave Allowance.");
    }
  }
);

module.exports = router;