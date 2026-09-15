const prisma = require("../config/prisma");

const HEAD_HR_ROLES = new Set([
  "HEAD HR",
  "HEAD OF HR",
  "HEAD_HR",
  "HEAD_HR_VERIFIER",
  "HEAD OF HUMAN RESOURCES",
  "HEAD OF HR & ADMIN",
  "HEAD OF HUMAN RESOURCES & ADMINISTRATION",
]);

const BRANCH_HR_ROLES = new Set([
  "HR & ADMIN OFFICER - BRANCH",
  "BRANCH HR & ADMIN OFFICER",
  "HR & ADMIN OFFICER",
  "HR AND ADMIN OFFICER",
]);

function normalizeRole(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, " ");
}

function accessError(code, message, statusCode = 403, details) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

function isZermatt(req) {
  return String(req.auth?.organization?.slug || "").trim().toLowerCase() === "zermatt-liquor-limited";
}

function roleSet(req) {
  return new Set((req.auth?.roles || []).map(normalizeRole));
}

function hasAnyRole(req, allowed) {
  const roles = roleSet(req);
  return [...allowed].some((role) => roles.has(role));
}

function isHeadHr(req) {
  if (!isZermatt(req)) return false;
  const permissions = new Set(req.auth?.permissions || []);
  return hasAnyRole(req, HEAD_HR_ROLES) || permissions.has("loans.verify");
}

function isBranchHr(req) {
  return isZermatt(req) && hasAnyRole(req, BRANCH_HR_ROLES);
}

function canManageEmployeeFinancialInputs(req) {
  const permissions = new Set(req.auth?.permissions || []);
  return permissions.has("payroll.manage") || isHeadHr(req) || isBranchHr(req);
}

function canManageLoans(req) {
  const permissions = new Set(req.auth?.permissions || []);
  return (
    permissions.has("payroll.manage") ||
    permissions.has("loans.verify") ||
    permissions.has("loans.apply") ||
    isHeadHr(req) ||
    isBranchHr(req)
  );
}

function canDeleteEmployeeFinancialInputs(req) {
  const permissions = new Set(req.auth?.permissions || []);
  return permissions.has("payroll.manage") || isHeadHr(req);
}

function requireEmployeeFinancialInputEditor(req, res, next) {
  if (!canManageEmployeeFinancialInputs(req)) {
    return res.status(403).json({
      status: "error",
      code: "HR_FINANCIAL_INPUT_EDIT_REQUIRED",
      message: "Only an authorized Branch HR & Admin Officer, Head of HR, or payroll administrator may maintain employee financial input data.",
    });
  }
  return next();
}

function requireLoanEditor(req, res, next) {
  if (!canManageLoans(req)) {
    return res.status(403).json({
      status: "error",
      code: "HR_LOAN_INPUT_EDIT_REQUIRED",
      message: "Only an authorized Branch HR & Admin Officer, Head of HR, or payroll administrator may maintain employee loan data.",
    });
  }
  return next();
}

function requireHeadHrFinancialControl(req, res, next) {
  if (!canDeleteEmployeeFinancialInputs(req)) {
    return res.status(403).json({
      status: "error",
      code: "HEAD_HR_FINANCIAL_CONTROL_REQUIRED",
      message: "This correction/delete control is restricted to the Head of HR or an authorized payroll administrator.",
    });
  }
  return next();
}

function allowedLocationIds(req) {
  return new Set((req.auth?.availableLocations || []).map((location) => location.id).filter(Boolean));
}

function assertLocationWithinAccess(req, locationId, label = "This employee") {
  if (req.auth?.locationScope === "ALL_LOCATIONS") return true;
  const allowed = allowedLocationIds(req);
  if (!locationId || !allowed.has(locationId)) {
    throw accessError("HR_FINANCIAL_LOCATION_ACCESS_DENIED", `${label} is outside your assigned branch/location scope.`);
  }
  if (req.auth?.activeLocationId && locationId !== req.auth.activeLocationId) {
    throw accessError("HR_FINANCIAL_ACTIVE_BRANCH_MISMATCH", `${label} does not belong to the active branch.`);
  }
  return true;
}

async function assertEmployeeNumberAccess({ req, employeeNumber, prismaClient = prisma }) {
  const normalized = String(employeeNumber || "").trim().toUpperCase();
  if (!normalized) throw accessError("EMPLOYEE_REQUIRED", "Employee is required.", 400);
  const employee = await prismaClient.employee.findFirst({
    where: { organizationId: req.auth.organizationId, employeeNumber: normalized },
    select: { id: true, employeeNumber: true, locationId: true, status: true },
  });
  if (!employee) throw accessError("EMPLOYEE_NOT_FOUND", `Employee ${normalized} was not found.`, 404);
  assertLocationWithinAccess(req, employee.locationId, `Employee ${employee.employeeNumber}`);
  return employee;
}

async function assertLoanRecordAccess({ req, loanId, prismaClient = prisma }) {
  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT l."id",l."workflowLocationId",l."employeeId",e."employeeNumber"
       FROM "payroll_loans" l
       JOIN "employees" e ON e."id"=l."employeeId" AND e."organizationId"=l."organizationId"
      WHERE l."organizationId"=$1 AND l."id"=$2 LIMIT 1`,
    req.auth.organizationId,
    loanId
  );
  const loan = rows[0];
  if (!loan) throw accessError("LOAN_NOT_FOUND", "Loan record not found.", 404);
  assertLocationWithinAccess(req, loan.workflowLocationId, `Loan ${loan.id}`);
  return loan;
}

async function assertSalaryAdvanceAccess({ req, advanceId, prismaClient = prisma }) {
  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT pa."id",pa."employeeId",e."employeeNumber",e."locationId"
       FROM "payroll_salary_advances" pa
       JOIN "employees" e ON e."id"=pa."employeeId" AND e."organizationId"=pa."organizationId"
      WHERE pa."organizationId"=$1 AND pa."id"=$2 LIMIT 1`,
    req.auth.organizationId,
    advanceId
  );
  const advance = rows[0];
  if (!advance) throw accessError("SALARY_ADVANCE_NOT_FOUND", "Salary advance not found.", 404);
  assertLocationWithinAccess(req, advance.locationId, `Salary advance for ${advance.employeeNumber}`);
  return advance;
}

async function assertSalaryRateAccess({ req, rateId, prismaClient = prisma }) {
  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT sr."id",sr."employeeId",e."employeeNumber",e."locationId"
       FROM "payroll_salary_rates" sr
       JOIN "employees" e ON e."id"=sr."employeeId" AND e."organizationId"=sr."organizationId"
      WHERE sr."organizationId"=$1 AND sr."id"=$2 LIMIT 1`,
    req.auth.organizationId,
    rateId
  );
  const rate = rows[0];
  if (!rate) throw accessError("SALARY_RATE_NOT_FOUND", "Salary rate not found.", 404);
  assertLocationWithinAccess(req, rate.locationId, `Salary rate for ${rate.employeeNumber}`);
  return rate;
}

function capabilitySnapshot(req) {
  const permissions = new Set(req.auth?.permissions || []);
  return {
    canManageEmployeeFinancialInputs: canManageEmployeeFinancialInputs(req),
    canManageLoans: canManageLoans(req),
    canDeleteEmployeeFinancialInputs: canDeleteEmployeeFinancialInputs(req),
    canBulkPayrollInputs: permissions.has("payroll.manage"),
    isHeadHr: isHeadHr(req),
    isBranchHr: isBranchHr(req),
    locationScope: req.auth?.locationScope || null,
    activeLocationId: req.auth?.activeLocationId || null,
    headOfficeConsolidated: Boolean(req.auth?.consolidatedHeadOffice),
  };
}

module.exports = {
  accessError,
  isZermatt,
  isHeadHr,
  isBranchHr,
  canManageEmployeeFinancialInputs,
  canManageLoans,
  canDeleteEmployeeFinancialInputs,
  requireEmployeeFinancialInputEditor,
  requireLoanEditor,
  requireHeadHrFinancialControl,
  assertEmployeeNumberAccess,
  assertLoanRecordAccess,
  assertSalaryAdvanceAccess,
  assertSalaryRateAccess,
  capabilitySnapshot,
};