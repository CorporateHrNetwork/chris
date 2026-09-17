const express = require("express");
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
