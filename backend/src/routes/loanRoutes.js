const express = require("express");
const multer = require("multer");

const prisma = require("../config/prisma");
const { requireAuth, requirePermission } = require("../middleware/authMiddleware");
const loans = require("../services/loanService");
const { getLoanPolicies, validateLoanPurpose } = require("../services/loanPolicyService");
const { getLoanProfile, reactivatePausedLegacyInstallment, getBulkLoanReport } = require("../services/loanProfileService");
const { exportIndividualLoan, exportBulkLoans } = require("../services/loanReportExportService");
const { assessLoanCollateral } = require("../services/eosbService");
const {
  templateBuffer: loanBulkTemplateBuffer,
  prepareLoanWorkbook,
  importOpeningLoans,
} = require("../services/loanBulkImportService");
const {
  parseCorrectionWorkbook,
  applyOpeningBalanceCorrections,
} = require("../services/loanOpeningBalanceCorrectionService");
const {
  prepareOpeningBalanceCorrections,
} = require("../services/loanOpeningBalanceReconciliationService");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(req, file, callback) {
    const name = String(file.originalname || "").toLowerCase();
    if (!name.endsWith(".xlsx") && !name.endsWith(".xls")) {
      return callback(new Error("Upload an Excel .xlsx or .xls file."));
    }
    callback(null, true);
  },
});
router.use(requireAuth);

function sendError(res, error, fallback = "Loan operation failed.") {
  if (error?.code) {
    return res.status(error.statusCode || 400).json({
      status: "error",
      code: error.code,
      message: error.message || fallback,
      details: error.details,
    });
  }
  console.error("Loan operation error:", error);
  return res.status(500).json({ status: "error", message: error?.message || fallback });
}

async function recordCollateral({ organizationId, actorUserId, loanId, assessment, reason }) {
  await prisma.organizationAudit.create({
    data: {
      organizationId,
      actorUserId: actorUserId || null,
      entityType: "LoanCollateral",
      entityId: loanId,
      action: "LOAN_COLLATERAL_ASSESSED",
      newValue: { ...assessment, assessedAt: new Date().toISOString() },
      reason,
    },
  });
}

function exportFormat(value) {
  const format = String(value || "").trim().toLowerCase();
  if (!["xlsx", "csv", "pdf"].includes(format)) {
    const error = new Error("Export format must be xlsx, csv or pdf.");
    error.code = "INVALID_LOAN_EXPORT_FORMAT";
    error.statusCode = 400;
    throw error;
  }
  return format;
}

function sendExport(res, file) {
  res.setHeader("Content-Type", file.contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${file.fileName}"`);
  res.setHeader("Cache-Control", "no-store");
  return res.send(file.buffer);
}

function correctionPreviewData(plan) {
  return {
    rows: plan,
    totalRows: plan.length,
    correctionRows: plan.filter((row) => row.action === "CORRECT").length,
    unchangedRows: plan.filter((row) => row.action === "NO_CHANGE").length,
    blockedRows: plan.filter((row) => row.action === "BLOCKED").length,
    validRows: plan.filter((row) => row.valid).length,
    invalidRows: plan.filter((row) => !row.valid).length,
    warningRows: plan.filter((row) => row.warnings?.length).length,
    legacyIdentityMatches: plan.filter((row) => row.matchMethod === "EXACT_LEGACY_IDENTITY").length,
    importAllowed: plan.length > 0 && plan.every((row) => row.valid),
  };
}

router.get("/summary", requirePermission("payroll.view"), async (req, res) => {
  try {
    const data = await loans.getLoanSummary({ organizationId: req.auth.organizationId });
    return res.json({ status: "success", data });
  } catch (error) {
    return sendError(res, error, "Unable to load loan summary.");
  }
});

router.get("/policies", requirePermission("payroll.view"), async (req, res) => {
  try {
    const data = await getLoanPolicies({ organizationId: req.auth.organizationId, prismaClient: prisma });
    return res.json({ status: "success", data });
  } catch (error) {
    return sendError(res, error, "Unable to load loan policies.");
  }
});

router.get("/recoveries", requirePermission("payroll.view"), async (req, res) => {
  try {
    const data = await loans.listRecoveries({ organizationId: req.auth.organizationId, loanId: req.query?.loanId || null });
    return res.json({ status: "success", data });
  } catch (error) {
    return sendError(res, error, "Unable to load loan recoveries.");
  }
});

router.get("/bulk/template", requirePermission("payroll.manage"), async (req, res) => {
  res.setHeader("Content-Disposition", 'attachment; filename="CHRiS_ZERMATT_Loan_Bulk_Upload_Template.xlsx"');
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  return res.send(loanBulkTemplateBuffer());
});

router.post("/bulk/preview", requirePermission("payroll.manage"), upload.single("file"), async (req, res) => {
  try {
    const rows = await prepareLoanWorkbook({ organizationId: req.auth.organizationId, buffer: req.file?.buffer });
    return res.json({
      status: "success",
      data: {
        rows,
        totalRows: rows.length,
        validRows: rows.filter((row) => row.valid).length,
        invalidRows: rows.filter((row) => !row.valid).length,
        warningRows: rows.filter((row) => row.warnings?.length).length,
        importAllowed: rows.length > 0 && rows.every((row) => row.valid),
      },
    });
  } catch (error) {
    return sendError(res, error, "Unable to validate loan workbook.");
  }
});

router.post("/bulk/import", requirePermission("payroll.manage"), upload.single("file"), async (req, res) => {
  try {
    const rows = await prepareLoanWorkbook({ organizationId: req.auth.organizationId, buffer: req.file?.buffer });
    const created = await importOpeningLoans({ organizationId: req.auth.organizationId, actorUserId: req.auth.userId, rows });
    return res.status(201).json({
      status: "success",
      message: `${created.length} loan record(s) imported successfully.`,
      data: { created, total: created.length },
    });
  } catch (error) {
    return sendError(res, error, "Unable to import loan workbook.");
  }
});

router.post("/bulk/correction/preview", requirePermission("payroll.manage"), upload.single("file"), async (req, res) => {
  try {
    const rows = await parseCorrectionWorkbook({ organizationId: req.auth.organizationId, buffer: req.file?.buffer });
    const plan = await prepareOpeningBalanceCorrections({ organizationId: req.auth.organizationId, rows });
    return res.json({ status: "success", data: correctionPreviewData(plan) });
  } catch (error) {
    return sendError(res, error, "Unable to validate the opening-balance correction workbook.");
  }
});

router.post("/bulk/correction/import", requirePermission("payroll.manage"), upload.single("file"), async (req, res) => {
  try {
    const rows = await parseCorrectionWorkbook({ organizationId: req.auth.organizationId, buffer: req.file?.buffer });
    const plan = await prepareOpeningBalanceCorrections({ organizationId: req.auth.organizationId, rows });
    const data = await applyOpeningBalanceCorrections({ organizationId: req.auth.organizationId, actorUserId: req.auth.userId, plan });
    return res.json({
      status: "success",
      message: `${data.corrected} opening loan balance correction(s) applied; ${data.unchanged} row(s) already matched.`,
      data,
    });
  } catch (error) {
    return sendError(res, error, "Unable to apply opening loan balance corrections.");
  }
});

router.get("/reports/export", requirePermission("payroll.view"), async (req, res) => {
  try {
    const format = exportFormat(req.query?.format);
    const rows = await getBulkLoanReport({ organizationId: req.auth.organizationId });
    return sendExport(res, exportBulkLoans(rows, format));
  } catch (error) {
    return sendError(res, error, "Unable to export bulk loan report.");
  }
});

router.get("/:id/profile", requirePermission("payroll.view"), async (req, res) => {
  try {
    const data = await getLoanProfile({ organizationId: req.auth.organizationId, loanId: req.params.id });
    return res.json({ status: "success", data });
  } catch (error) {
    return sendError(res, error, "Unable to load loan profile.");
  }
});


router.post("/:id/amortization/reactivate", requirePermission("payroll.manage"), async (req, res) => {
  try {
    const data = await reactivatePausedLegacyInstallment({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      loanId: req.params.id,
      periodStart: req.body?.periodStart,
      reason: req.body?.reason,
    });
    return res.json({
      status: "success",
      message: "Paused loan installment reactivated for payroll recovery.",
      data,
    });
  } catch (error) {
    return sendError(res, error, "Unable to reactivate paused loan installment.");
  }
});

router.get("/:id/export", requirePermission("payroll.view"), async (req, res) => {
  try {
    const format = exportFormat(req.query?.format);
    const profile = await getLoanProfile({ organizationId: req.auth.organizationId, loanId: req.params.id });
    return sendExport(res, exportIndividualLoan(profile, format));
  } catch (error) {
    return sendError(res, error, "Unable to export loan profile.");
  }
});

router.get("/", requirePermission("payroll.view"), async (req, res) => {
  try {
    const data = await loans.listLoans({
      organizationId: req.auth.organizationId,
      status: req.query?.status || null,
      employeeNumber: req.query?.employeeNumber || null,
    });
    return res.json({ status: "success", data });
  } catch (error) {
    return sendError(res, error, "Unable to load loans.");
  }
});

// Northstar records a simulated approval and disbursement in the loan ledger.
router.post("/demo-record", requirePermission("payroll.manage"), async (req, res) => {
  const { organizationId, userId: actorUserId, activeLocationId, organization } = req.auth;
  if (organizationId !== "chris-demo-org-20261022" || organization?.slug !== "chris-demo-company") {
    return res.status(403).json({ status: "error", message: "Loan recording here is available to Northstar Demo Industries." });
  }

  const { principalAmount, installmentAmount, recoveryMonth } = req.body || {};
  const employeeNumber = String(req.body?.employeeNumber || "").trim().toUpperCase();
  const purpose = String(req.body?.purpose || "").trim().slice(0, 160);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  if (!purpose || !/^\d{4}-(0[1-9]|1[0-2])$/.test(recoveryMonth) || recoveryMonth < today.slice(0, 7)) {
    return res.status(400).json({ status: "error", message: "Enter a loan purpose and a recovery month from the current month onward." });
  }

  try {
    const data = await prisma.$transaction(async (tx) => {
      const employee = await tx.employee.findFirst({
        where: { organizationId, employeeNumber, status: { in: ["ACTIVE", "PROBATION"] },
          ...(activeLocationId ? { locationId: activeLocationId } : {}) },
        select: { id: true },
      });
      if (!employee) {
        const error = new Error("Choose an active fictional employee in your branch scope.");
        error.code = "DEMO_LOAN_EMPLOYEE_NOT_FOUND";
        error.statusCode = 404;
        throw error;
      }

      const context = { organizationId, actorUserId, prismaClient: tx };
      const notes = "Fictional Northstar demo loan recorded for payroll recovery.";
      const created = await loans.createLoan({
        ...context, input: { employeeNumber, principalAmount, installmentAmount, purpose, notes, parentLoanId: req.body?.parentLoanId, applicationDate: today },
      });
      await loans.decideLoan({ ...context, loanId: created.id, decision: "APPROVE", notes });
      const recoveryStartDate = recoveryMonth === today.slice(0, 7) ? today : recoveryMonth + "-01";
      return loans.disburseLoan({ ...context, loanId: created.id, input: { disbursedDate: today, recoveryStartDate, notes } });
    });
    return res.status(201).json({ status: "success", data });
  } catch (error) {
    return sendError(res, error, "Unable to record the demo loan.");
  }
});

router.post("/:id/demo-action", requirePermission("payroll.manage"), async (req, res) => {
  const { organizationId, userId: actorUserId, activeLocationId, organization } = req.auth;
  if (organizationId !== "chris-demo-org-20261022" || organization?.slug !== "chris-demo-company") {
    return res.status(403).json({ status: "error", message: "These actions are available to Northstar Demo Industries." });
  }
  const loanId = req.params.id;
  const { action, installmentAmount, purpose, reason } = req.body || {};
  try {
    const [current] = await prisma.$queryRawUnsafe(
      `SELECT l."id" FROM "payroll_loans" l
        JOIN "employees" e ON e."organizationId" = l."organizationId" AND e."id" = l."employeeId"
        WHERE l."organizationId" = $1 AND l."id" = $2 AND ($3::text IS NULL OR e."locationId" = $3)`,
      organizationId, loanId, activeLocationId || null
    );
    if (!current) return res.status(404).json({ status: "error", message: "Loan not found in your branch scope." });

    if (["PAUSE", "RESUME", "COMPLETE_EXTERNAL"].includes(action)) {
      const data = await loans.updateLoanStatus({ organizationId, actorUserId, loanId, action, reason });
      return res.json({ status: "success", data });
    }

    const amount = Math.round(Number(installmentAmount) * 100) / 100;
    const label = String(purpose || "").trim().slice(0, 160);
    if (action !== "EDIT" || !label || !Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ status: "error", message: "Enter a purpose and a positive monthly installment." });
    }

    const data = await prisma.$transaction(async (tx) => {
      const [updated] = await tx.$queryRawUnsafe(
        `UPDATE "payroll_loans" SET "purpose" = $3, "installmentAmount" = $4, "updatedAt" = CURRENT_TIMESTAMP
         WHERE "organizationId" = $1 AND "id" = $2 AND "status" IN ('ACTIVE', 'PAUSED')
         AND "outstandingAmount" >= $4 RETURNING "id", "purpose", "installmentAmount"`,
        organizationId, loanId, label, amount
      );
      if (!updated) return null;
      await tx.organizationAudit.create({ data: {
        organizationId, actorUserId, entityType: "PayrollLoan", entityId: loanId,
        action: "DEMO_LOAN_TERMS_EDITED", newValue: { purpose: label, installmentAmount: amount },
      } });
      return updated;
    });
    if (!data) return res.status(409).json({ status: "error", message: "Only active or paused loans can be edited. Installment cannot exceed the outstanding balance." });
    return res.json({ status: "success", data });
  } catch (error) {
    return sendError(res, error, "Unable to update the demo loan.");
  }
});

// Compatibility create remains available to payroll administrators, but new
// Zermatt loan grants cannot bypass EoSB/surety collateral policy.
router.post("/", requirePermission("payroll.manage"), async (req, res) => {
  try {
    const purpose = await validateLoanPurpose({ organizationId: req.auth.organizationId, purpose: req.body?.purpose, prismaClient: prisma });
    const assessment = await assessLoanCollateral({
      organizationId: req.auth.organizationId,
      employeeNumber: req.body?.employeeNumber,
      requestedAmount: req.body?.principalAmount,
      suretyEmployeeNumber: req.body?.suretyEmployeeNumber,
      prismaClient: prisma,
    });
    const data = await loans.createLoan({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      input: { ...(req.body || {}), purpose },
    });
    await recordCollateral({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      loanId: data.id,
      assessment,
      reason: assessment.mode === "EOSB" ? "EoSB collateral validated for compatibility loan creation" : "Internal surety validated for compatibility loan creation",
    });
    return res.status(201).json({ status: "success", data: { ...data, collateral: assessment } });
  } catch (error) {
    return sendError(res, error, "Unable to create loan application.");
  }
});

router.patch("/:id/decision", requirePermission("payroll.manage"), async (req, res) => {
  try {
    const data = await loans.decideLoan({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      loanId: req.params.id,
      decision: req.body?.decision,
      notes: req.body?.notes,
    });
    return res.json({ status: "success", data });
  } catch (error) {
    return sendError(res, error, "Unable to decide loan application.");
  }
});

router.patch("/:id/disburse", requirePermission("payroll.manage"), async (req, res) => {
  try {
    const data = await loans.disburseLoan({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      loanId: req.params.id,
      input: req.body || {},
    });
    return res.json({ status: "success", data });
  } catch (error) {
    return sendError(res, error, "Unable to activate approved loan for recovery.");
  }
});

router.patch("/:id/status", requirePermission("payroll.manage"), async (req, res) => {
  try {
    const data = await loans.updateLoanStatus({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      loanId: req.params.id,
      action: req.body?.action,
      reason: req.body?.reason,
    });
    return res.json({ status: "success", data });
  } catch (error) {
    return sendError(res, error, "Unable to update loan status.");
  }
});

// A top-up is additional exposure: the parent loan remains live, so the requested
// top-up must fit inside the EoSB collateral remaining after the parent/other loans.
router.post("/:id/top-up", requirePermission("payroll.manage"), async (req, res) => {
  try {
    const parentRows = await prisma.$queryRawUnsafe(
      `SELECT e."employeeNumber"
         FROM "payroll_loans" l
         JOIN "employees" e ON e."id"=l."employeeId" AND e."organizationId"=l."organizationId"
        WHERE l."organizationId"=$1 AND l."id"=$2 LIMIT 1`,
      req.auth.organizationId,
      req.params.id
    );
    if (!parentRows[0]) {
      const error = new Error("Parent loan not found.");
      error.code = "LOAN_NOT_FOUND";
      error.statusCode = 404;
      throw error;
    }
    const purpose = await validateLoanPurpose({ organizationId: req.auth.organizationId, purpose: req.body?.purpose, prismaClient: prisma });
    const assessment = await assessLoanCollateral({
      organizationId: req.auth.organizationId,
      employeeNumber: parentRows[0].employeeNumber,
      requestedAmount: req.body?.principalAmount,
      suretyEmployeeNumber: req.body?.suretyEmployeeNumber,
      prismaClient: prisma,
    });
    const data = await loans.createTopUp({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      loanId: req.params.id,
      input: { ...(req.body || {}), purpose },
    });
    await recordCollateral({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      loanId: data.id,
      assessment,
      reason: assessment.mode === "EOSB" ? "Top-up validated against remaining EoSB collateral" : "Top-up internal surety validated",
    });
    return res.status(201).json({ status: "success", data: { ...data, collateral: assessment } });
  } catch (error) {
    return sendError(res, error, "Unable to create top-up loan application.");
  }
});

module.exports = router;
