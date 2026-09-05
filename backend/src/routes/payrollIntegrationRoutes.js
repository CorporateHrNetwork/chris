const express = require("express");
const prisma = require("../config/prisma");
const { requireAuth, requirePermission } = require("../middleware/authMiddleware");
const { getPayrollStatutoryCatalogue } = require("../services/payrollStatutoryCatalogueService");

const router = express.Router();
router.use(requireAuth);

function number(value) {
  return Number(value || 0);
}

function json(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return {}; }
}

function mapLine(row) {
  return {
    ...row,
    baseSalary: number(row.baseSalary),
    allowances: number(row.allowances),
    deductions: number(row.deductions),
    advanceRecovery: number(row.advanceRecovery),
    loanRecovery: number(row.loanRecovery),
    grossPay: number(row.grossPay),
    netPreview: number(row.netPreview),
    details: json(row.details),
  };
}

router.get("/runs/:id/integrated-lines", requirePermission("payroll.view"), async (req, res) => {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT "id","runId","employeeId","employeeNumber","employeeName","currency","baseSalary","allowances","deductions","advanceRecovery","loanRecovery","grossPay","netPreview","statutoryStatus","details","createdAt","updatedAt"
         FROM "payroll_run_lines"
        WHERE "organizationId"=$1 AND "runId"=$2
        ORDER BY "employeeNumber" ASC`,
      req.auth.organizationId,
      req.params.id
    );
    return res.json({ status: "success", data: rows.map(mapLine) });
  } catch (error) {
    console.error("Integrated payroll line error:", error);
    return res.status(500).json({ status: "error", message: "Unable to load integrated payroll lines." });
  }
});

router.get("/payslips", requirePermission("payroll.view"), async (req, res) => {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT
          pl."id",pl."runId",pl."employeeId",pl."employeeNumber",pl."employeeName",pl."currency",
          pl."baseSalary",pl."allowances",pl."deductions",pl."advanceRecovery",pl."loanRecovery",pl."grossPay",pl."netPreview",
          pl."statutoryStatus",pl."details",pl."createdAt",pl."updatedAt",
          pr."status" AS "runStatus",pr."approvedAt",
          pp."code" AS "periodCode",pp."name" AS "periodName",pp."periodStart",pp."periodEnd",pp."payDate"
       FROM "payroll_run_lines" pl
       JOIN "payroll_runs" pr ON pr."id"=pl."runId" AND pr."organizationId"=pl."organizationId"
       JOIN "payroll_periods" pp ON pp."id"=pr."periodId" AND pp."organizationId"=pr."organizationId"
      WHERE pl."organizationId"=$1 AND pr."status"='APPROVED'
      ORDER BY pp."periodStart" DESC, pl."employeeNumber" ASC`,
      req.auth.organizationId
    );
    return res.json({
      status: "success",
      data: rows.map((row) => ({
        ...mapLine(row),
        periodStart: row.periodStart ? new Date(row.periodStart).toISOString().slice(0, 10) : null,
        periodEnd: row.periodEnd ? new Date(row.periodEnd).toISOString().slice(0, 10) : null,
        payDate: row.payDate ? new Date(row.payDate).toISOString().slice(0, 10) : null,
        payslipStatus: "GENERATED_FROM_APPROVED_PAYROLL",
      })),
      control: "Payslips are generated only from approved payroll runs and inherit the approved payroll calculation, including statutory deductions, salary advances and loan recoveries.",
    });
  } catch (error) {
    console.error("Payslip integration error:", error);
    return res.status(500).json({ status: "error", message: "Unable to load approved payroll payslips." });
  }
});

router.get("/statutory-catalogue", requirePermission("payroll.view"), async (req, res) => {
  try {
    const data = await getPayrollStatutoryCatalogue({
      organizationId: req.auth.organizationId,
      prismaClient: prisma,
    });
    return res.json({ status: "success", data });
  } catch (error) {
    console.error("Payroll statutory catalogue error:", error);
    return res.status(500).json({ status: "error", message: "Unable to load payroll statutory catalogue." });
  }
});

module.exports = router;
