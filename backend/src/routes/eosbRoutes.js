const express = require("express");
const {
  requireAuth,
  requireAnyPermission,
} = require("../middleware/authMiddleware");
const {
  getEosbStatement,
  listEosbAccounts,
  assessLoanCollateral,
} = require("../services/eosbService");
const { listLoanEmployeeOptions } = require("../services/loanWorkflowAccessService");

const router = express.Router();

function isHeadOfHr(req) {
  const roles = (req.auth?.roles || []).map((role) =>
    String(role || "").trim().toLowerCase().replace(/\s+/g, " ")
  );
  const accepted = new Set([
    "head hr/admin",
    "head of hr/admin",
    "head hr & admin",
    "head of hr & admin",
    "head hr and admin",
    "head of hr and admin",
  ]);
  return roles.some((role) => accepted.has(role));
}

function requireHeadOfHr(req, res, next) {
  if (!req.auth) return res.status(401).json({ status: "error", message: "Authentication required." });
  if (!isHeadOfHr(req)) {
    return res.status(403).json({
      status: "error",
      code: "EOSB_HEAD_HR_ONLY",
      message: "Organization-wide EoSB accounts are restricted to the Head of HR.",
    });
  }
  return next();
}

function canViewGratuity(req) {
  return isHeadOfHr(req) || (req.auth?.permissions || []).includes("benefits.gratuity.view");
}

// null is permitted only for a full-location Head HR. Assigned-location users
// receive an explicit allowlist, including [] when none is assigned.
function gratuityLocationIds(req) {
  if (isHeadOfHr(req) && req.auth?.locationScope === "ALL_LOCATIONS" && !req.auth?.activeLocationId) return null;
  const allowed = (req.auth?.availableLocations || []).map((item) => item.id).filter(Boolean);
  if (req.auth?.activeLocationId) return allowed.includes(req.auth.activeLocationId) ? [req.auth.activeLocationId] : [];
  return allowed;
}
function requireGratuityView(req, res, next) {
  if (!canViewGratuity(req)) return res.status(403).json({
    status: "error", code: "EOSB_GRATUITY_VIEW_DENIED",
    message: "Gratuity access must be granted by an authorized HR administrator.",
  });
  if (gratuityLocationIds(req)?.length === 0) return res.status(403).json({
    status: "error", code: "EOSB_BRANCH_REQUIRED",
    message: "No authorized branch has been assigned to this account.",
  });
  next();
}

function handleError(res, error, fallback) {
  console.error(fallback, error);
  return res.status(error.statusCode || 500).json({
    status: "error",
    code: error.code || "EOSB_ERROR",
    message: error.message || fallback,
    details: error.details,
  });
}

function csvEscape(value) {
  const string = String(value ?? "");
  return `"${string.replace(/"/g, '""')}"`;
}

async function requireLoanEmployeeScope(req, res, next) {
  try {
    const normalized = String(req.params.employeeNumber || "").trim().toUpperCase();
    const options = await listLoanEmployeeOptions({
      organizationId: req.auth.organizationId,
      userId: req.auth.userId,
    });
    if (!options.some((employee) => employee.employeeNumber === normalized)) {
      return res.status(403).json({
        status: "error",
        code: "LOAN_EMPLOYEE_LOCATION_ACCESS_DENIED",
        message: "The selected employee is outside your assigned loan-workflow location scope.",
      });
    }
    return next();
  } catch (error) {
    return handleError(res, error, "Unable to validate loan employee location scope.");
  }
}

router.use(requireAuth);

// Loan users receive only the selected employee collateral decision and only
// where that employee is inside the user's existing loan-workflow location scope.
router.get(
  "/collateral/:employeeNumber",
  requireAnyPermission("loans.apply", "loans.verify", "loans.approve", "payroll.manage"),
  requireLoanEmployeeScope,
  async (req, res) => {
    try {
      const requestedAmount = Number(req.query.requestedAmount || 0);
      const statement = await getEosbStatement({
        organizationId: req.auth.organizationId,
        employeeNumber: req.params.employeeNumber,
        asOf: req.query.asOf || new Date(),
      });
      if (requestedAmount > 0 && req.query.validate === "true") {
        const assessment = await assessLoanCollateral({
          organizationId: req.auth.organizationId,
          employeeNumber: req.params.employeeNumber,
          requestedAmount,
          suretyEmployeeNumber: req.query.suretyEmployeeNumber,
          asOf: req.query.asOf || new Date(),
        });
        return res.json({ status: "success", data: { statement, assessment } });
      }
      return res.json({ status: "success", data: { statement } });
    } catch (error) {
      return handleError(res, error, "Unable to assess EoSB loan collateral.");
    }
  }
);

// The EoSB register and individual statements are organization-wide sensitive benefit records.
router.get("/accounts", requireGratuityView, async (req, res) => {
  try {
    const accounts = await listEosbAccounts({
      organizationId: req.auth.organizationId,
      asOf: req.query.asOf || new Date(),
      locationIds: gratuityLocationIds(req),
    });
    return res.json({ status: "success", results: accounts.length, data: accounts });
  } catch (error) {
    return handleError(res, error, "Unable to load EoSB accounts.");
  }
});

router.get("/accounts/export.csv", requireGratuityView, async (req, res) => {
  try {
    const accounts = await listEosbAccounts({
      organizationId: req.auth.organizationId,
      asOf: req.query.asOf || new Date(),
      locationIds: gratuityLocationIds(req),
    });
    const header = [
      "Employee Number", "Employee Name", "Employment Type", "Status", "Branch", "Department", "Designation",
      "Service Start", "Calculation Date", "Service Days", "Equivalent Months", "Gross Monthly Salary",
      "Factor %", "EoSB Value", "Existing Loan Exposure", "Available Loan Collateral", "Collateral Mode", "Calculation Ready",
    ];
    const rows = accounts.map((account) => [
      account.employee.employeeNumber,
      account.employee.name,
      account.employee.employmentType,
      account.employee.status,
      account.employee.location,
      account.employee.department,
      account.employee.designation,
      account.service.serviceStartDate,
      account.service.calculationDate,
      account.service.serviceDays,
      account.service.equivalentMonths,
      account.salary?.grossMonthlySalary ?? "",
      account.policy.factorPercent,
      account.eosb.accruedValue,
      account.loanCollateral.existingLoanExposure,
      account.loanCollateral.availableCollateral,
      account.loanCollateral.mode,
      account.eosb.calculationReady ? "YES" : "NO",
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="CHRiS-Zermatt-EoSB-${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.status(200).send(`\uFEFF${csv}`);
  } catch (error) {
    return handleError(res, error, "Unable to export EoSB accounts.");
  }
});

router.get("/accounts/:employeeNumber", requireGratuityView, async (req, res) => {
  const locationIds = gratuityLocationIds(req);
  if (locationIds !== null) {
    const prisma = require("../config/prisma");
    const employee = await prisma.employee.findFirst({
      where: {
        organizationId: req.auth.organizationId,
        employeeNumber: String(req.params.employeeNumber || "").trim().toUpperCase(),
        locationId: { in: locationIds },
      },
      select: { id: true },
    });
    if (!employee) return res.status(404).json({
      status: "error", code: "EOSB_EMPLOYEE_NOT_IN_SCOPE",
      message: "Gratuity record not available in your authorized branch.",
    });
  }
  try {
    const statement = await getEosbStatement({
      organizationId: req.auth.organizationId,
      employeeNumber: req.params.employeeNumber,
      asOf: req.query.asOf || new Date(),
    });
    return res.json({ status: "success", data: statement });
  } catch (error) {
    return handleError(res, error, "Unable to load EoSB statement.");
  }
});

module.exports = router;
