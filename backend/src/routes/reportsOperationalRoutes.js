const express = require("express");
const XLSX = require("xlsx");

const prisma = require("../config/prisma");
const {
  requireAuth,
  requirePermission,
} = require("../middleware/authMiddleware");
const { getAttendanceReport } = require("../services/attendanceService");
const {
  getLeaveOverview,
  getBalanceRegister,
} = require("../services/leaveOperationalService");
const { getLeaveRequests } = require("../services/leaveService");
const payroll = require("../services/payrollOperationsService");

const router = express.Router();
router.use(requireAuth);

function isoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function employeeName(employee) {
  return [employee?.firstName, employee?.middleName, employee?.lastName]
    .filter(Boolean)
    .join(" ");
}

function scopeDescriptor(req) {
  const location = (req.auth.availableLocations || []).find(
    (row) => row.id === req.auth.activeLocationId
  );
  if (!req.auth.activeLocationId) {
    return {
      mode: "HEAD_OFFICE_CONSOLIDATED",
      locationId: null,
      locationName: "HEAD OFFICE",
      locationCode: "HO",
    };
  }
  return {
    mode: "BRANCH",
    locationId: req.auth.activeLocationId,
    locationName: location?.name || "BRANCH",
    locationCode: location?.code || null,
  };
}

async function branchEmployees(req) {
  if (!req.auth.activeLocationId) return null;
  return prisma.employee.findMany({
    where: {
      organizationId: req.auth.organizationId,
      locationId: req.auth.activeLocationId,
    },
    select: { id: true, employeeNumber: true },
  });
}

async function loadAttendance(req) {
  const report = await getAttendanceReport({
    organizationId: req.auth.organizationId,
    from: req.query.from,
    to: req.query.to,
    employeeNumber: req.query.employeeNumber,
  });

  const branchRows = await branchEmployees(req);
  let records = report.records || [];
  if (branchRows) {
    const numbers = new Set(branchRows.map((row) => row.employeeNumber.toUpperCase()));
    records = records.filter((row) =>
      numbers.has(String(row.employee?.employeeNumber || "").toUpperCase())
    );
  }

  const totals = records.reduce(
    (acc, row) => {
      acc.records += 1;
      acc.lateMinutes += Number(row.lateMinutes || 0);
      acc.overtimeMinutes += Number(row.overtimeMinutes || 0);
      const status = String(row.status || "UNKNOWN").toUpperCase();
      acc.byStatus[status] = (acc.byStatus[status] || 0) + 1;
      return acc;
    },
    { records: 0, lateMinutes: 0, overtimeMinutes: 0, byStatus: {} }
  );

  return {
    generatedAt: new Date().toISOString(),
    scope: scopeDescriptor(req),
    from: report.from,
    to: report.to,
    totals,
    records: records.map((row) => ({
      id: row.id,
      attendanceDate: isoDate(row.attendanceDate),
      employeeNumber: row.employee?.employeeNumber || null,
      employeeName: employeeName(row.employee),
      status: row.status,
      shift: row.shift?.name || null,
      clockIn: row.clockIn || null,
      clockOut: row.clockOut || null,
      lateMinutes: Number(row.lateMinutes || 0),
      overtimeMinutes: Number(row.overtimeMinutes || 0),
      source: row.source || null,
    })),
  };
}

async function loadLeave(req) {
  const leaveYear = Number(req.query.leaveYear || new Date().getFullYear());
  const locationId = req.auth.activeLocationId || null;
  const [overview, balances, rawRequests, branchRows] = await Promise.all([
    getLeaveOverview({
      organizationId: req.auth.organizationId,
      locationId,
    }),
    getBalanceRegister({
      organizationId: req.auth.organizationId,
      leaveYear,
      locationId,
    }),
    getLeaveRequests({ organizationId: req.auth.organizationId }),
    branchEmployees(req),
  ]);

  let requests = rawRequests;
  if (branchRows) {
    const ids = new Set(branchRows.map((row) => row.id));
    requests = requests.filter((row) => ids.has(row.employee?.id));
  }

  const byStatus = {};
  const byLeaveType = {};
  for (const row of requests) {
    const status = String(row.status || "UNKNOWN").toUpperCase();
    const leaveType = row.leaveType?.name || "Unassigned";
    byStatus[status] = (byStatus[status] || 0) + 1;
    byLeaveType[leaveType] = (byLeaveType[leaveType] || 0) + 1;
  }

  return {
    generatedAt: new Date().toISOString(),
    scope: scopeDescriptor(req),
    leaveYear,
    overview,
    summary: {
      requestCount: requests.length,
      balanceRows: balances.length,
      byStatus,
      byLeaveType,
    },
    requests: requests.map((row) => ({
      id: row.id,
      employeeNumber: row.employee?.employeeNumber || null,
      employeeName: employeeName(row.employee),
      department: row.employee?.department?.name || null,
      branch: row.employee?.location?.name || null,
      leaveType: row.leaveType?.name || null,
      policy: row.leavePolicy?.name || null,
      status: row.status,
      startDate: isoDate(row.startDate),
      endDate: isoDate(row.endDate),
      requestedUnits: Number(row.requestedUnits || 0),
      reason: row.reason || null,
    })),
    balances: balances.map((row) => ({
      id: row.id,
      employeeNumber: row.employee?.employeeNumber || null,
      employeeName: row.employeeName || employeeName(row.employee),
      leaveType: row.leaveType?.name || null,
      policy: row.policy?.name || null,
      leaveYear: row.leaveYear,
      entitlement: Number(row.entitlement || 0),
      used: Number(row.used || 0),
      pendingAllocation: Number(row.pendingAllocation || 0),
      approvedAllocation: Number(row.approvedAllocation || 0),
      available: Number(row.available || 0),
    })),
  };
}

function mapMoneyRow(row) {
  return {
    ...row,
    employeeCount: Number(row.employeeCount || 0),
    grossTotal: Number(row.grossTotal || 0),
    deductionTotal: Number(row.deductionTotal || 0),
    netPreviewTotal: Number(row.netPreviewTotal || 0),
  };
}

async function branchPayrollRuns(req) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT pr."id",pr."periodId",pp."code" AS "periodCode",pp."name" AS "periodName",
            pp."periodStart",pp."periodEnd",pp."payDate",pr."status",pr."statutoryStatus",
            pr."submittedAt",pr."approvedAt",pr."createdAt",pr."updatedAt",
            COUNT(pl."id")::int AS "employeeCount",
            COALESCE(SUM(pl."grossPay"),0) AS "grossTotal",
            COALESCE(SUM(pl."deductions" + pl."advanceRecovery" + COALESCE(pl."loanRecovery",0)),0) AS "deductionTotal",
            COALESCE(SUM(pl."netPreview"),0) AS "netPreviewTotal"
       FROM "payroll_runs" pr
       JOIN "payroll_periods" pp ON pp."id"=pr."periodId" AND pp."organizationId"=pr."organizationId"
       JOIN "payroll_run_lines" pl ON pl."runId"=pr."id" AND pl."organizationId"=pr."organizationId"
       JOIN "employees" e ON e."id"=pl."employeeId" AND e."organizationId"=pl."organizationId"
      WHERE pr."organizationId"=$1 AND e."locationId"=$2
      GROUP BY pr."id",pr."periodId",pp."code",pp."name",pp."periodStart",pp."periodEnd",pp."payDate",
               pr."status",pr."statutoryStatus",pr."submittedAt",pr."approvedAt",pr."createdAt",pr."updatedAt"
      ORDER BY pp."periodStart" DESC,pr."createdAt" DESC`,
    req.auth.organizationId,
    req.auth.activeLocationId
  );
  return rows.map(mapMoneyRow);
}

async function loadPayroll(req) {
  const runs = req.auth.activeLocationId
    ? await branchPayrollRuns(req)
    : await payroll.listRuns({ organizationId: req.auth.organizationId });
  const mapped = runs.map(mapMoneyRow);
  const latest = mapped[0] || null;
  return {
    generatedAt: new Date().toISOString(),
    scope: scopeDescriptor(req),
    latest,
    runs: mapped,
    totals: {
      runCount: mapped.length,
      latestEmployeeCount: Number(latest?.employeeCount || 0),
      latestGrossPayroll: Number(latest?.grossTotal || 0),
      latestDeductions: Number(latest?.deductionTotal || 0),
      latestNetPayroll: Number(latest?.netPreviewTotal || 0),
    },
    control: req.auth.activeLocationId
      ? "Branch financial totals are derived from employees in the active branch. Payroll execution and approval remain Head Office controls."
      : "Head Office shows consolidated organization payroll runs.",
  };
}

function sendError(res, error, fallback) {
  console.error(fallback, error);
  return res.status(error.statusCode || 500).json({
    status: "error",
    code: error.code || "REPORT_OPERATIONAL_FAILED",
    message: error.message || fallback,
  });
}

router.get(
  "/operational/attendance",
  requirePermission("reports.view", "attendance.view"),
  async (req, res) => {
    try {
      return res.json({ status: "success", data: await loadAttendance(req) });
    } catch (error) {
      return sendError(res, error, "Unable to load Attendance Reports.");
    }
  }
);

router.get(
  "/operational/leave",
  requirePermission("reports.view", "leave.view"),
  async (req, res) => {
    try {
      return res.json({ status: "success", data: await loadLeave(req) });
    } catch (error) {
      return sendError(res, error, "Unable to load Leave Reports.");
    }
  }
);

router.get(
  "/operational/payroll",
  requirePermission("reports.view", "payroll.view"),
  async (req, res) => {
    try {
      return res.json({ status: "success", data: await loadPayroll(req) });
    } catch (error) {
      return sendError(res, error, "Unable to load Payroll Reports.");
    }
  }
);

function appendSheet(workbook, rows, name) {
  const data = Array.isArray(rows) && rows.length ? rows : [{ message: "No records available" }];
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(data),
    String(name).slice(0, 31)
  );
}

async function auditExport(req, view, data, rowCount) {
  await prisma.organizationAudit.create({
    data: {
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      entityType: "ReportExport",
      entityId: `${view}:${Date.now()}`,
      action: "REPORT_EXPORT_DOWNLOADED",
      newValue: {
        reportRelease: "REPORTS_ANALYTICS_RELEASE_1_1",
        view,
        scope: data.scope,
        exportedRows: rowCount,
      },
      reason: "Authorized operational Reports & Analytics Excel export",
    },
  });
}

function sendWorkbook(res, workbook, view, scope) {
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const safeScope = String(scope.locationCode || scope.locationName || "CHRIS")
    .replace(/[^a-zA-Z0-9_-]+/g, "-");
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="CHRIS_${safeScope}_${view}_report.xlsx"`);
  return res.status(200).send(buffer);
}

router.get(
  "/operational/attendance/export.xlsx",
  requirePermission("reports.view", "reports.export", "attendance.view"),
  async (req, res) => {
    try {
      const data = await loadAttendance(req);
      const workbook = XLSX.utils.book_new();
      appendSheet(workbook, [data.totals], "Attendance Summary");
      appendSheet(workbook, data.records, "Attendance Records");
      await auditExport(req, "attendance", data, data.records.length);
      return sendWorkbook(res, workbook, "attendance", data.scope);
    } catch (error) {
      return sendError(res, error, "Unable to export Attendance Reports.");
    }
  }
);

router.get(
  "/operational/leave/export.xlsx",
  requirePermission("reports.view", "reports.export", "leave.view"),
  async (req, res) => {
    try {
      const data = await loadLeave(req);
      const workbook = XLSX.utils.book_new();
      appendSheet(workbook, [data.overview], "Leave Summary");
      appendSheet(workbook, data.requests, "Leave Requests");
      appendSheet(workbook, data.balances, "Leave Balances");
      await auditExport(req, "leave", data, data.requests.length + data.balances.length);
      return sendWorkbook(res, workbook, "leave", data.scope);
    } catch (error) {
      return sendError(res, error, "Unable to export Leave Reports.");
    }
  }
);

router.get(
  "/operational/payroll/export.xlsx",
  requirePermission("reports.view", "reports.export", "payroll.view"),
  async (req, res) => {
    try {
      const data = await loadPayroll(req);
      const workbook = XLSX.utils.book_new();
      appendSheet(workbook, [data.totals], "Payroll Summary");
      appendSheet(workbook, data.runs, "Payroll Runs");
      await auditExport(req, "payroll", data, data.runs.length);
      return sendWorkbook(res, workbook, "payroll", data.scope);
    } catch (error) {
      return sendError(res, error, "Unable to export Payroll Reports.");
    }
  }
);

module.exports = router;
