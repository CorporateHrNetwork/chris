const express = require("express");
const prisma = require("../config/prisma");
const {
  requireAuth,
  requireAnyPermission,
} = require("../middleware/authMiddleware");
const workflow = require("../services/loanOriginationWorkflowService");

const router = express.Router();
router.use(requireAuth);

function branchOnly(req, res, next) {
  if (!req.auth?.activeLocationId) return next("route");
  return next();
}

function headOfficeRequired(res, operation) {
  return res.status(409).json({
    status: "error",
    code: "HEAD_OFFICE_REQUIRED_FOR_ORGANIZATION_CONTROL",
    message: `${operation} is organization-wide. Switch to HEAD OFFICE before performing this action.`,
  });
}

function outsideBranch(res, entityLabel) {
  return res.status(403).json({
    status: "error",
    code: "ENTITY_OUTSIDE_ACTIVE_BRANCH",
    message: `${entityLabel} does not belong to the active branch.`,
  });
}

async function branchEmployees(req) {
  return prisma.employee.findMany({
    where: {
      organizationId: req.auth.organizationId,
      locationId: req.auth.activeLocationId,
    },
    select: { id: true, employeeNumber: true },
  });
}

async function employeeIdBelongsToBranch(req, employeeId) {
  if (!employeeId) return false;
  const row = await prisma.employee.findFirst({
    where: {
      id: employeeId,
      organizationId: req.auth.organizationId,
    },
    select: { locationId: true },
  });
  return Boolean(row && row.locationId === req.auth.activeLocationId);
}

function wrapJsonFilter(res, filter) {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body && body.status !== "error" && Array.isArray(body.data)) {
      return originalJson({ ...body, data: body.data.filter(filter) });
    }
    return originalJson(body);
  };
}

// Onboarding status is employee transactional data. Templates/bank catalogues
// remain tenant configuration and are intentionally not branch-filtered.
router.get("/employees/onboarding/status", branchOnly, async (req, res, next) => {
  try {
    const employees = await branchEmployees(req);
    const ids = new Set(employees.map((row) => row.id));
    wrapJsonFilter(res, (record) => ids.has(record.employee?.id || record.employeeId));
    return next();
  } catch (error) {
    return next(error);
  }
});

// Any onboarding record addressed directly by ID must belong to the active branch.
router.use("/employees/onboarding/:id", async (req, res, next) => {
  if (!req.auth.activeLocationId) return next();
  const reserved = new Set(["templates", "status", "payment", "tasks"]);
  if (reserved.has(String(req.params.id || "").toLowerCase())) return next();
  try {
    const row = await prisma.employeeOnboarding.findFirst({
      where: { id: req.params.id, organizationId: req.auth.organizationId },
      select: { employeeId: true },
    });
    if (!row) return next();
    if (!(await employeeIdBelongsToBranch(req, row.employeeId))) {
      return outsideBranch(res, "This onboarding record");
    }
    return next();
  } catch (error) {
    return next(error);
  }
});

// Leave adjustment history follows the employee's current branch.
router.get("/leave/entitlements/adjustments", branchOnly, async (req, res, next) => {
  try {
    const employees = await branchEmployees(req);
    const numbers = new Set(employees.map((row) => row.employeeNumber.toUpperCase()));
    wrapJsonFilter(res, (row) =>
      numbers.has(String(row.employee?.employeeNumber || "").toUpperCase())
    );
    return next();
  } catch (error) {
    return next(error);
  }
});

// Organization-wide ZERMATT entitlement/carryover controls are not partial-branch
// actions. Branch context is read/operate on that branch; use HEAD OFFICE for
// tenant-wide year-end/provisioning controls.
router.post("/zermatt/leave-entitlements/apply", branchOnly, (req, res) =>
  headOfficeRequired(res, "ZERMATT leave entitlement provisioning")
);
router.get("/zermatt/leave-carryover/preview", branchOnly, (req, res) =>
  headOfficeRequired(res, "ZERMATT Annual Leave carryover preview")
);
router.post("/zermatt/leave-carryover/apply", branchOnly, (req, res) =>
  headOfficeRequired(res, "ZERMATT Annual Leave carryover")
);
router.post("/zermatt/leave-carryover/forfeit-expired", branchOnly, (req, res) =>
  headOfficeRequired(res, "ZERMATT Annual Leave carryover forfeiture")
);

// Salary-advance edit/cancel/delete endpoints live outside the standard payroll
// router, so protect the record itself here as well.
router.use("/payroll/salary-advances/:id", async (req, res, next) => {
  if (!req.auth.activeLocationId) return next();
  if (req.params.id === "control-capabilities") return next();
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT "employeeId" FROM "payroll_salary_advances"
        WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,
      req.auth.organizationId,
      req.params.id
    );
    if (!rows[0]) return next();
    if (!(await employeeIdBelongsToBranch(req, rows[0].employeeId))) {
      return outsideBranch(res, "This salary advance");
    }
    return next();
  } catch (error) {
    return next(error);
  }
});

// Attendance lifecycle edits addressed by assignment/input ID also inherit branch.
for (const [path, modelName] of [
  ["/attendance/shift-assignments/:id", "employeeShiftAssignment"],
  ["/attendance/manual-payroll-inputs/:id", "attendancePayrollInput"],
]) {
  router.use(path, async (req, res, next) => {
    if (!req.auth.activeLocationId) return next();
    try {
      const row = await prisma[modelName].findFirst({
        where: { id: req.params.id, organizationId: req.auth.organizationId },
        select: { employeeId: true },
      });
      if (!row) return next();
      if (!(await employeeIdBelongsToBranch(req, row.employeeId))) {
        return outsideBranch(res, "This attendance record");
      }
      return next();
    } catch (error) {
      return next(error);
    }
  });
}

// Branch-context employee exports must not silently expand back to all employees.
router.post("/employee-data/exports", branchOnly, (req, res, next) => {
  req.body = req.body || {};
  req.body.filters = {
    ...(req.body.filters || {}),
    locationId: req.auth.activeLocationId,
  };
  return next();
});

// Bulk employee import is capable of touching multiple branches; keep it Head Office.
router.post("/employee-data/bulk/preview", branchOnly, (req, res) =>
  headOfficeRequired(res, "Bulk employee import validation")
);
router.post("/employee-data/bulk/import", branchOnly, (req, res) =>
  headOfficeRequired(res, "Bulk employee import")
);

// Self-onboarding invitation location must equal the active branch.
router.post("/employee-data/invites", branchOnly, (req, res, next) => {
  req.body = req.body || {};
  if (req.body.locationId && req.body.locationId !== req.auth.activeLocationId) {
    return outsideBranch(res, "The selected invitation location");
  }
  req.body.locationId = req.auth.activeLocationId;
  return next();
});

// GM email-approval links must not jump the Super User into a loan owned by
// another branch while a branch context is selected.
router.get(
  "/loans/email-approval/:token",
  branchOnly,
  requireAnyPermission("loans.approve", "payroll.manage"),
  async (req, res, next) => {
    try {
      const data = await workflow.resolveEmailApprovalToken({
        organizationId: req.auth.organizationId,
        token: req.params.token,
        actorUserId: req.auth.userId,
      });
      const rows = await prisma.$queryRawUnsafe(
        `SELECT "workflowLocationId" FROM "payroll_loans"
          WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,
        req.auth.organizationId,
        data.loanId
      );
      if (rows[0] && rows[0].workflowLocationId !== req.auth.activeLocationId) {
        return outsideBranch(res, "This loan approval");
      }
      return next();
    } catch (error) {
      return next(error);
    }
  }
);

module.exports = router;
