const express = require("express");
const XLSX = require("xlsx");

const prisma = require("../config/prisma");
const {
  requireAuth,
  requirePermission,
} = require("../middleware/authMiddleware");
const {
  getReportsRelease1,
} = require("../services/reportsRelease1Service");

const router = express.Router();
router.use(requireAuth);

function safeFilePart(value) {
  return String(value || "CHRIS")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "CHRIS";
}

function addJsonSheet(workbook, rows, name) {
  const safeRows = Array.isArray(rows) && rows.length ? rows : [{ message: "No records available" }];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(safeRows), name.slice(0, 31));
}

function summaryRows(data) {
  return [
    { metric: "Current Workforce", value: data.summary.currentWorkforce },
    { metric: "Employee Records", value: data.summary.employeeRecords },
    { metric: "Active", value: data.summary.active },
    { metric: "Probation", value: data.summary.probation },
    { metric: "On Leave", value: data.summary.onLeave },
    { metric: "Suspended", value: data.summary.suspended },
    { metric: "Exited", value: data.summary.exited },
    { metric: "Male", value: data.summary.male },
    { metric: "Female", value: data.summary.female },
    { metric: "Gender Data Pending", value: data.summary.genderPending },
    { metric: "Unassigned Location", value: data.summary.unassignedLocation },
  ];
}

function buildWorkbook(data, view) {
  const workbook = XLSX.utils.book_new();
  const normalized = String(view || "overview").trim().toLowerCase();

  if (normalized === "employees") {
    addJsonSheet(workbook, data.employees, "Employee Report");
    return workbook;
  }

  if (normalized === "branches") {
    addJsonSheet(workbook, data.branches, "Branch Report");
    return workbook;
  }

  if (normalized === "headcount") {
    addJsonSheet(workbook, data.headcount.byStatus, "By Status");
    addJsonSheet(workbook, data.headcount.byDepartment, "By Department");
    addJsonSheet(workbook, data.headcount.byEmploymentType, "By Employment Type");
    addJsonSheet(workbook, data.headcount.byGender, "By Gender");
    addJsonSheet(workbook, data.headcount.byDesignation, "By Designation");
    return workbook;
  }

  if (normalized === "workforce") {
    addJsonSheet(workbook, summaryRows(data), "Workforce Summary");
    addJsonSheet(workbook, data.headcount.byStatus, "Status");
    addJsonSheet(workbook, data.headcount.byDepartment, "Departments");
    addJsonSheet(workbook, data.headcount.byEmploymentType, "Employment Types");
    return workbook;
  }

  addJsonSheet(workbook, summaryRows(data), "Executive Summary");
  addJsonSheet(workbook, data.branches, "Branches");
  addJsonSheet(workbook, data.headcount.byDepartment, "Departments");
  addJsonSheet(workbook, data.employees, "Employees");
  return workbook;
}

router.get(
  "/release1",
  requirePermission("reports.view"),
  async (req, res) => {
    try {
      const data = await getReportsRelease1({
        organizationId: req.auth.organizationId,
        locationId: req.auth.activeLocationId || null,
      });
      return res.status(200).json({ status: "success", data });
    } catch (error) {
      console.error("Reports & Analytics Release-1 error:", error);
      return res.status(error.statusCode || 500).json({
        status: "error",
        code: error.code || "REPORTS_RELEASE1_FAILED",
        message: error.message || "Unable to load Reports & Analytics.",
      });
    }
  }
);

router.get(
  "/release1/export.xlsx",
  requirePermission("reports.view", "reports.export"),
  async (req, res) => {
    try {
      const view = String(req.query?.view || "overview").trim().toLowerCase();
      const allowedViews = new Set(["overview", "workforce", "employees", "headcount", "branches"]);
      if (!allowedViews.has(view)) {
        return res.status(400).json({
          status: "error",
          code: "INVALID_REPORT_VIEW",
          message: "Select a valid report view before exporting.",
        });
      }

      const data = await getReportsRelease1({
        organizationId: req.auth.organizationId,
        locationId: req.auth.activeLocationId || null,
      });
      const workbook = buildWorkbook(data, view);
      const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
      const scopeName = data.scope.mode === "HEAD_OFFICE_CONSOLIDATED"
        ? "HEAD-OFFICE"
        : data.scope.locationCode || data.scope.locationName;
      const fileName = `CHRIS_${safeFilePart(scopeName)}_${safeFilePart(view)}_report.xlsx`;

      await prisma.organizationAudit.create({
        data: {
          organizationId: req.auth.organizationId,
          actorUserId: req.auth.userId,
          entityType: "ReportExport",
          entityId: `${view}:${Date.now()}`,
          action: "REPORT_EXPORT_DOWNLOADED",
          previousValue: undefined,
          newValue: {
            reportRelease: "REPORTS_ANALYTICS_RELEASE_1",
            view,
            scope: data.scope,
            currentWorkforce: data.summary.currentWorkforce,
            exportedRows: view === "employees" ? data.employees.length : null,
          },
          reason: "Authorized Reports & Analytics Excel export",
        },
      });

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      return res.status(200).send(buffer);
    } catch (error) {
      console.error("Reports & Analytics export error:", error);
      return res.status(error.statusCode || 500).json({
        status: "error",
        code: error.code || "REPORT_EXPORT_FAILED",
        message: error.message || "Unable to export the report.",
      });
    }
  }
);

module.exports = router;
