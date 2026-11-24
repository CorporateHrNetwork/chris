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
const { reviewSummary, approveSourceMatch, verifyHistoricalBatch, verifiedHistoricalRecords } = require("../services/consolidatedStatutoryReconciliationService");
const { proposeCandidates } = require("../services/consolidatedStatutoryMatchCandidatesService");
const { assessHistoricalBatch } = require("../services/consolidatedStatutoryBulkMatchService");

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
// One read-only assessment categorizes all historic records for HR review.
router.get("/historical/batches/:batchId/review-assessment", requirePermission("payroll.manage"), async (req,res) => {
  try {
    assertCompanyWideAccess(req);
    const assessment=await assessHistoricalBatch({organizationId:req.auth.organizationId,batchId:req.params.batchId});
    res.setHeader("Cache-Control","no-store");
    return res.json({status:"success",data:assessment});
  } catch(error) { return fail(res,error); }
});
// Approved reviewers can search authoritative employee identities and branch locations.
router.get("/historical/match-options", requirePermission("payroll.manage"), async (req,res) => {
  try {
    assertCompanyWideAccess(req);
    const prisma=require("../config/prisma");
    const search=String(req.query.search||"").trim().slice(0,70);
    if(search.length<2) return res.status(400).json({status:"error",code:"MATCH_SEARCH_TOO_SHORT",message:"Enter at least two characters to search employees."});
    const [employees,locations]=await Promise.all([
      prisma.employee.findMany({where:{organizationId:req.auth.organizationId,
        OR:[{employeeNumber:{contains:search,mode:"insensitive"}},{firstName:{contains:search,mode:"insensitive"}},
          {lastName:{contains:search,mode:"insensitive"}},{middleName:{contains:search,mode:"insensitive"}}]},
        select:{id:true,employeeNumber:true,firstName:true,middleName:true,lastName:true,locationId:true},
        take:25,orderBy:{employeeNumber:"asc"}}),
      prisma.organizationLocation.findMany({where:{organizationId:req.auth.organizationId},
        select:{id:true,name:true,code:true},orderBy:{name:"asc"}})
    ]);
    res.setHeader("Cache-Control","no-store");
    return res.json({status:"success",data:{
      employees:employees.map(x=>({id:x.id,employeeNumber:x.employeeNumber,
        name:[x.firstName,x.middleName,x.lastName].filter(Boolean).join(" "),currentLocationId:x.locationId})),
      locations:locations.filter(x=>[x.name,x.code].some(v=>/^(abuja|abj|lagos|lgs|portharcourt|phc)(branch|office)?$/.test(
        String(v||"").toLowerCase().replace(/[^a-z]/g,"")))),
      note:"Current location is informational only; verify the historical branch for the source period."
    }});
  } catch(error) { return fail(res,error); }
});
// Explicitly reviewed historical identity and branch mappings, isolated by tenant.
router.get("/historical/batches/:batchId/candidates", requirePermission("payroll.manage"), async (req,res) => {
  try {
    assertCompanyWideAccess(req);
    const data=await proposeCandidates({organizationId:req.auth.organizationId,
      batchId:req.params.batchId,sourceId:String(req.query.sourceId||"")});
    res.setHeader("Cache-Control","no-store");
    return res.json({status:"success",data});
  } catch(error) { return fail(res,error); }
});
router.get("/historical/batches/:batchId/reconciliation", requirePermission("payroll.manage"), async (req,res) => {
  try {
    assertCompanyWideAccess(req);
    const data=await reviewSummary({organizationId:req.auth.organizationId,batchId:req.params.batchId});
    res.setHeader("Cache-Control","no-store");
    return res.json({status:"success",data});
  } catch(error) { return fail(res,error); }
});
router.post("/historical/batches/:batchId/matches", requirePermission("payroll.manage"), async (req,res) => {
  try {
    assertCompanyWideAccess(req);
    const {sourceId,employeeId,locationId,reviewNote}=req.body||{};
    const data=await approveSourceMatch({organizationId:req.auth.organizationId,batchId:req.params.batchId,
      sourceId,employeeId,locationId,reviewNote,actorUserId:req.auth.userId});
    res.setHeader("Cache-Control","no-store");
    return res.json({status:"success",data});
  } catch(error) { return fail(res,error); }
});
router.post("/historical/batches/:batchId/verify", requirePermission("payroll.manage"), async (req,res) => {
  try {
    assertCompanyWideAccess(req);
    const data=await verifyHistoricalBatch({organizationId:req.auth.organizationId,batchId:req.params.batchId,
      actorUserId:req.auth.userId});
    res.setHeader("Cache-Control","no-store");
    return res.json({status:"success",data});
  } catch(error) { return fail(res,error); }
});
async function readReviewedReport(req) {
  const year=yearFrom(req);
  const organizationId=req.auth.organizationId;
  const historical=await verifiedHistoricalRecords({organizationId,year});
  const approved=await readApprovedPayrollRecords({organizationId,year});
  // Zermatt's legacy source covers Jan-Sep 2026. Prevent historical/approved
  // sources in that window from being counted twice in the verified report.
  const cutover=(req.auth.organization?.slug==="zermatt-liquor-limited" && year===2026) ? "2026-10" : null;
  const nonOverlapping=cutover ? approved.filter(x=>x.period>=cutover) : approved;
  const report=buildConsolidatedReport({organizationId,year,records:[...historical,...nonOverlapping]});
  report.sourceCoverage={verifiedHistoricalRows:historical.length,approvedPayrollRows:nonOverlapping.length};
  if(cutover && historical.length===0) report.exceptions.push({code:"HISTORICAL_SOURCE_NOT_VERIFIED",message:"January–September 2026 historical records are not verified; annual totals are incomplete."});
  if(nonOverlapping.length===0) report.exceptions.push({code:"NO_APPROVED_PAYROLL_RECORDS",message:"No approved payroll records found in the selected reporting period."});
  return report;
}
router.get("/verified-preview", async (req,res) => {
  try {
    assertCompanyWideAccess(req);
    const report=await readReviewedReport(req);
    res.setHeader("Cache-Control","no-store");
    return res.json({status:"success",data:{year:report.year,totals:report.totals,
      branchTotals:report.branchTotals,exceptions:report.exceptions,
      rows:report.rows.length,sourceCoverage:report.sourceCoverage,unresolvedBranchRows:report.unresolved.length,
      note:"Only verified historical imports plus approved payroll snapshots are included."}});
  } catch(error) { return fail(res,error); }
});
router.get("/verified-export.xlsx", async (req,res) => {
  try {
    assertCompanyWideAccess(req);
    const report=await readReviewedReport(req);
    const workbook=buildStatutoryWorkbook(report);
    const buffer=XLSX.write(workbook,{type:"buffer",bookType:"xlsx"});
    res.setHeader("Content-Type","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition",`attachment; filename="CHRiS_Statutory_${report.year}_VERIFIED_SOURCES.xlsx"`);
    res.setHeader("Cache-Control","no-store");
    return res.status(200).send(buffer);
  } catch(error) { return fail(res,error); }
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
