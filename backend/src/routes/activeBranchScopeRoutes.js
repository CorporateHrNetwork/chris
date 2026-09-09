const express = require("express");
const prisma = require("../config/prisma");
const {
  requireAuth,
  requirePermission,
  requireAnyPermission,
} = require("../middleware/authMiddleware");
const {
  getLeaveRequests,
} = require("../services/leaveService");
const {
  getLeaveOverview,
  getBalanceRegister,
  getEntitlementRegister,
} = require("../services/leaveOperationalService");
const {
  getAttendanceReport,
} = require("../services/attendanceService");
const {
  getShiftAssignments,
} = require("../services/attendanceInsightsService");
const {
  getWorkedHours,
  listManualPayrollInputs,
} = require("../services/attendancePayrollService");
const {
  getPayrollReadiness,
} = require("../services/payrollReadinessService");
const payroll = require("../services/payrollOperationsService");
const {
  listLoanEmployeeOptions,
  listVisibleLoans,
  listVisibleRecoveries,
} = require("../services/loanWorkflowAccessService");
const {
  getBulkLoanReport,
} = require("../services/loanProfileService");
const {
  exportBulkLoans,
} = require("../services/loanReportExportService");
const {
  getWorkforceReport,
  getLifecycleReport,
  workforceReportToCsv,
  lifecycleReportToCsv,
} = require("../services/employeeReporting");
const {
  getExitRegister,
} = require("../services/exitRegisterService");

const router = express.Router();
router.use(requireAuth);

const CURRENT_STATUSES = ["ACTIVE", "PROBATION", "LEAVE", "SUSPENDED"];

const loanMayView = requireAnyPermission(
  "loans.view",
  "payroll.view",
  "loans.apply",
  "loans.verify",
  "loans.approve",
  "loans.disburse",
  "payroll.manage"
);
const loanMayApply = requireAnyPermission("loans.apply", "payroll.manage");

function branchOnly(req, res, next) {
  if (!req.auth?.activeLocationId) return next("route");
  return next();
}

function branchContext(req) {
  return {
    mode: "BRANCH",
    locationId: req.auth.activeLocationId,
  };
}

function scopeError(res, code, message, statusCode = 403) {
  return res.status(statusCode).json({
    status: "error",
    code,
    message,
  });
}

function headOfficeRequired(res, operation) {
  return scopeError(
    res,
    "HEAD_OFFICE_REQUIRED_FOR_ORGANIZATION_CONTROL",
    `${operation} is an organization-wide control. Switch to HEAD OFFICE before performing this action.`,
    409
  );
}

async function branchEmployees(req, { currentOnly = false } = {}) {
  return prisma.employee.findMany({
    where: {
      organizationId: req.auth.organizationId,
      locationId: req.auth.activeLocationId,
      ...(currentOnly ? { status: { in: CURRENT_STATUSES } } : {}),
    },
    select: {
      id: true,
      employeeNumber: true,
      firstName: true,
      middleName: true,
      lastName: true,
      status: true,
      locationId: true,
    },
  });
}

async function assertEmployeeNumberInBranch(req, employeeNumber) {
  const normalized = String(employeeNumber || "").trim().toUpperCase();
  if (!normalized) {
    const error = new Error("EMPLOYEE_REQUIRED");
    error.statusCode = 400;
    throw error;
  }
  const employee = await prisma.employee.findFirst({
    where: {
      organizationId: req.auth.organizationId,
      employeeNumber: normalized,
    },
    select: { id: true, employeeNumber: true, locationId: true },
  });
  if (!employee) {
    const error = new Error("EMPLOYEE_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }
  if (employee.locationId !== req.auth.activeLocationId) {
    const error = new Error("EMPLOYEE_OUTSIDE_ACTIVE_BRANCH");
    error.statusCode = 403;
    throw error;
  }
  return employee;
}

async function assertEmployeeIdInBranch(req, employeeId) {
  const employee = await prisma.employee.findFirst({
    where: {
      organizationId: req.auth.organizationId,
      id: String(employeeId || "").trim(),
    },
    select: { id: true, employeeNumber: true, locationId: true },
  });
  if (!employee) {
    const error = new Error("EMPLOYEE_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }
  if (employee.locationId !== req.auth.activeLocationId) {
    const error = new Error("EMPLOYEE_OUTSIDE_ACTIVE_BRANCH");
    error.statusCode = 403;
    throw error;
  }
  return employee;
}

async function assertLeaveRequestInBranch(req, requestId) {
  const row = await prisma.leaveRequest.findFirst({
    where: {
      organizationId: req.auth.organizationId,
      id: String(requestId || "").trim(),
    },
    select: {
      id: true,
      employee: { select: { locationId: true } },
    },
  });
  if (!row) {
    const error = new Error("LEAVE_REQUEST_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }
  if (row.employee?.locationId !== req.auth.activeLocationId) {
    const error = new Error("LEAVE_REQUEST_OUTSIDE_ACTIVE_BRANCH");
    error.statusCode = 403;
    throw error;
  }
  return row;
}

async function assertLoanInBranch(req, loanId) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT "id","workflowLocationId" FROM "payroll_loans"
      WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,
    req.auth.organizationId,
    String(loanId || "").trim()
  );
  const row = rows[0] || null;
  if (!row) return null;
  if (row.workflowLocationId !== req.auth.activeLocationId) {
    const error = new Error("LOAN_OUTSIDE_ACTIVE_BRANCH");
    error.statusCode = 403;
    throw error;
  }
  return row;
}

function handleScopeGuardError(res, error) {
  const messages = {
    EMPLOYEE_REQUIRED: "Select an employee from the active branch.",
    EMPLOYEE_NOT_FOUND: "Employee not found.",
    EMPLOYEE_OUTSIDE_ACTIVE_BRANCH:
      "The selected employee does not belong to the active branch.",
    LEAVE_REQUEST_NOT_FOUND: "Leave request not found.",
    LEAVE_REQUEST_OUTSIDE_ACTIVE_BRANCH:
      "This leave request does not belong to the active branch.",
    LOAN_OUTSIDE_ACTIVE_BRANCH:
      "This loan does not belong to the active branch.",
  };
  if (!messages[error.message]) return false;
  scopeError(res, error.message, messages[error.message], error.statusCode || 403);
  return true;
}

function filterByEmployeeNumber(rows, numbers) {
  return (rows || []).filter((row) =>
    numbers.has(
      String(
        row.employeeNumber ||
          row.employee?.employeeNumber ||
          row.employee?.number ||
          ""
      ).toUpperCase()
    )
  );
}

/* ========================================================================
   LEAVE — employee transactional data follows the active branch.
   Policy definitions remain tenant-wide configuration.
   ======================================================================== */
router.get(
  "/leave/overview",
  branchOnly,
  requirePermission("employees.view"),
  async (req, res) => {
    try {
      const data = await getLeaveOverview({
        organizationId: req.auth.organizationId,
        locationId: req.auth.activeLocationId,
      });
      return res.json({ status: "success", data, locationContext: branchContext(req) });
    } catch (error) {
      console.error("Branch leave overview error:", error);
      return res.status(500).json({ status: "error", message: "Unable to load branch leave overview." });
    }
  }
);

router.get(
  "/leave/balance-register",
  branchOnly,
  requirePermission("employees.view"),
  async (req, res) => {
    try {
      const data = await getBalanceRegister({
        organizationId: req.auth.organizationId,
        leaveYear: req.query.leaveYear,
        locationId: req.auth.activeLocationId,
      });
      return res.json({ status: "success", data, locationContext: branchContext(req) });
    } catch (error) {
      console.error("Branch leave balance register error:", error);
      return res.status(500).json({ status: "error", message: "Unable to load branch leave balances." });
    }
  }
);

router.get(
  "/leave/entitlements",
  branchOnly,
  requirePermission("employees.view"),
  async (req, res) => {
    try {
      const data = await getEntitlementRegister({
        organizationId: req.auth.organizationId,
        asOfDate: req.query.asOfDate,
        employeeNumber: req.query.employeeNumber,
        locationId: req.auth.activeLocationId,
      });
      return res.json({ status: "success", data, locationContext: branchContext(req) });
    } catch (error) {
      console.error("Branch leave entitlement register error:", error);
      return res.status(500).json({ status: "error", message: "Unable to load branch leave entitlements." });
    }
  }
);

router.get(
  "/leave/requests",
  branchOnly,
  requirePermission("employees.view"),
  async (req, res) => {
    try {
      const employees = await branchEmployees(req);
      const ids = new Set(employees.map((employee) => employee.id));
      const data = await getLeaveRequests({
        organizationId: req.auth.organizationId,
        status: req.query.status,
      });
      return res.json({
        status: "success",
        data: data.filter((row) => ids.has(row.employee?.id)),
        locationContext: branchContext(req),
      });
    } catch (error) {
      console.error("Branch leave request list error:", error);
      return res.status(500).json({ status: "error", message: "Unable to load branch leave requests." });
    }
  }
);

for (const [method, path, employeeSource] of [
  ["post", "/leave/requests", (req) => req.body?.employeeNumber],
  ["post", "/leave/entitlements/adjustments", (req) => req.body?.employeeNumber],
]) {
  router[method](path, branchOnly, async (req, res, next) => {
    try {
      await assertEmployeeNumberInBranch(req, employeeSource(req));
      return next();
    } catch (error) {
      if (handleScopeGuardError(res, error)) return;
      return next(error);
    }
  });
}

router.get("/leave/request-day-calculation", branchOnly, async (req, res, next) => {
  try {
    await assertEmployeeNumberInBranch(req, req.query.employeeNumber);
    return next();
  } catch (error) {
    if (handleScopeGuardError(res, error)) return;
    return next(error);
  }
});

router.use("/leave/employees/:employeeNumber", async (req, res, next) => {
  if (!req.auth.activeLocationId) return next();
  try {
    await assertEmployeeNumberInBranch(req, req.params.employeeNumber);
    return next();
  } catch (error) {
    if (handleScopeGuardError(res, error)) return;
    return next(error);
  }
});

router.use("/leave/balances/:employeeNumber", async (req, res, next) => {
  if (!req.auth.activeLocationId) return next();
  try {
    await assertEmployeeNumberInBranch(req, req.params.employeeNumber);
    return next();
  } catch (error) {
    if (handleScopeGuardError(res, error)) return;
    return next(error);
  }
});

router.use("/leave/exceptions/:employeeNumber", async (req, res, next) => {
  if (!req.auth.activeLocationId) return next();
  try {
    await assertEmployeeNumberInBranch(req, req.params.employeeNumber);
    return next();
  } catch (error) {
    if (handleScopeGuardError(res, error)) return;
    return next(error);
  }
});

router.use("/leave/requests/:id", async (req, res, next) => {
  if (!req.auth.activeLocationId) return next();
  try {
    await assertLeaveRequestInBranch(req, req.params.id);
    return next();
  } catch (error) {
    if (handleScopeGuardError(res, error)) return;
    return next(error);
  }
});

router.post("/leave/entitlements/provision", branchOnly, (req, res) =>
  headOfficeRequired(res, "Leave entitlement mass provisioning")
);
router.post("/leave/entitlements/provisioning-preview", branchOnly, (req, res) =>
  headOfficeRequired(res, "Leave entitlement mass provisioning preview")
);

/* ========================================================================
   ATTENDANCE — reports/employee transactions are branch scoped.
   Shift definitions, holidays and payroll attendance basis are shared config.
   ======================================================================== */
router.get(
  "/attendance/report",
  branchOnly,
  requirePermission("attendance.view"),
  async (req, res) => {
    try {
      const employees = await branchEmployees(req);
      const numbers = new Set(employees.map((employee) => employee.employeeNumber.toUpperCase()));
      const report = await getAttendanceReport({
        organizationId: req.auth.organizationId,
        from: req.query.from,
        to: req.query.to,
        employeeNumber: req.query.employeeNumber,
      });
      const records = filterByEmployeeNumber(report.records, numbers);
      const totals = records.reduce(
        (acc, record) => {
          acc.records += 1;
          acc.lateMinutes += Number(record.lateMinutes || 0);
          acc.overtimeMinutes += Number(record.overtimeMinutes || 0);
          acc.byStatus[record.status] = (acc.byStatus[record.status] || 0) + 1;
          return acc;
        },
        { records: 0, lateMinutes: 0, overtimeMinutes: 0, byStatus: {} }
      );
      return res.json({
        status: "success",
        data: { ...report, totals, records, locationContext: branchContext(req) },
      });
    } catch (error) {
      console.error("Branch attendance report error:", error);
      return res.status(500).json({ status: "error", message: "Unable to load branch attendance report." });
    }
  }
);

router.get(
  "/attendance/shift-assignments",
  branchOnly,
  requirePermission("attendance.view"),
  async (req, res) => {
    try {
      const employees = await branchEmployees(req);
      const numbers = new Set(employees.map((employee) => employee.employeeNumber.toUpperCase()));
      const rows = await getShiftAssignments({
        organizationId: req.auth.organizationId,
        employeeNumber: req.query.employeeNumber,
      });
      return res.json({
        status: "success",
        data: filterByEmployeeNumber(rows, numbers),
        locationContext: branchContext(req),
      });
    } catch (error) {
      console.error("Branch shift assignment error:", error);
      return res.status(500).json({ status: "error", message: "Unable to load branch shift assignments." });
    }
  }
);

router.get(
  "/attendance/worked-hours",
  branchOnly,
  requirePermission("attendance.view"),
  async (req, res) => {
    try {
      const employees = await branchEmployees(req);
      const numbers = new Set(employees.map((employee) => employee.employeeNumber.toUpperCase()));
      const data = await getWorkedHours({
        organizationId: req.auth.organizationId,
        from: req.query.from,
        to: req.query.to,
        employeeNumber: req.query.employeeNumber,
      });
      const records = filterByEmployeeNumber(data.records, numbers);
      return res.json({
        status: "success",
        data: {
          records,
          totals: {
            workedHours: Math.round(records.reduce((sum, row) => sum + Number(row.netWorkedHours || 0), 0) * 100) / 100,
            workedDays: records.filter((row) => row.workedDay).length,
            recordCount: records.length,
          },
          locationContext: branchContext(req),
        },
      });
    } catch (error) {
      console.error("Branch worked hours error:", error);
      return res.status(500).json({ status: "error", message: "Unable to load branch worked hours." });
    }
  }
);

router.get(
  "/attendance/manual-payroll-inputs",
  branchOnly,
  requirePermission("attendance.view"),
  async (req, res) => {
    try {
      const employees = await branchEmployees(req);
      const numbers = new Set(employees.map((employee) => employee.employeeNumber.toUpperCase()));
      const rows = await listManualPayrollInputs({
        organizationId: req.auth.organizationId,
        from: req.query.from,
        to: req.query.to,
        employeeNumber: req.query.employeeNumber,
      });
      return res.json({
        status: "success",
        data: filterByEmployeeNumber(rows, numbers),
        locationContext: branchContext(req),
      });
    } catch (error) {
      console.error("Branch attendance payroll inputs error:", error);
      return res.status(500).json({ status: "error", message: "Unable to load branch attendance payroll inputs." });
    }
  }
);

for (const path of [
  "/attendance/records",
  "/attendance/shift-assignments",
  "/attendance/manual-payroll-inputs",
]) {
  router.post(path, branchOnly, async (req, res, next) => {
    try {
      await assertEmployeeNumberInBranch(req, req.body?.employeeNumber);
      return next();
    } catch (error) {
      if (handleScopeGuardError(res, error)) return;
      return next(error);
    }
  });
}

/* ========================================================================
   PAYROLL — employee/register views are branch scoped. The current payroll
   run model is organization-wide, so branch context is display-only and all
   state-changing run controls require HEAD OFFICE to avoid partial-company
   approval/recovery corruption.
   ======================================================================== */
router.get(
  "/payroll/readiness",
  branchOnly,
  requirePermission("payroll.view"),
  async (req, res) => {
    try {
      const data = await getPayrollReadiness({
        organizationId: req.auth.organizationId,
        locationId: req.auth.activeLocationId,
      });
      return res.json({ status: "success", data });
    } catch (error) {
      console.error("Branch payroll readiness error:", error);
      return res.status(500).json({ status: "error", message: "Unable to load branch payroll readiness." });
    }
  }
);

async function branchNumberSet(req) {
  const employees = await branchEmployees(req);
  return new Set(employees.map((employee) => employee.employeeNumber.toUpperCase()));
}

for (const [path, loader] of [
  ["/payroll/salary-rates", () => payroll.listSalaryRates],
  ["/payroll/salary-advances", () => payroll.listSalaryAdvances],
]) {
  router.get(path, branchOnly, requirePermission("payroll.view"), async (req, res) => {
    try {
      const numbers = await branchNumberSet(req);
      const rows = await loader()({ organizationId: req.auth.organizationId });
      return res.json({
        status: "success",
        data: filterByEmployeeNumber(rows, numbers),
        locationContext: branchContext(req),
      });
    } catch (error) {
      console.error("Branch payroll employee register error:", error);
      return res.status(500).json({ status: "error", message: "Unable to load branch payroll register." });
    }
  });
}

for (const [path, kind] of [
  ["/payroll/allowances", "ALLOWANCE"],
  ["/payroll/deductions", "DEDUCTION"],
]) {
  router.get(path, branchOnly, requirePermission("payroll.view"), async (req, res) => {
    try {
      const numbers = await branchNumberSet(req);
      const rows = await payroll.listComponents({
        organizationId: req.auth.organizationId,
        kind,
      });
      return res.json({
        status: "success",
        // Tenant-wide components with no employeeId apply to every branch and
        // remain visible. Employee-specific rows are limited to the branch.
        data: rows.filter(
          (row) => !row.employeeId || numbers.has(String(row.employeeNumber || "").toUpperCase())
        ),
        locationContext: branchContext(req),
      });
    } catch (error) {
      console.error("Branch payroll component register error:", error);
      return res.status(500).json({ status: "error", message: "Unable to load branch payroll components." });
    }
  });
}

router.get(
  "/payroll/paid-leave",
  branchOnly,
  requirePermission("payroll.view"),
  async (req, res) => {
    try {
      const numbers = await branchNumberSet(req);
      const rows = await payroll.listPaidLeave({
        organizationId: req.auth.organizationId,
        periodId: req.query?.periodId || null,
      });
      return res.json({
        status: "success",
        data: filterByEmployeeNumber(rows, numbers),
        locationContext: branchContext(req),
      });
    } catch (error) {
      console.error("Branch paid leave payroll error:", error);
      return res.status(500).json({ status: "error", message: "Unable to load branch paid leave." });
    }
  }
);

function mapMoneyRow(row) {
  return {
    ...row,
    employeeCount: Number(row.employeeCount || 0),
    grossTotal: Number(row.grossTotal || 0),
    deductionTotal: Number(row.deductionTotal || 0),
    netPreviewTotal: Number(row.netPreviewTotal || 0),
  };
}

router.get(
  "/payroll/runs",
  branchOnly,
  requirePermission("payroll.view"),
  async (req, res) => {
    try {
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
      return res.json({
        status: "success",
        data: rows.map(mapMoneyRow),
        locationContext: branchContext(req),
        control:
          "Branch totals are derived from the organization payroll run. Payroll submission/approval remains a Head Office control.",
      });
    } catch (error) {
      console.error("Branch payroll run register error:", error);
      return res.status(500).json({ status: "error", message: "Unable to load branch payroll runs." });
    }
  }
);

async function branchPayrollLines(req, runId = null, approvedOnly = false) {
  return prisma.$queryRawUnsafe(
    `SELECT pl."id",pl."runId",pl."employeeId",pl."employeeNumber",pl."employeeName",pl."currency",
            pl."baseSalary",pl."allowances",pl."deductions",pl."advanceRecovery",pl."loanRecovery",
            pl."grossPay",pl."netPreview",pl."statutoryStatus",pl."details",pl."createdAt",pl."updatedAt",
            pr."status" AS "runStatus",pr."approvedAt",pp."code" AS "periodCode",pp."name" AS "periodName",
            pp."periodStart",pp."periodEnd",pp."payDate"
       FROM "payroll_run_lines" pl
       JOIN "employees" e ON e."id"=pl."employeeId" AND e."organizationId"=pl."organizationId"
       JOIN "payroll_runs" pr ON pr."id"=pl."runId" AND pr."organizationId"=pl."organizationId"
       JOIN "payroll_periods" pp ON pp."id"=pr."periodId" AND pp."organizationId"=pr."organizationId"
      WHERE pl."organizationId"=$1 AND e."locationId"=$2
        AND ($3::text IS NULL OR pl."runId"=$3)
        AND ($4::boolean=FALSE OR pr."status"='APPROVED')
      ORDER BY pp."periodStart" DESC,pl."employeeNumber" ASC`,
    req.auth.organizationId,
    req.auth.activeLocationId,
    runId || null,
    Boolean(approvedOnly)
  );
}

for (const path of [
  "/payroll/runs/:id/lines",
  "/payroll/runs/:id/integrated-lines",
]) {
  router.get(path, branchOnly, requirePermission("payroll.view"), async (req, res) => {
    try {
      const rows = await branchPayrollLines(req, req.params.id, false);
      return res.json({ status: "success", data: rows, locationContext: branchContext(req) });
    } catch (error) {
      console.error("Branch payroll run lines error:", error);
      return res.status(500).json({ status: "error", message: "Unable to load branch payroll lines." });
    }
  });
}

router.get(
  "/payroll/payslips",
  branchOnly,
  requirePermission("payroll.view"),
  async (req, res) => {
    try {
      const rows = await branchPayrollLines(req, req.query?.runId || null, true);
      return res.json({
        status: "success",
        data: rows,
        locationContext: branchContext(req),
        control:
          "Payslips are generated from approved payroll and filtered to employees in the active branch.",
      });
    } catch (error) {
      console.error("Branch payslip error:", error);
      return res.status(500).json({ status: "error", message: "Unable to load branch payslips." });
    }
  }
);

router.get(
  "/payroll/approvals",
  branchOnly,
  requirePermission("payroll.view"),
  async (req, res) => {
    try {
      const rows = await prisma.$queryRawUnsafe(
        `SELECT DISTINCT pa."id",pa."runId",pp."code" AS "periodCode",pr."status" AS "runStatus",
                pa."action",pa."actorUserId",CONCAT_WS(' ',u."firstName",u."lastName") AS "actorName",
                u."email" AS "actorEmail",pa."notes",pa."createdAt"
           FROM "payroll_approvals" pa
           JOIN "payroll_runs" pr ON pr."id"=pa."runId" AND pr."organizationId"=pa."organizationId"
           JOIN "payroll_periods" pp ON pp."id"=pr."periodId" AND pp."organizationId"=pr."organizationId"
           JOIN "payroll_run_lines" pl ON pl."runId"=pr."id" AND pl."organizationId"=pr."organizationId"
           JOIN "employees" e ON e."id"=pl."employeeId" AND e."organizationId"=pl."organizationId"
           LEFT JOIN "users" u ON u."id"=pa."actorUserId"
          WHERE pa."organizationId"=$1 AND e."locationId"=$2
          ORDER BY pa."createdAt" DESC`,
        req.auth.organizationId,
        req.auth.activeLocationId
      );
      return res.json({ status: "success", data: rows, locationContext: branchContext(req) });
    } catch (error) {
      console.error("Branch payroll approval register error:", error);
      return res.status(500).json({ status: "error", message: "Unable to load branch payroll approvals." });
    }
  }
);

for (const path of [
  "/payroll/runs/draft",
  "/payroll/runs/:id/submit",
  "/payroll/runs/:id/decision",
  "/payroll/runs/:id/reopen",
]) {
  router.post(path, branchOnly, (req, res) =>
    headOfficeRequired(res, "Payroll calculation, submission or approval")
  );
}

router.post("/payroll/salary-rates", branchOnly, async (req, res, next) => {
  try {
    await assertEmployeeNumberInBranch(req, req.body?.employeeNumber);
    return next();
  } catch (error) {
    if (handleScopeGuardError(res, error)) return;
    return next(error);
  }
});

for (const path of [
  "/payroll/salary-rates/bulk/preview",
  "/payroll/salary-rates/bulk/import",
]) {
  router.post(path, branchOnly, (req, res) =>
    headOfficeRequired(res, "Payroll salary-rate bulk processing")
  );
}

router.patch("/payroll/salary-rates/:id/retire", branchOnly, async (req, res, next) => {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT sr."employeeId" FROM "payroll_salary_rates" sr
        WHERE sr."organizationId"=$1 AND sr."id"=$2 LIMIT 1`,
      req.auth.organizationId,
      req.params.id
    );
    if (!rows[0]) return next();
    await assertEmployeeIdInBranch(req, rows[0].employeeId);
    return next();
  } catch (error) {
    if (handleScopeGuardError(res, error)) return;
    return next(error);
  }
});

router.post("/payroll/salary-advances", branchOnly, async (req, res, next) => {
  try {
    await assertEmployeeNumberInBranch(req, req.body?.employeeNumber);
    return next();
  } catch (error) {
    if (handleScopeGuardError(res, error)) return;
    return next(error);
  }
});

router.patch("/payroll/salary-advances/:id/status", branchOnly, async (req, res, next) => {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT "employeeId" FROM "payroll_salary_advances"
        WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,
      req.auth.organizationId,
      req.params.id
    );
    if (!rows[0]) return next();
    await assertEmployeeIdInBranch(req, rows[0].employeeId);
    return next();
  } catch (error) {
    if (handleScopeGuardError(res, error)) return;
    return next(error);
  }
});

for (const path of ["/payroll/allowances", "/payroll/deductions"]) {
  router.post(path, branchOnly, async (req, res, next) => {
    try {
      if (!String(req.body?.employeeNumber || "").trim()) {
        return headOfficeRequired(res, "Organization-wide payroll component configuration");
      }
      await assertEmployeeNumberInBranch(req, req.body.employeeNumber);
      return next();
    } catch (error) {
      if (handleScopeGuardError(res, error)) return;
      return next(error);
    }
  });
}

router.patch("/payroll/components/:id/status", branchOnly, async (req, res, next) => {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT "employeeId" FROM "payroll_components"
        WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,
      req.auth.organizationId,
      req.params.id
    );
    if (!rows[0]) return next();
    if (!rows[0].employeeId) {
      return headOfficeRequired(res, "Organization-wide payroll component status changes");
    }
    await assertEmployeeIdInBranch(req, rows[0].employeeId);
    return next();
  } catch (error) {
    if (handleScopeGuardError(res, error)) return;
    return next(error);
  }
});

/* ========================================================================
   LOANS — workflowLocationId is authoritative for branch ownership.
   ======================================================================== */
router.get("/loans/employee-options", branchOnly, loanMayApply, async (req, res) => {
  try {
    const rows = await listLoanEmployeeOptions({
      organizationId: req.auth.organizationId,
      userId: req.auth.userId,
    });
    return res.json({
      status: "success",
      data: rows.filter((row) => row.locationId === req.auth.activeLocationId),
      locationContext: branchContext(req),
    });
  } catch (error) {
    console.error("Branch loan employee options error:", error);
    return res.status(500).json({ status: "error", message: "Unable to load branch loan employees." });
  }
});

async function branchLoans(req, options = {}) {
  const rows = await listVisibleLoans({
    organizationId: req.auth.organizationId,
    userId: req.auth.userId,
    status: options.status || null,
    employeeNumber: options.employeeNumber || null,
  });
  return rows.filter((row) => row.workflowLocationId === req.auth.activeLocationId);
}

router.get("/loans/summary", branchOnly, loanMayView, async (req, res) => {
  try {
    const loans = await branchLoans(req);
    const current = loans.filter((loan) => ["ACTIVE", "PAUSED"].includes(loan.status));
    return res.json({
      status: "success",
      data: {
        pendingApproval: loans.filter((loan) => ["PENDING_APPROVAL", "PENDING_HR_VERIFICATION", "PENDING_GM_APPROVAL"].includes(loan.status)).length,
        approvedAwaitingDisbursement: loans.filter((loan) => ["APPROVED", "GM_APPROVED", "AWAITING_DISBURSEMENT"].includes(loan.status)).length,
        activeLoans: loans.filter((loan) => loan.status === "ACTIVE").length,
        pausedLoans: loans.filter((loan) => loan.status === "PAUSED").length,
        borrowers: new Set(current.map((loan) => loan.employeeId)).size,
        outstandingBalance: current.reduce((sum, loan) => sum + Number(loan.outstandingAmount || 0), 0),
        totalPrincipal: loans.reduce((sum, loan) => sum + Number(loan.principalAmount || 0), 0),
        locationContext: branchContext(req),
      },
    });
  } catch (error) {
    console.error("Branch loan summary error:", error);
    return res.status(500).json({ status: "error", message: "Unable to load branch loan summary." });
  }
});

router.get("/loans/recoveries", branchOnly, loanMayView, async (req, res) => {
  try {
    const loans = await branchLoans(req);
    const ids = new Set(loans.map((loan) => loan.id));
    const rows = await listVisibleRecoveries({
      organizationId: req.auth.organizationId,
      userId: req.auth.userId,
      loanId: req.query?.loanId || null,
    });
    return res.json({
      status: "success",
      data: rows.filter((row) => ids.has(row.loanId)),
      locationContext: branchContext(req),
    });
  } catch (error) {
    console.error("Branch loan recoveries error:", error);
    return res.status(500).json({ status: "error", message: "Unable to load branch loan recoveries." });
  }
});

router.get("/loans/reports/export", branchOnly, loanMayView, async (req, res) => {
  try {
    const format = String(req.query?.format || "").trim().toLowerCase();
    if (!["xlsx", "csv", "pdf"].includes(format)) {
      return res.status(400).json({ status: "error", message: "Export format must be xlsx, csv or pdf." });
    }
    const loans = await branchLoans(req);
    const ids = new Set(loans.map((loan) => loan.id));
    const report = await getBulkLoanReport({ organizationId: req.auth.organizationId });
    const file = exportBulkLoans(report.filter((row) => ids.has(row.loanId)), format);
    res.setHeader("Content-Type", file.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${file.fileName}"`);
    res.setHeader("Cache-Control", "no-store");
    return res.send(file.buffer);
  } catch (error) {
    console.error("Branch loan export error:", error);
    return res.status(500).json({ status: "error", message: "Unable to export branch loan report." });
  }
});

router.get("/loans", branchOnly, loanMayView, async (req, res) => {
  try {
    const data = await branchLoans(req, {
      status: req.query?.status,
      employeeNumber: req.query?.employeeNumber,
    });
    return res.json({ status: "success", data, locationContext: branchContext(req) });
  } catch (error) {
    console.error("Branch loan list error:", error);
    return res.status(500).json({ status: "error", message: "Unable to load branch loans." });
  }
});

router.post("/loans/applications", branchOnly, async (req, res, next) => {
  try {
    await assertEmployeeNumberInBranch(req, req.body?.employeeNumber);
    return next();
  } catch (error) {
    if (handleScopeGuardError(res, error)) return;
    return next(error);
  }
});

router.use("/loans/:id", async (req, res, next) => {
  if (!req.auth.activeLocationId) return next();
  try {
    const loan = await assertLoanInBranch(req, req.params.id);
    if (!loan) return next();
    return next();
  } catch (error) {
    if (handleScopeGuardError(res, error)) return;
    return next(error);
  }
});

/* ========================================================================
   EMPLOYEE REPORTS — active branch overrides any user-supplied location.
   ======================================================================== */
router.get(
  "/employee-reports/workforce",
  branchOnly,
  requirePermission("employees.view", "reports.view"),
  async (req, res) => {
    try {
      const report = await getWorkforceReport({
        organizationId: req.auth.organizationId,
        filters: {
          ...(req.query || {}),
          locationId: req.auth.activeLocationId,
        },
      });
      if (String(req.query?.format || "").trim().toLowerCase() === "csv") {
        res.set({
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="chris-workforce-report.csv"',
        });
        return res.status(200).send(workforceReportToCsv(report));
      }
      return res.status(200).json({
        status: "success",
        results: report.employees.length,
        locationContext: branchContext(req),
        data: report,
      });
    } catch (error) {
      console.error("Branch workforce report error:", error);
      return res.status(500).json({ status: "error", message: "Unable to generate branch workforce report." });
    }
  }
);

router.get(
  "/employee-reports/employees/:employeeNumber/lifecycle",
  branchOnly,
  requirePermission("employees.view", "reports.view"),
  async (req, res) => {
    try {
      await assertEmployeeNumberInBranch(req, req.params.employeeNumber);
      const report = await getLifecycleReport({
        organizationId: req.auth.organizationId,
        employeeNumber: String(req.params.employeeNumber || "").trim(),
      });
      if (!report) return res.status(404).json({ status: "error", message: "Employee not found." });
      if (String(req.query?.format || "").trim().toLowerCase() === "csv") {
        res.set({
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="chris-${report.employee.employeeNumber}-lifecycle.csv"`,
        });
        return res.status(200).send(lifecycleReportToCsv(report));
      }
      return res.status(200).json({ status: "success", data: report, locationContext: branchContext(req) });
    } catch (error) {
      if (handleScopeGuardError(res, error)) return;
      console.error("Branch employee lifecycle report error:", error);
      return res.status(500).json({ status: "error", message: "Unable to generate branch lifecycle report." });
    }
  }
);

/* ========================================================================
   EXITS — employee exit registers and mutations follow the active branch.
   ======================================================================== */
router.get("/exits/register", branchOnly, requirePermission("employees.view"), async (req, res) => {
  try {
    const rows = await getExitRegister(prisma, req.auth.organizationId);
    return res.json({
      status: "success",
      data: rows.filter((row) => row.location?.id === req.auth.activeLocationId),
      locationContext: branchContext(req),
    });
  } catch (error) {
    console.error("Branch exit register error:", error);
    return res.status(500).json({ status: "error", message: "Unable to load branch exit register." });
  }
});

router.get("/exits", branchOnly, requirePermission("employees.view"), async (req, res) => {
  try {
    const data = await prisma.employeeExitProcess.findMany({
      where: {
        organizationId: req.auth.organizationId,
        employee: { is: { locationId: req.auth.activeLocationId } },
      },
      include: {
        employee: { include: { department: true, designation: true, location: true } },
        initiatedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        completedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: [{ status: "asc" }, { lastWorkingDay: "asc" }],
    });
    return res.json({ status: "success", data, locationContext: branchContext(req) });
  } catch (error) {
    console.error("Branch exits error:", error);
    return res.status(500).json({ status: "error", message: "Unable to load branch exits." });
  }
});

router.post("/exits", branchOnly, async (req, res, next) => {
  try {
    await assertEmployeeIdInBranch(req, req.body?.employeeId);
    return next();
  } catch (error) {
    if (handleScopeGuardError(res, error)) return;
    return next(error);
  }
});

router.use("/exits/:id", async (req, res, next) => {
  if (!req.auth.activeLocationId || req.params.id === "register") return next();
  try {
    const row = await prisma.employeeExitProcess.findFirst({
      where: { organizationId: req.auth.organizationId, id: req.params.id },
      select: { employeeId: true },
    });
    if (!row) return next();
    await assertEmployeeIdInBranch(req, row.employeeId);
    return next();
  } catch (error) {
    if (handleScopeGuardError(res, error)) return;
    return next(error);
  }
});

module.exports = router;
