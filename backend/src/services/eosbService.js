const prisma = require("../config/prisma");

const ZERMATT_SLUG = "zermatt-liquor-limited";
const GRATUITY_FACTOR = 0.075;
const FIXED_MONTH_DAYS = 30;
const CURRENT_STATUSES = new Set(["ACTIVE", "PROBATION", "LEAVE", "SUSPENDED"]);
const NON_EXPOSURE_LOAN_STATUSES = new Set(["COMPLETED", "CANCELLED", "REJECTED"]);

function eosbError(code, message, statusCode = 400, details) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

function text(value) { return String(value ?? "").trim(); }

function normalizeEmploymentType(value) {
  return text(value).toUpperCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function isFullTime(value) { return normalizeEmploymentType(value) === "FULL TIME"; }

function isSuretyOnlyType(value) {
  const type = normalizeEmploymentType(value);
  return ["INTERNSHIP", "INTERN", "INTERN TRAINEE", "EXPATRIATE", "PART TIME"].includes(type);
}

function dateOnly(value) {
  if (!value) return null;
  return new Date(value).toISOString().slice(0, 10);
}

function utcDate(value) {
  const raw = dateOnly(value);
  return raw ? new Date(`${raw}T00:00:00.000Z`) : null;
}

function serviceDaysBetween(startDate, endDate) {
  const start = utcDate(startDate);
  const end = utcDate(endDate);
  if (!start || !end || end < start) return 0;
  // Zermatt's approved Excel basis is the elapsed days between dates (end - start).
  return Math.floor((end.getTime() - start.getTime()) / 86400000);
}

function hasTwelveCalendarMonths(startDate, asOf) {
  const start = utcDate(startDate);
  const end = utcDate(asOf);
  if (!start || !end || end < start) return false;
  const anniversary = new Date(start.getTime());
  anniversary.setUTCFullYear(anniversary.getUTCFullYear() + 1);
  return end >= anniversary;
}

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function calculateEosbValue(grossMonthlySalary, serviceDays) {
  return roundMoney(Number(grossMonthlySalary || 0) * (Number(serviceDays || 0) / FIXED_MONTH_DAYS) * GRATUITY_FACTOR);
}

function employeeName(row) { return [row.firstName, row.middleName, row.lastName].filter(Boolean).join(" "); }

function effectiveAsOf(employee, requestedAsOf = new Date()) {
  const requested = utcDate(requestedAsOf) || utcDate(new Date());
  const exit = utcDate(employee.exitDate);
  return exit && exit < requested ? exit : requested;
}

async function resolveOrganization(client, organizationId) {
  const organization = await client.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true, slug: true },
  });
  if (!organization) throw eosbError("ORGANIZATION_NOT_FOUND", "Organization not found.", 404);
  if (organization.slug !== ZERMATT_SLUG) {
    throw eosbError("EOSB_POLICY_NOT_CONFIGURED", "EoSB policy is not configured for this organization.", 409);
  }
  return organization;
}

const employeeSelect = {
  id: true,
  employeeNumber: true,
  firstName: true,
  middleName: true,
  lastName: true,
  employmentType: true,
  status: true,
  hireDate: true,
  exitDate: true,
  department: { select: { id: true, name: true } },
  designation: { select: { id: true, name: true } },
  location: { select: { id: true, name: true, code: true } },
  employmentEpisodes: {
    orderBy: [{ sequenceNumber: "desc" }],
    take: 1,
    select: { startDate: true, endDate: true, sequenceNumber: true },
  },
};

async function resolveEmployee(client, organizationId, employeeNumber) {
  const normalized = text(employeeNumber).toUpperCase();
  if (!normalized) throw eosbError("EMPLOYEE_REQUIRED", "Employee Number is required.");
  const employee = await client.employee.findFirst({
    where: { organizationId, employeeNumber: normalized },
    select: employeeSelect,
  });
  if (!employee) throw eosbError("EMPLOYEE_NOT_FOUND", `Employee ${normalized} was not found.`, 404);
  return employee;
}

async function grossSalaryRates(client, organizationId, employeeId = null) {
  const employeeClause = employeeId ? ` AND "employeeId"=$2` : "";
  const params = employeeId ? [organizationId, employeeId] : [organizationId];
  return client.$queryRawUnsafe(
    `SELECT "employeeId","amount","currency","effectiveFrom","effectiveTo","status","createdAt"
       FROM "payroll_salary_rates"
      WHERE "organizationId"=$1${employeeClause}
        AND "status" IN ('ACTIVE','RETIRED')
      ORDER BY "employeeId" ASC,"effectiveFrom" DESC,"createdAt" DESC`,
    ...params
  );
}

function salaryRateForDate(rates, employeeId, asOf) {
  const target = utcDate(asOf);
  if (!target) return null;
  return (rates || []).find((rate) => {
    if (rate.employeeId !== employeeId) return false;
    const start = utcDate(rate.effectiveFrom);
    const end = utcDate(rate.effectiveTo);
    return start && start <= target && (!end || end >= target);
  }) || null;
}

async function loanExposureRows(client, organizationId, employeeId = null) {
  const employeeClause = employeeId ? ` AND "employeeId"=$2` : "";
  const params = employeeId ? [organizationId, employeeId] : [organizationId];
  return client.$queryRawUnsafe(
    `SELECT "employeeId","status","outstandingAmount","principalAmount"
       FROM "payroll_loans"
      WHERE "organizationId"=$1${employeeClause}`,
    ...params
  );
}

function exposureFor(rows, employeeId) {
  return roundMoney((rows || []).reduce((sum, row) => {
    if (row.employeeId !== employeeId) return sum;
    if (NON_EXPOSURE_LOAN_STATUSES.has(String(row.status || "").toUpperCase())) return sum;
    return sum + Math.max(Number(row.outstandingAmount ?? row.principalAmount ?? 0), 0);
  }, 0));
}

function serviceStartFor(employee) {
  return employee.employmentEpisodes?.[0]?.startDate || employee.hireDate || null;
}

function eligibilityFor(employee, startDate, calculationDate) {
  const type = normalizeEmploymentType(employee.employmentType);
  if (!isFullTime(type)) {
    return {
      eosbEligible: false,
      loanCollateralMode: "SURETY_REQUIRED",
      reason: isSuretyOnlyType(type)
        ? `${employee.employmentType || "This employment type"} requires internal surety for loan access.`
        : "Only Full-Time employees accrue Zermatt EoSB.",
    };
  }
  if (!hasTwelveCalendarMonths(startDate, calculationDate)) {
    return {
      eosbEligible: true,
      loanCollateralMode: "SURETY_REQUIRED",
      reason: "Full-Time employees below 12 calendar months of service require internal surety for loan access.",
    };
  }
  return { eosbEligible: true, loanCollateralMode: "EOSB", reason: null };
}

function buildStatement({ organization, employee, asOf, salaryRate, exposure }) {
  const calculationDate = effectiveAsOf(employee, asOf);
  const startDate = serviceStartFor(employee);
  const serviceDays = serviceDaysBetween(startDate, calculationDate);
  const eligibility = eligibilityFor(employee, startDate, calculationDate);
  const grossMonthlySalary = salaryRate ? Number(salaryRate.amount || 0) : null;
  const calculationReady = Boolean(startDate && salaryRate && grossMonthlySalary > 0);
  const accruedEosb = calculationReady && eligibility.eosbEligible
    ? calculateEosbValue(grossMonthlySalary, serviceDays)
    : 0;
  const availableCollateral = eligibility.loanCollateralMode === "EOSB"
    ? Math.max(roundMoney(accruedEosb - exposure), 0)
    : 0;

  return {
    policy: {
      name: "Zermatt End of Service Benefit (EoSB)",
      calculationBasis: "FIXED_30_DAY_MONTH",
      factorRate: GRATUITY_FACTOR,
      factorPercent: 7.5,
      fixedMonthDays: FIXED_MONTH_DAYS,
      loanServiceThreshold: "12_CALENDAR_MONTHS",
      formula: "Gross Monthly Salary × (Actual Service Days ÷ 30) × 7.5%",
    },
    organization: { id: organization.id, name: organization.name },
    employee: {
      id: employee.id,
      employeeNumber: employee.employeeNumber,
      name: employeeName(employee),
      employmentType: employee.employmentType,
      status: employee.status,
      department: employee.department?.name || null,
      designation: employee.designation?.name || null,
      location: employee.location?.name || null,
      locationCode: employee.location?.code || null,
    },
    service: {
      serviceStartDate: dateOnly(startDate),
      calculationDate: dateOnly(calculationDate),
      exitDate: dateOnly(employee.exitDate),
      serviceDays,
      equivalentMonths: Math.round((serviceDays / FIXED_MONTH_DAYS) * 10000) / 10000,
      twelveCalendarMonthsCompleted: hasTwelveCalendarMonths(startDate, calculationDate),
    },
    salary: salaryRate ? {
      grossMonthlySalary,
      currency: salaryRate.currency || "NGN",
      effectiveFrom: dateOnly(salaryRate.effectiveFrom),
      effectiveTo: dateOnly(salaryRate.effectiveTo),
    } : null,
    eosb: {
      eligible: eligibility.eosbEligible,
      calculationReady,
      accruedValue: accruedEosb,
      missingReason: !startDate
        ? "Employment service start date is unavailable."
        : !salaryRate
          ? "No effective-dated Monthly Gross Salary is available for the calculation date."
          : null,
    },
    loanCollateral: {
      mode: eligibility.loanCollateralMode,
      reason: eligibility.reason,
      grossEosbValue: accruedEosb,
      existingLoanExposure: exposure,
      availableCollateral,
    },
  };
}

async function getEosbStatement({ organizationId, employeeNumber, asOf = new Date(), excludeLoanId = null, prismaClient = prisma }) {
  const organization = await resolveOrganization(prismaClient, organizationId);
  const employee = await resolveEmployee(prismaClient, organizationId, employeeNumber);
  const calculationDate = effectiveAsOf(employee, asOf);
  const [rates, loans] = await Promise.all([
    grossSalaryRates(prismaClient, organizationId, employee.id),
    loanExposureRows(prismaClient, organizationId, employee.id),
  ]);
  const statement = buildStatement({ organization, employee, asOf, salaryRate: salaryRateForDate(rates, employee.id, calculationDate), exposure: exposureFor(loans, employee.id) });
  const guarantees = await suretyCommitments(prismaClient, organizationId, employee.employeeNumber, excludeLoanId);
  const reserved = roundMoney(guarantees.reduce((sum, row) => sum + Math.min(Number(row.assessment?.surety?.coveredAmount || 0), Number(row.outstandingAmount || 0)), 0));
  statement.loanCollateral.existingSuretyExposure = reserved;
  statement.loanCollateral.availableCollateral = Math.max(roundMoney(statement.loanCollateral.availableCollateral - reserved), 0);
  return statement;
}

async function listEosbAccounts({ organizationId, asOf = new Date(), prismaClient = prisma }) {
  const organization = await resolveOrganization(prismaClient, organizationId);
  const [employees, rates, loans] = await Promise.all([
    prismaClient.employee.findMany({ where: { organizationId }, select: employeeSelect, orderBy: { employeeNumber: "asc" } }),
    grossSalaryRates(prismaClient, organizationId),
    loanExposureRows(prismaClient, organizationId),
  ]);
  return employees.map((employee) => {
    const calculationDate = effectiveAsOf(employee, asOf);
    return buildStatement({
      organization,
      employee,
      asOf,
      salaryRate: salaryRateForDate(rates, employee.id, calculationDate),
      exposure: exposureFor(loans, employee.id),
    });
  });
}

// Latest collateral evidence per live loan is authoritative; paid-off loans release
// the reservation. Historical audit events remain immutable.
async function suretyCommitments(client, organizationId, employeeNumber, excludeLoanId = null) {
  return client.$queryRawUnsafe(
    `SELECT l."id",l."outstandingAmount",c.assessment
       FROM "payroll_loans" l
       JOIN LATERAL (
         SELECT COALESCE(a."newValue"->'collateral',a."newValue") AS assessment
         FROM "organization_audits" a
         WHERE a."organizationId"=l."organizationId" AND a."entityId"=l."id"
           AND a."entityType" IN ('LoanCollateral','PayrollLoan')
           AND (a."newValue" ? 'collateral' OR a."entityType"='LoanCollateral')
         ORDER BY a."createdAt" DESC,a."id" DESC LIMIT 1
       ) c ON TRUE
       WHERE l."organizationId"=$1 AND ($3::text IS NULL OR l."id"<>$3)
         AND l."status" NOT IN ('COMPLETED','CANCELLED','REJECTED')
         AND l."outstandingAmount">0
         AND c.assessment->'surety'->>'employeeNumber'=$2`,
    organizationId, employeeNumber, excludeLoanId
  );
}

async function assessLoanCollateral({ organizationId, employeeNumber, requestedAmount, suretyEmployeeNumber, excludeLoanId = null, asOf = new Date(), prismaClient = prisma }) {
  const amount = Number(requestedAmount || 0);
  if (!Number.isFinite(amount) || amount <= 0) throw eosbError("INVALID_LOAN_AMOUNT", "Requested loan amount must be greater than zero.");
  const statement = await getEosbStatement({ organizationId, employeeNumber, asOf, prismaClient });
  let ownExposure = 0;
  if (excludeLoanId) {
    const rows = await prismaClient.$queryRawUnsafe(`SELECT "outstandingAmount" FROM "payroll_loans" WHERE "organizationId"=$1 AND "id"=$2 AND "employeeId"=$3`, organizationId, excludeLoanId, statement.employee.id);
    ownExposure = Math.max(Number(rows[0]?.outstandingAmount || 0), 0);
  }
  const available = statement.loanCollateral.mode === "EOSB" && statement.eosb.calculationReady
    ? Math.max(roundMoney(statement.loanCollateral.grossEosbValue - Math.max(statement.loanCollateral.existingLoanExposure - ownExposure, 0) - statement.loanCollateral.existingSuretyExposure), 0) : 0;
  const shortfall = Math.max(roundMoney(amount - available), 0);
  const base = { ...statement.loanCollateral, availableCollateral: available, requestedAmount: roundMoney(amount), applicantCoveredAmount: roundMoney(amount - shortfall), shortfall, approvedByRule: true };
  if (!shortfall) return { ...base, surety: null };
  const suretyNumber = text(suretyEmployeeNumber).toUpperCase();
  if (!suretyNumber) throw eosbError("LOAN_SURETY_REQUIRED", `A qualifying employee surety is required to cover the shortfall of ${shortfall.toFixed(2)}.`, 409, { shortfall });
  if (suretyNumber === statement.employee.employeeNumber) throw eosbError("LOAN_SELF_SURETY_NOT_ALLOWED", "An employee cannot act as their own loan surety.", 409);
  const surety = await resolveEmployee(prismaClient, organizationId, suretyNumber);
  if (!CURRENT_STATUSES.has(String(surety.status || "").toUpperCase())) throw eosbError("LOAN_SURETY_NOT_CURRENT", "Select a current employee as surety.", 409);
  const expatriate = normalizeEmploymentType(surety.employmentType) === "EXPATRIATE";
  if (!expatriate && !isFullTime(surety.employmentType)) throw eosbError("LOAN_SURETY_TYPE_INELIGIBLE", "Only full-time or expatriate employees may act as sureties.", 409);
  if ((await suretyCommitments(prismaClient, organizationId, suretyNumber, excludeLoanId)).length) throw eosbError("LOAN_SURETY_ALREADY_COMMITTED", "This employee already guarantees an outstanding loan. Only one loan may be guaranteed until it is fully repaid.", 409);
  let suretyAvailable = null;
  if (!expatriate) {
    const cover = await getEosbStatement({ organizationId, employeeNumber: suretyNumber, asOf, excludeLoanId, prismaClient });
    suretyAvailable = Number(cover.loanCollateral.availableCollateral || 0);
    if (!cover.eosb.eligible || !cover.eosb.calculationReady || cover.loanCollateral.mode !== "EOSB" || suretyAvailable < shortfall) throw eosbError("LOAN_SURETY_COLLATERAL_INSUFFICIENT", "The full-time surety must be EoSB eligible with sufficient available EoSB to cover the shortfall.", 409, { shortfall, availableCollateral: suretyAvailable });
  }
  return { ...base, surety: { employeeId: surety.id, employeeNumber: surety.employeeNumber, name: employeeName(surety), employmentType: surety.employmentType, eosbExempt: expatriate, availableCollateral: suretyAvailable, coveredAmount: shortfall } };
}

module.exports = {
  GRATUITY_FACTOR,
  FIXED_MONTH_DAYS,
  serviceDaysBetween,
  calculateEosbValue,
  getEosbStatement,
  listEosbAccounts,
  assessLoanCollateral,
};
