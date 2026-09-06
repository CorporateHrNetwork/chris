const express = require("express");
const multer = require("multer");

const prisma = require("../config/prisma");
const { requireAuth, requirePermission } = require("../middleware/authMiddleware");
const loans = require("../services/loanService");
const { getLoanPolicies, validateLoanPurpose } = require("../services/loanPolicyService");
const { getLoanProfile, getBulkLoanReport } = require("../services/loanProfileService");
const { exportIndividualLoan, exportBulkLoans } = require("../services/loanReportExportService");
const {
  templateBuffer: loanBulkTemplateBuffer,
  prepareLoanWorkbook,
  importOpeningLoans,
} = require("../services/loanBulkImportService");
const {
  parseCorrectionWorkbook,
  prepareOpeningBalanceCorrections,
  applyOpeningBalanceCorrections,
} = require("../services/loanOpeningBalanceCorrectionService");

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
    const data = await getLoanPolicies({
      organizationId: req.auth.organizationId,
      prismaClient: prisma,
    });
    return res.json({ status: "success", data });
  } catch (error) {
    return sendError(res, error, "Unable to load loan policies.");
  }
});

router.get("/recoveries", requirePermission("payroll.view"), async (req, res) => {
  try {
    const data = await loans.listRecoveries({
      organizationId: req.auth.organizationId,
      loanId: req.query?.loanId || null,
    });
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
    const rows = await prepareLoanWorkbook({
      organizationId: req.auth.organizationId,
      buffer: req.file?.buffer,
    });
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
    const rows = await prepareLoanWorkbook({
      organizationId: req.auth.organizationId,
      buffer: req.file?.buffer,
    });
    const created = await importOpeningLoans({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      rows,
    });
    return res.status(201).json({
      status: "success",
      message: `${created.length} loan record(s) imported successfully.`,
      data: {
        created,
        total: created.length,
      },
    });
  } catch (error) {
    return sendError(res, error, "Unable to import loan workbook.");
  }
});

router.post("/bulk/correction/preview", requirePermission("payroll.manage"), upload.single("file"), async (req, res) => {
  try {
    const rows = await parseCorrectionWorkbook({
      organizationId: req.auth.organizationId,
      buffer: req.file?.buffer,
    });
    const plan = await prepareOpeningBalanceCorrections({
      organizationId: req.auth.organizationId,
      rows,
    });
    return res.json({ status: "success", data: correctionPreviewData(plan) });
  } catch (error) {
    return sendError(res, error, "Unable to validate the opening-balance correction workbook.");
  }
});

router.post("/bulk/correction/import", requirePermission("payroll.manage"), upload.single("file"), async (req, res) => {
  try {
    const rows = await parseCorrectionWorkbook({
      organizationId: req.auth.organizationId,
      buffer: req.file?.buffer,
    });
    const plan = await prepareOpeningBalanceCorrections({
      organizationId: req.auth.organizationId,
      rows,
    });
    const data = await applyOpeningBalanceCorrections({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      plan,
    });
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
    const data = await getLoanProfile({
      organizationId: req.auth.organizationId,
      loanId: req.params.id,
    });
    return res.json({ status: "success", data });
  } catch (error) {
    return sendError(res, error, "Unable to load loan profile.");
  }
});

router.get("/:id/export", requirePermission("payroll.view"), async (req, res) => {
  try {
    const format = exportFormat(req.query?.format);
    const profile = await getLoanProfile({
      organizationId: req.auth.organizationId,
      loanId: req.params.id,
    });
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

router.post("/", requirePermission("payroll.manage"), async (req, res) => {
  try {
    const purpose = await validateLoanPurpose({
      organizationId: req.auth.organizationId,
      purpose: req.body?.purpose,
      prismaClient: prisma,
    });
    const data = await loans.createLoan({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      input: { ...(req.body || {}), purpose },
    });
    return res.status(201).json({ status: "success", data });
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

router.post("/:id/top-up", requirePermission("payroll.manage"), async (req, res) => {
  try {
    const purpose = await validateLoanPurpose({
      organizationId: req.auth.organizationId,
      purpose: req.body?.purpose,
      prismaClient: prisma,
    });
    const data = await loans.createTopUp({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      loanId: req.params.id,
      input: { ...(req.body || {}), purpose },
    });
    return res.status(201).json({ status: "success", data });
  } catch (error) {
    return sendError(res, error, "Unable to create top-up loan application.");
  }
});

module.exports = router;