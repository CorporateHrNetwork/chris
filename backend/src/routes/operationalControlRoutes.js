const crypto = require("crypto");
const express = require("express");
const prisma = require("../config/prisma");
const { requireAuth } = require("../middleware/authMiddleware");

const router = express.Router();
router.use(requireAuth);

const MODULES = {
  STATUTORIES: new Set(["DASHBOARD", "PAYE_TAX", "PENSION_COMPLIANCE", "NHIA", "NSITF", "ITF", "REMITTANCES", "REPORTS"]),
  PERFORMANCE: new Set(["DASHBOARD", "GOALS_KPIS", "CYCLES", "REVIEWS", "APPRAISALS", "IMPROVEMENT_PLANS", "REPORTS"]),
};
const STATUSES = new Set(["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"]);

function normalize(value) {
  return String(value || "").trim();
}
function upper(value) {
  return normalize(value).toUpperCase();
}
function assertModuleArea(module, area) {
  if (!MODULES[module] || !MODULES[module].has(area)) {
    const error = new Error("Unsupported operational workspace.");
    error.code = "OPERATIONAL_WORKSPACE_NOT_FOUND";
    error.statusCode = 404;
    throw error;
  }
}
function assertAccess(req, module, write = false) {
  const permissions = new Set(req.auth?.permissions || []);
  const required = module === "STATUTORIES"
    ? (write ? ["payroll.manage", "payroll.process"] : ["payroll.view", "settings.view"])
    : (write ? ["performance.manage", "employees.update"] : ["performance.view", "employees.view"]);
  if (!required.some((permission) => permissions.has(permission))) {
    const error = new Error("You do not have permission to access this workspace.");
    error.code = "OPERATIONAL_WORKSPACE_FORBIDDEN";
    error.statusCode = 403;
    throw error;
  }
}
function mapEvent(event) {
  const value = event.newValue && typeof event.newValue === "object" ? event.newValue : {};
  return {
    id: event.entityId,
    module: value.module,
    area: value.area,
    title: value.title,
    owner: value.owner || null,
    employeeNumber: value.employeeNumber || null,
    dueDate: value.dueDate || null,
    status: value.status || "OPEN",
    notes: value.notes || null,
    locationId: value.locationId || null,
    createdAt: event.createdAt,
    updatedAt: event.createdAt,
    reason: event.reason || null,
  };
}
async function latestRecords(organizationId, module, area, activeLocationId) {
  const events = await prisma.organizationAudit.findMany({
    where: {
      organizationId,
      entityType: "OperationalControlRecord",
      action: { in: ["OPERATIONAL_RECORD_CREATED", "OPERATIONAL_RECORD_STATUS_CHANGED"] },
    },
    orderBy: { createdAt: "asc" },
  });
  const map = new Map();
  for (const event of events) {
    const record = mapEvent(event);
    if (record.module !== module || record.area !== area) continue;
    if (activeLocationId && record.locationId && record.locationId !== activeLocationId) continue;
    map.set(record.id, record);
  }
  return [...map.values()].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}
async function payrollContext(organizationId) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT pr."id",pp."code" AS "periodCode",pp."periodEnd",pr."status",pr."statutoryStatus",
            pr."employeeCount",pr."grossTotal",pr."deductionTotal",pr."netPreviewTotal",pr."approvedAt"
       FROM "payroll_runs" pr
       JOIN "payroll_periods" pp ON pp."id"=pr."periodId" AND pp."organizationId"=pr."organizationId"
      WHERE pr."organizationId"=$1
      ORDER BY pp."periodEnd" DESC,pr."createdAt" DESC LIMIT 12`,
    organizationId
  );
  return rows.map((row) => ({
    ...row,
    employeeCount: Number(row.employeeCount || 0),
    grossTotal: Number(row.grossTotal || 0),
    deductionTotal: Number(row.deductionTotal || 0),
    netPreviewTotal: Number(row.netPreviewTotal || 0),
    periodEnd: row.periodEnd ? new Date(row.periodEnd).toISOString().slice(0, 10) : null,
  }));
}

router.get("/:module/:area", async (req, res) => {
  try {
    const module = upper(req.params.module);
    const area = upper(req.params.area);
    assertModuleArea(module, area);
    assertAccess(req, module, false);
    const records = await latestRecords(req.auth.organizationId, module, area, req.auth.activeLocationId || null);
    const response = {
      module,
      area,
      records,
      summary: {
        total: records.length,
        open: records.filter((record) => record.status === "OPEN").length,
        inProgress: records.filter((record) => record.status === "IN_PROGRESS").length,
        completed: records.filter((record) => record.status === "COMPLETED").length,
      },
    };
    if (module === "STATUTORIES") response.payrollContext = await payrollContext(req.auth.organizationId);
    return res.json({ status: "success", data: response });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ status: "error", code: error.code || "OPERATIONAL_WORKSPACE_FAILED", message: error.message });
  }
});

router.post("/:module/:area/records", async (req, res) => {
  try {
    const module = upper(req.params.module);
    const area = upper(req.params.area);
    assertModuleArea(module, area);
    assertAccess(req, module, true);
    const title = normalize(req.body?.title);
    const reason = normalize(req.body?.reason);
    if (!title) return res.status(400).json({ status: "error", code: "OPERATIONAL_TITLE_REQUIRED", message: "Enter a title / control item." });
    if (!reason) return res.status(400).json({ status: "error", code: "OPERATIONAL_REASON_REQUIRED", message: "Enter the reason or control basis." });
    const id = crypto.randomUUID();
    const record = {
      module,
      area,
      title,
      owner: normalize(req.body?.owner) || null,
      employeeNumber: normalize(req.body?.employeeNumber).toUpperCase() || null,
      dueDate: normalize(req.body?.dueDate) || null,
      status: "OPEN",
      notes: normalize(req.body?.notes) || null,
      locationId: req.auth.activeLocationId || null,
    };
    await prisma.organizationAudit.create({
      data: {
        organizationId: req.auth.organizationId,
        actorUserId: req.auth.userId,
        entityType: "OperationalControlRecord",
        entityId: id,
        action: "OPERATIONAL_RECORD_CREATED",
        newValue: record,
        reason,
      },
    });
    return res.status(201).json({ status: "success", data: { id, ...record }, message: "Operational record created and added to the audit trail." });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ status: "error", code: error.code || "OPERATIONAL_RECORD_CREATE_FAILED", message: error.message });
  }
});

router.put("/:module/:area/records/:id/status", async (req, res) => {
  try {
    const module = upper(req.params.module);
    const area = upper(req.params.area);
    assertModuleArea(module, area);
    assertAccess(req, module, true);
    const status = upper(req.body?.status);
    const reason = normalize(req.body?.reason);
    if (!STATUSES.has(status)) return res.status(400).json({ status: "error", code: "INVALID_OPERATIONAL_STATUS", message: "Status must be OPEN, IN_PROGRESS, COMPLETED or CANCELLED." });
    if (!reason) return res.status(400).json({ status: "error", code: "OPERATIONAL_STATUS_REASON_REQUIRED", message: "Enter a reason for the status change." });
    const current = (await latestRecords(req.auth.organizationId, module, area, req.auth.activeLocationId || null)).find((record) => record.id === req.params.id);
    if (!current) return res.status(404).json({ status: "error", code: "OPERATIONAL_RECORD_NOT_FOUND", message: "Operational record not found." });
    const updated = { ...current, status, updatedAt: new Date().toISOString() };
    await prisma.organizationAudit.create({
      data: {
        organizationId: req.auth.organizationId,
        actorUserId: req.auth.userId,
        entityType: "OperationalControlRecord",
        entityId: req.params.id,
        action: "OPERATIONAL_RECORD_STATUS_CHANGED",
        previousValue: current,
        newValue: updated,
        reason,
      },
    });
    return res.json({ status: "success", data: updated, message: "Operational status updated." });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ status: "error", code: error.code || "OPERATIONAL_STATUS_UPDATE_FAILED", message: error.message });
  }
});

module.exports = router;
