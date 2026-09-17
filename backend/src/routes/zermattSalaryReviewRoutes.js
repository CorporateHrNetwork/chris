const express = require("express");
const prisma = require("../config/prisma");
const { requireAuth } = require("../middleware/authMiddleware");
const {
  requireEmployeeFinancialInputEditor,
  assertEmployeeNumberAccess,
  isZermatt,
} = require("../services/zermattHrFinancialAccessService");
const payroll = require("../services/payrollOperationsService");
const { markDraftRunsRecalculationRequired } = require("../services/payrollDraftFreshnessService");

const router = express.Router();
router.use(requireAuth);

function zermattOnly(req, res, next) {
  if (!isZermatt(req)) return next("route");
  return next();
}

function dateOnly(value) {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : raw;
}

function previousDay(value) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

router.post(
  "/payroll/salary-reviews",
  zermattOnly,
  requireEmployeeFinancialInputEditor,
  async (req, res) => {
    try {
      const employeeNumber = String(req.body?.employeeNumber || "").trim().toUpperCase();
      const reason = String(req.body?.reason || "").trim();
      const effectiveFrom = dateOnly(req.body?.effectiveFrom);
      const amount = Number(req.body?.amount);

      if (!employeeNumber) return res.status(400).json({ status: "error", code: "EMPLOYEE_REQUIRED", message: "Select an employee." });
      if (!effectiveFrom) return res.status(400).json({ status: "error", code: "SALARY_REVIEW_EFFECTIVE_DATE_REQUIRED", message: "Enter a valid salary review effective date." });
      if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ status: "error", code: "SALARY_REVIEW_AMOUNT_REQUIRED", message: "Enter the revised monthly gross salary." });
      if (!reason) return res.status(400).json({ status: "error", code: "SALARY_REVIEW_REASON_REQUIRED", message: "Enter a reason for the salary review." });

      const employee = await assertEmployeeNumberAccess({ req, employeeNumber });
      const activeRates = await prisma.$queryRawUnsafe(
        `SELECT "id","amount","currency","effectiveFrom","effectiveTo","status","reason"
           FROM "payroll_salary_rates"
          WHERE "organizationId"=$1 AND "employeeId"=$2 AND "status"='ACTIVE'
            AND "effectiveFrom" <= $3::date
            AND ("effectiveTo" IS NULL OR "effectiveTo" >= $3::date)
          ORDER BY "effectiveFrom" DESC LIMIT 1`,
        req.auth.organizationId,
        employee.id,
        effectiveFrom
      );
      const current = activeRates[0] || null;
      if (current && Number(current.amount || 0) === amount) {
        return res.status(409).json({ status: "error", code: "SALARY_REVIEW_NO_CHANGE", message: "The revised salary is the same as the employee's current salary." });
      }

      const result = await prisma.$transaction(async (tx) => {
        if (current) {
          await payroll.retireSalaryRate({
            organizationId: req.auth.organizationId,
            actorUserId: req.auth.userId,
            rateId: current.id,
            effectiveTo: previousDay(effectiveFrom),
            reason: `Superseded by salary review effective ${effectiveFrom}. ${reason}`,
            prismaClient: tx,
          });
        }

        const created = await payroll.saveSalaryRate({
          organizationId: req.auth.organizationId,
          actorUserId: req.auth.userId,
          input: {
            employeeNumber,
            amount,
            currency: req.body?.currency || current?.currency || "NGN",
            effectiveFrom,
            reason: `Individual salary review: ${reason}`,
          },
          prismaClient: tx,
        });

        await tx.organizationAudit.create({
          data: {
            organizationId: req.auth.organizationId,
            actorUserId: req.auth.userId,
            entityType: "EmployeeSalaryReview",
            entityId: employee.id,
            action: "INDIVIDUAL_SALARY_REVIEW_APPLIED",
            previousValue: current ? { amount: Number(current.amount || 0), effectiveFrom: current.effectiveFrom, effectiveTo: current.effectiveTo } : undefined,
            newValue: { salaryRateId: created.id, amount: created.amount, currency: created.currency, effectiveFrom: created.effectiveFrom },
            reason,
          },
        });

        return created;
      });

      const freshness = await markDraftRunsRecalculationRequired({
        organizationId: req.auth.organizationId,
        actorUserId: req.auth.userId,
        reason: `Individual salary review for ${employeeNumber} is effective ${effectiveFrom}; draft payroll must be recalculated.`,
      });

      return res.status(201).json({
        status: "success",
        message: `${employeeNumber} salary review saved with effective-dated history and audit trail.`,
        data: { ...result, payrollDraftFreshness: freshness },
      });
    } catch (error) {
      console.error("Zermatt salary review error:", error);
      return res.status(error.statusCode || 400).json({
        status: "error",
        code: error.code || "SALARY_REVIEW_FAILED",
        message: error.message || "Unable to apply salary review.",
        details: error.details,
      });
    }
  }
);

module.exports = router;
