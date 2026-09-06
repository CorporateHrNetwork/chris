const express = require("express");
const prisma = require("../config/prisma");
const { requireAuth, requirePermission } = require("../middleware/authMiddleware");
const { getWorkforceAnalytics } = require("../services/workforceAnalyticsService");
const { captureWorkforceSnapshot, getWorkforceSnapshots } = require("../services/workforceSnapshotService");
const { getWorkforceMetrics } = require("../services/workforceMetricsService");

const router = express.Router();
router.use(requireAuth);

function scopedLocation(req) {
  return req.auth?.activeLocationId || req.query.locationId || undefined;
}

router.get("/workforce/metrics", requirePermission("employees.view"), async (req, res) => {
  try {
    const data = await getWorkforceMetrics(prisma, {
      organizationId: req.auth.organizationId,
      from: req.query.from,
      to: req.query.to,
      filters: {
        departmentId: req.query.departmentId,
        locationId: scopedLocation(req),
        status: req.query.status,
        gender: req.query.gender,
      },
    });
    return res.status(200).json({
      status: "success",
      data: {
        ...data,
        locationContext: req.auth.activeLocationId
          ? { mode: "BRANCH", locationId: req.auth.activeLocationId }
          : { mode: "HEAD_OFFICE_CONSOLIDATED", locationId: null },
      },
    });
  } catch (error) {
    if (["INVALID_SNAPSHOT_DATE", "INVALID_DATE_RANGE"].includes(error.message)) {
      return res.status(400).json({ status: "error", message: "Provide a valid workforce metrics period." });
    }
    console.error("Advanced workforce metrics error:", error);
    return res.status(500).json({ status: "error", message: "Unable to calculate advanced workforce metrics." });
  }
});

router.get("/workforce/history", requirePermission("employees.view"), async (req, res) => {
  try {
    const data = await getWorkforceSnapshots(prisma, req.auth.organizationId, req.query);
    return res.status(200).json({ status: "success", data });
  } catch (error) {
    if (["INVALID_SNAPSHOT_DATE", "INVALID_DATE_RANGE"].includes(error.message)) {
      return res.status(400).json({ status: "error", message: "Provide a valid workforce snapshot date range." });
    }
    console.error("Workforce snapshot history error:", error);
    return res.status(500).json({ status: "error", message: "Unable to load workforce snapshot history." });
  }
});

router.post("/workforce/snapshot", requirePermission("employees.update"), async (req, res) => {
  try {
    const data = await captureWorkforceSnapshot(prisma, req.auth.organizationId, req.body?.snapshotDate);
    return res.status(200).json({ status: "success", message: "Workforce snapshot captured.", data });
  } catch (error) {
    if (["INVALID_SNAPSHOT_DATE", "INVALID_ORGANIZATION_TIMEZONE"].includes(error.message)) {
      return res.status(400).json({ status: "error", message: "Unable to normalize the workforce snapshot date." });
    }
    console.error("Workforce snapshot capture error:", error);
    return res.status(500).json({ status: "error", message: "Unable to capture workforce snapshot." });
  }
});

router.get("/workforce", requirePermission("employees.view"), async (req, res) => {
  try {
    const filters = { ...req.query, ...(req.auth.activeLocationId ? { locationId: req.auth.activeLocationId } : {}) };
    const data = await getWorkforceAnalytics(prisma, { organizationId: req.auth.organizationId, filters });
    return res.status(200).json({
      status: "success",
      data: {
        ...data,
        locationContext: req.auth.activeLocationId
          ? { mode: "BRANCH", locationId: req.auth.activeLocationId }
          : { mode: "HEAD_OFFICE_CONSOLIDATED", locationId: null },
      },
    });
  } catch (error) {
    console.error("Workforce analytics error:", error);
    return res.status(500).json({ status: "error", message: "Unable to generate workforce analytics." });
  }
});

module.exports = router;
