const express = require("express");
const prisma = require("../config/prisma");
const { requireAuth, requirePermission } = require("../middleware/authMiddleware");
const { getPayrollStatutoryCatalogue } = require("../services/payrollStatutoryCatalogueService");
const { sendApprovedPayslipEmail } = require("../services/payrollPayslipEmailService");

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
  const details = json(row.details);
  const storedAttendance = details.attendance || {};
  const liveWorkedDays = row.liveWorkedDays == null ? null : number(row.liveWorkedDays);
  const standardDays = number(storedAttendance.standardDays || 0);
  const authoritativeAttendance = liveWorkedDays == null ? storedAttendance : {
    ...storedAttendance,
    payableDays: liveWorkedDays,
    workedDays: liveWorkedDays,
    expectedDays: standardDays,
    workedHours: row.liveWorkedHours == null ? null : number(row.liveWorkedHours),
    source: "ATTENDANCE_PAYROLL_INPUT",
    notes: row.liveAttendanceNotes || null,
  };
  return {
    ...row,
    baseSalary: number(row.baseSalary),
    allowances: number(row.allowances),
    deductions: number(row.deductions),
    advanceRecovery: number(row.advanceRecovery),
    loanRecovery: number(row.loanRecovery),
    grossPay: number(row.grossPay),
    netPreview: number(row.netPreview),
    locationId: row.locationId || null,
    locationCode: row.locationCode || null,
    locationName: row.locationName || null,
    periodStart: row.periodStart ? new Date(row.periodStart).toISOString().slice(0, 10) : null,
    periodEnd: row.periodEnd ? new Date(row.periodEnd).toISOString().slice(0, 10) : null,
    payDate: row.payDate ? new Date(row.payDate).toISOString().slice(0, 10) : null,
    details: {
      ...details,
      location: {
        id: row.locationId || null,
        code: row.locationCode || null,
        name: row.locationName || null,
      },
      attendance: authoritativeAttendance,
      attendanceRecalculationRequired:
        liveWorkedDays != null && number(storedAttendance.payableDays) !== liveWorkedDays,
    },
  };
}

router.get("/runs/:id/integrated-lines", requirePermission("payroll.view"), async (req, res) => {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT pl."id",pl."runId",pl."employeeId",pl."employeeNumber",pl."employeeName",pl."currency",
              pl."baseSalary",pl."allowances",pl."deductions",pl."advanceRecovery",pl."loanRecovery",
              pl."grossPay",pl."netPreview",pl."statutoryStatus",pl."details",pl."createdAt",pl."updatedAt",
              e."locationId",e."email" AS "employeeEmail",loc."code" AS "locationCode",loc."name" AS "locationName",
              pr."status" AS "runStatus",pr."approvedAt",
              pp."code" AS "periodCode",pp."name" AS "periodName",pp."periodStart",pp."periodEnd",pp."payDate",
              api."workedDays" AS "liveWorkedDays",api."workedHours" AS "liveWorkedHours",api."notes" AS "liveAttendanceNotes"
         FROM "payroll_run_lines" pl
         JOIN "payroll_runs" pr ON pr."id"=pl."runId" AND pr."organizationId"=pl."organizationId"
         JOIN "payroll_periods" pp ON pp."id"=pr."periodId" AND pp."organizationId"=pr."organizationId"
         JOIN "employees" e ON e."id"=pl."employeeId" AND e."organizationId"=pl."organizationId"
         LEFT JOIN "organization_locations" loc ON loc."id"=e."locationId" AND loc."organizationId"=e."organizationId"
         LEFT JOIN "attendance_payroll_inputs" api
           ON api."organizationId"=pl."organizationId" AND api."employeeId"=pl."employeeId"
          AND api."periodStart"=pp."periodStart" AND api."periodEnd"=pp."periodEnd"
        WHERE pl."organizationId"=$1 AND pl."runId"=$2
        ORDER BY pl."employeeNumber" ASC`,
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
          pp."code" AS "periodCode",pp."name" AS "periodName",pp."periodStart",pp."periodEnd",pp."payDate",
          e."email" AS "employeeEmail"
       FROM "payroll_run_lines" pl
       JOIN "payroll_runs" pr ON pr."id"=pl."runId" AND pr."organizationId"=pl."organizationId"
       JOIN "payroll_periods" pp ON pp."id"=pr."periodId" AND pp."organizationId"=pr."organizationId"
       JOIN "employees" e ON e."id"=pl."employeeId" AND e."organizationId"=pl."organizationId"
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


router.post("/payslips/:id/email", requirePermission("payroll.manage"), async (req, res) => {
  try {
    const data = await sendApprovedPayslipEmail({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      payrollRunLineId: req.params.id,
      prismaClient: prisma,
    });
    return res.json({
      status: "success",
      message: data.status === "SENT"
        ? `Payslip emailed to ${data.email}.`
        : "Payslip is approved and ready to email, but a payroll email delivery provider is not configured.",
      data,
    });
  } catch (error) {
    if (error?.code) {
      return res.status(error.statusCode || 400).json({
        status: "error",
        code: error.code,
        message: error.message,
        details: error.details || null,
      });
    }
    console.error("Payslip email error:", error);
    return res.status(500).json({ status: "error", message: "Unable to email the approved payslip." });
  }
});

router.post("/payslips/email-batch", requirePermission("payroll.manage"), async (req, res) => {
  try {
    const lineIds = [...new Set((Array.isArray(req.body?.lineIds) ? req.body.lineIds : []).map((value) => String(value || "").trim()).filter(Boolean))];
    if (!lineIds.length) {
      return res.status(400).json({ status: "error", code: "PAYSLIP_EMAIL_SELECTION_REQUIRED", message: "Select at least one approved payslip to email." });
    }
    if (lineIds.length > 200) {
      return res.status(400).json({ status: "error", code: "PAYSLIP_EMAIL_BATCH_TOO_LARGE", message: "Email at most 200 payslips in one batch." });
    }

    const results = [];
    for (const payrollRunLineId of lineIds) {
      try {
        const result = await sendApprovedPayslipEmail({
          organizationId: req.auth.organizationId,
          actorUserId: req.auth.userId,
          payrollRunLineId,
          prismaClient: prisma,
        });
        results.push({ success: result.status === "SENT", ...result });
      } catch (error) {
        results.push({
          success: false,
          payrollRunLineId,
          code: error?.code || "PAYSLIP_EMAIL_FAILED",
          message: error?.message || "Unable to email payslip.",
        });
      }
    }

    const sent = results.filter((item) => item.success).length;
    const pendingConfiguration = results.filter((item) => item.status === "PENDING_CONFIGURATION").length;
    return res.status(results.some((item) => !item.success) ? 207 : 200).json({
      status: "success",
      message: `${sent} payslip(s) emailed. ${results.length - sent} not sent.`,
      data: {
        total: results.length,
        sent,
        notSent: results.length - sent,
        pendingConfiguration,
        results,
      },
    });
  } catch (error) {
    console.error("Batch payslip email error:", error);
    return res.status(500).json({ status: "error", message: "Unable to email selected payslips." });
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
