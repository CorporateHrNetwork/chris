"use strict";
// Protected read-only previews and explicit draft import staging; no payroll mutation.
const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");
const { requireAuth, requirePermission } = require("../middleware/authMiddleware");
const { previewHistoricalWorkbook } = require("../services/consolidatedStatutoryHistoricalImportService");
const { readApprovedPayrollRecords } = require("../services/consolidatedStatutoryApprovedPayrollService");
const { buildConsolidatedReport } = require("../services/consolidatedStatutoryReportService");
const { buildStatutoryWorkbook } = require("../services/consolidatedStatutoryWorkbookService");
const { stageHistoricalImport, listHistoricalImports } = require("../services/consolidatedStatutoryImportBatchService");

const router = express.Router();
router.use(requireAuth);
router.use(requirePermission("reports.view", "reports.export"));
const upload = multer({ storage:multer.memoryStorage(), limits:{ fileSize: 5 * 1024 * 1024, files:1 } });
function yearFrom(req) {
  const year = Number(req.query.year || req.body?.year || new Date().getUTCFullYear());
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    const error = new Error("Select a valid reporting year.");
    error.statusCode = 400; error.code = "INVALID_REPORT_YEAR"; throw error;
  }
  return year;
}
function assertCompanyWideAccess(req) {
  if (req.auth?.locationScope !== "ALL_LOCATIONS" || !req.auth?.consolidatedOrganization || req.auth?.activeLocationId) {
    const error = new Error("Full organization reporting access is required for company-wide statutory consolidation.");
    error.statusCode = 403; error.code = "CONSOLIDATED_REPORT_SCOPE_FORBIDDEN"; throw error;
  }
}
function fail(res,error) {
  return res.status(error.statusCode || 500).json({
    status:"error", code:error.code || "CONSOLIDATED_STATUTORY_PREVIEW_FAILED",
    message:error.statusCode ? error.message : "Unable to prepare statutory report preview."
  });
}
// This endpoint intentionally displays only APPROVED payroll source data until
// a durable, audited historical import/reconciliation workflow is implemented.
router.get("/approved-preview", async (req,res) => {
  try {
    assertCompanyWideAccess(req);
    const year = yearFrom(req);
    const records = await readApprovedPayrollRecords({ organizationId:req.auth.organizationId, year });
    const report = buildConsolidatedReport({ organizationId:req.auth.organizationId, year, records });
    return res.status(200).json({ status:"success", previewOnly:true, historicalIncluded:false,
      warning:"Historical January-September records are NOT included in this preview.",
      data:{ year, totals:report.totals, branchTotals:report.branchTotals, exceptions:report.exceptions, approvedPayrollLines:report.rows.length } });
  } catch (error) { return fail(res,error); }
});
// Upload-based preview; no mutation and no identity auto-merge.
router.post("/historical/preview", upload.single("workbook"), async (req,res) => {
  try {
    assertCompanyWideAccess(req);
    if (!req.file?.buffer) return res.status(400).json({status:"error",code:"WORKBOOK_REQUIRED",message:"Attach the historical Excel workbook."});
    const year = yearFrom(req);
    const imported = previewHistoricalWorkbook({ buffer:req.file.buffer, organizationId:req.auth.organizationId, year });
    const report = buildConsolidatedReport({ organizationId:req.auth.organizationId, year, records:imported.records });
    return res.status(200).json({ status:"success", previewOnly:true, persisted:false,
      warning:"Historical data has not been saved. Employee identity/branch reconciliation is required before production use.",
      data:{ year, diagnostics:imported.diagnostics, sourceHash:imported.workbookHash,
        importedRows:imported.records.length, exceptions:[...imported.exceptions,...report.exceptions],
        totals:report.totals, branchTotals:report.branchTotals } });
  } catch (error) { return fail(res,error); }
});
// Explicit historical import staging. This never posts amounts to official payroll.
router.post("/historical/stage", requirePermission("payroll.manage"), upload.single("workbook"), async (req,res) => {
  try {
    assertCompanyWideAccess(req);
    if (!req.file?.buffer) return res.status(400).json({status:"error",code:"WORKBOOK_REQUIRED",message:"Attach the historical Excel workbook."});
    const year = yearFrom(req);
    const staged = await stageHistoricalImport({ organizationId:req.auth.organizationId,
      actorUserId:req.auth.userId, year, buffer:req.file.buffer, originalFilename:req.file.originalname });
    res.setHeader("Cache-Control","no-store");
    return res.status(201).json({ status:"success", data:staged,
      warning:"Draft source stored for review only. No employee matching, statutory remittance or payroll changes performed." });
  } catch (error) { return fail(res,error); }
});
router.get("/historical/batches", requirePermission("payroll.manage"), async (req,res) => {
  try { assertCompanyWideAccess(req); const year=yearFrom(req);
    const batches = await listHistoricalImports({ organizationId:req.auth.organizationId, year });
    res.setHeader("Cache-Control","no-store");
    return res.json({status:"success",data:batches});
  } catch (error) { return fail(res,error); }
});
// Convenient read-only Excel preview with both sources, still without any
// historical persistence or unverified branch assignment.
router.post("/combined-preview.xlsx", upload.single("workbook"), async (req,res) => {
  try {
    assertCompanyWideAccess(req);
    if (!req.file?.buffer) return res.status(400).json({status:"error",code:"WORKBOOK_REQUIRED",message:"Attach the historical Excel workbook."});
    const year = yearFrom(req);
    const historic = previewHistoricalWorkbook({ buffer:req.file.buffer, organizationId:req.auth.organizationId, year });
    const approved = await readApprovedPayrollRecords({ organizationId:req.auth.organizationId, year });
    const report = buildConsolidatedReport({ organizationId:req.auth.organizationId, year, records:[...historic.records,...approved] });
    report.exceptions.push(...historic.exceptions);
    report.exceptions.push({code:"PREVIEW_ONLY_UNRECONCILED", message:"Do not use for remittance certification; historical employee and branch reconciliation pending."});
    const book = buildStatutoryWorkbook(report);
    const buffer = XLSX.write(book,{type:"buffer",bookType:"xlsx"});
    res.setHeader("Content-Type","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition",`attachment; filename="CHRiS_Statutory_${year}_UNRECONCILED_PREVIEW.xlsx"`);
    res.setHeader("Cache-Control","no-store");
    return res.status(200).send(buffer);
  } catch (error) { return fail(res,error); }
});
module.exports = router;
