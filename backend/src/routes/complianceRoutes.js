const express = require("express");
const XLSX = require("xlsx");
const prisma = require("../config/prisma");
const { requireAuth, requireAnyPermission } = require("../middleware/authMiddleware");
const rules = require("../services/complianceRulesEngine");
const remittances = require("../services/statutoryRemittanceService");

const router = express.Router();
router.use(requireAuth);
router.use((req, res, next) => {
  if (req.auth.activeLocationId) {
    return res.status(403).json({
      status: "error",
      code: "CONSOLIDATED_COMPLIANCE_SCOPE_REQUIRED",
      message: "Compliance rules, statutory liabilities and remittances require organization-wide consolidated authority.",
    });
  }
  next();
});
const mayView = requireAnyPermission("compliance.view", "remittances.view", "payroll.view", "payroll.manage");
const mayManageRules = requireAnyPermission("compliance.manage", "payroll.manage");
const mayManageRemittances = requireAnyPermission("remittances.manage", "payroll.manage");
function send(res, error) {
  if (error?.code) return res.status(error.statusCode || 400).json({ status: "error", code: error.code, message: error.message, details: error.details });
  console.error("Compliance operation error:", error);
  return res.status(500).json({ status: "error", message: "Compliance operation failed." });
}
router.get("/rules", mayView, async (req, res) => {
  try {
    const data = await prisma.complianceRule.findMany({ where: { organizationId: req.auth.organizationId }, include: { events: { orderBy: { createdAt: "asc" } } }, orderBy: [{ ruleKey: "asc" }, { version: "desc" }] });
    return res.json({ status: "success", data });
  } catch (error) { return send(res, error); }
});
router.post("/rules", mayManageRules, async (req, res) => {
  try {
    const data = await rules.publishComplianceRule(prisma, { ...req.body, organizationId: req.auth.organizationId, actorUserId: req.auth.userId });
    return res.status(201).json({ status: "success", data });
  } catch (error) { return send(res, error); }
});
router.post("/rules/:id/transition", mayManageRules, async (req, res) => {
  try {
    const data = await rules.transitionComplianceRule(prisma, { organizationId: req.auth.organizationId, actorUserId: req.auth.userId, ruleId: req.params.id, targetStatus: req.body?.targetStatus, notes: req.body?.notes });
    return res.json({ status: "success", data });
  } catch (error) { return send(res, error); }
});
router.get("/obligations", mayView, async (req, res) => {
  try { return res.json({ status: "success", data: await remittances.listObligations({ organizationId: req.auth.organizationId, filters: req.query }) }); }
  catch (error) { return send(res, error); }
});
router.get("/remittances", mayView, async (req, res) => {
  try { return res.json({ status: "success", data: await remittances.listBatches({ organizationId: req.auth.organizationId }) }); }
  catch (error) { return send(res, error); }
});

router.get("/withheld-obligations", mayView, async (req, res) => {
  try {
    const data = await remittances.listWithheldObligations({ organizationId: req.auth.organizationId });
    const outstandingAmount = data.reduce((sum, row) => sum + Number(row.outstandingAmount || 0), 0);
    return res.json({
      status: "success",
      data,
      summary: {
        count: data.length,
        employees: new Set(data.map((row) => row.employeeId)).size,
        outstandingAmount: Math.round(outstandingAmount * 100) / 100,
        readyToRelease: data.filter((row) => row.readyForRelease).length,
      },
      control: "These liabilities were calculated and confirmed with approved payroll but are withheld from remittance allocation because required employee statutory identifiers were incomplete.",
    });
  } catch (error) { return send(res, error); }
});

router.get("/withheld-obligations.xlsx", mayView, async (req, res) => {
  try {
    const rows = await remittances.listWithheldObligations({ organizationId: req.auth.organizationId });
    const workbook = XLSX.utils.book_new();
    const data = rows.map((row) => ({
      "Employee No": row.employee?.employeeNumber || "",
      "Employee Name": [row.employee?.firstName, row.employee?.middleName, row.employee?.lastName].filter(Boolean).join(" "),
      "Employee Email": row.employee?.email || "",
      "Statutory Type": row.obligationType,
      "Payroll Period": `${row.periodYear}-${String(row.periodMonth).padStart(2, "0")}`,
      "Total Liability": Number(row.totalLiability || 0),
      "Amount Remitted": Number(row.amountRemitted || 0),
      "Outstanding Amount": Number(row.outstandingAmount || 0),
      "Missing Required Details": (row.missingFields || []).join(", "),
      "Pool Status": row.poolStatus,
      "Ready To Release": row.readyForRelease ? "YES" : "NO",
      "Due Date": row.dueDate ? new Date(row.dueDate).toISOString().slice(0, 10) : "",
      "Obligation ID": row.id,
      "Payroll Run ID": row.payrollRunId,
    }));
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(data.length ? data : [{ "Withheld Statutory Pool": "No withheld obligations." }]),
      "Withheld Statutories"
    );
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", 'attachment; filename="CHRiS_Withheld_Statutory_Remittances.xlsx"');
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    return res.send(buffer);
  } catch (error) { return send(res, error); }
});

router.post("/withheld-obligations/release-ready", mayManageRemittances, async (req, res) => {
  try {
    const data = await remittances.releaseReadyWithheldObligations({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
    });
    return res.json({
      status: "success",
      message: data.released
        ? `${data.released} withheld statutory obligation(s) released for future remittance allocation.`
        : "No withheld statutory obligations currently have complete required employee details.",
      data,
    });
  } catch (error) { return send(res, error); }
});
router.post("/remittances", mayManageRemittances, async (req, res) => {
  try { return res.status(201).json({ status: "success", data: await remittances.createBatch({ organizationId: req.auth.organizationId, actorUserId: req.auth.userId, input: req.body || {} }) }); }
  catch (error) { return send(res, error); }
});
for (const [path, method] of [["submit","submitBatch"],["approve","approveBatch"]]) {
  router.post(`/remittances/:id/${path}`, mayManageRemittances, async (req, res) => {
    try { return res.json({ status: "success", data: await remittances[method]({ organizationId: req.auth.organizationId, actorUserId: req.auth.userId, batchId: req.params.id, notes: req.body?.notes }) }); }
    catch (error) { return send(res, error); }
  });
}
router.post("/remittances/:id/payment", mayManageRemittances, async (req, res) => {
  try { return res.json({ status: "success", data: await remittances.recordPayment({ organizationId: req.auth.organizationId, actorUserId: req.auth.userId, batchId: req.params.id, input: req.body || {} }) }); }
  catch (error) { return send(res, error); }
});
router.post("/remittances/:id/allocations", mayManageRemittances, async (req, res) => {
  try { return res.json({ status: "success", data: await remittances.allocateBatch({ organizationId: req.auth.organizationId, actorUserId: req.auth.userId, batchId: req.params.id, allocations: req.body?.allocations }) }); }
  catch (error) { return send(res, error); }
});
router.post("/remittances/:id/reconcile", mayManageRemittances, async (req, res) => {
  try { return res.json({ status: "success", data: await remittances.reconcileBatch({ organizationId: req.auth.organizationId, actorUserId: req.auth.userId, batchId: req.params.id, input: req.body || {} }) }); }
  catch (error) { return send(res, error); }
});
router.post("/remittances/:id/fail", mayManageRemittances, async (req, res) => {
  try { return res.json({ status: "success", data: await remittances.failBatch({ organizationId: req.auth.organizationId, actorUserId: req.auth.userId, batchId: req.params.id, reason: req.body?.reason }) }); }
  catch (error) { return send(res, error); }
});
router.post("/remittances/:id/reverse", mayManageRemittances, async (req, res) => {
  try { return res.json({ status: "success", data: await remittances.reverseBatch({ organizationId: req.auth.organizationId, actorUserId: req.auth.userId, batchId: req.params.id, reason: req.body?.reason }) }); }
  catch (error) { return send(res, error); }
});

module.exports = router;
