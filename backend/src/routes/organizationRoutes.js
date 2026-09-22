const express = require("express");
const { requireAuth, requirePermission } = require("../middleware/authMiddleware");
const service = require("../services/organizationService");

const router = express.Router();
router.use(requireAuth);

function errorResponse(res, error) {
  const prismaMismatch = error?.name === "PrismaClientValidationError" ||
    /Unknown argument `?(code|registrationNumber|taxNumber)`?|Cannot read properties of undefined.*findMany|costCentre/i.test(error?.message || "");
  if (prismaMismatch) return res.status(503).json({ status: "error", code: "ORGANIZATION_SCHEMA_NOT_READY", message: "Organization configuration is not ready. Apply the Organization migration and regenerate Prisma Client, then restart the backend." });
  const conflict = ["COST_CENTRE_CODE_EXISTS", "INVALID_EFFECTIVE_INTERVAL"].includes(error.message);
  const missing = ["ORGANIZATION_NOT_FOUND", "COST_CENTRE_NOT_FOUND"].includes(error.message);
  const safeCode = /^[A-Z0-9_]+$/.test(error?.message || "") ? error.message : "ORGANIZATION_OPERATION_FAILED";
  return res.status(missing ? 404 : conflict ? 409 : 400).json({ status: "error", code: safeCode, message: safeCode.replaceAll("_", " ").toLowerCase() });
}

router.get("/profile", requirePermission("settings.view"), async (req, res) => {
  try { return res.json({ status: "success", data: await service.getOrganizationProfile({ organizationId: req.auth.organizationId }) }); }
  catch (error) { return errorResponse(res, error); }
});
router.put("/profile", requirePermission("settings.manage"), async (req, res) => {
  try { return res.json({ status: "success", message: "Organization profile saved.", data: await service.updateOrganizationProfile({ organizationId: req.auth.organizationId, actorUserId: req.auth.userId, input: req.body }) }); }
  catch (error) { return errorResponse(res, error); }
});
router.get("/chart", requirePermission("settings.view"), async (req, res) => {
  try { return res.json({ status: "success", data: await service.getOrganizationChart({ organizationId: req.auth.organizationId }) }); }
  catch (error) { return errorResponse(res, error); }
});
router.get("/reporting-lines", requirePermission("settings.view"), async (req, res) => {
  try { return res.json({ status: "success", data: await service.getReportingLines({ organizationId: req.auth.organizationId }) }); }
  catch (error) { return errorResponse(res, error); }
});
router.get("/cost-centres", requirePermission("settings.view"), async (req, res) => {
  try { return res.json({ status: "success", data: await service.listCostCentres({ organizationId: req.auth.organizationId }) }); }
  catch (error) { return errorResponse(res, error); }
});
router.get("/cost-centres/assignment-options", requirePermission("settings.view"), async (req, res) => {
  try { return res.json({ status: "success", data: await service.getCostCentreAssignmentOptions({ organizationId: req.auth.organizationId }) }); }
  catch (error) { return errorResponse(res, error); }
});
router.post("/cost-centres", requirePermission("settings.manage"), async (req, res) => {
  try { return res.status(201).json({ status: "success", message: "Cost centre created.", data: await service.saveCostCentre({ organizationId: req.auth.organizationId, actorUserId: req.auth.userId, input: req.body }) }); }
  catch (error) { return errorResponse(res, error); }
});
router.put("/cost-centres/:costCentreId", requirePermission("settings.manage"), async (req, res) => {
  try { return res.json({ status: "success", message: "Cost centre saved.", data: await service.saveCostCentre({ organizationId: req.auth.organizationId, actorUserId: req.auth.userId, costCentreId: req.params.costCentreId, input: req.body }) }); }
  catch (error) { return errorResponse(res, error); }
});
router.get("/audits", requirePermission("settings.view"), async (req, res) => {
  try { return res.json({ status: "success", data: await service.listOrganizationAudits({ organizationId: req.auth.organizationId, entityType: req.query.entityType, entityId: req.query.entityId }) }); }
  catch (error) { return errorResponse(res, error); }
});

module.exports = router;
