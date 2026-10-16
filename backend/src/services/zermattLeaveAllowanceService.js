const prisma = require("../config/prisma");
const { getSettings } = require("./zermattLeaveAllowanceSettingsService");

function calculateStructure(gross, structure) {
  const entries = Object.entries(structure || {});
  const totalPercent = round2(entries.reduce((sum, [, rate]) => sum + Number(rate || 0), 0));
  if (Math.abs(totalPercent - 100) > 0.001) {
    const error = new Error(`Payroll salary structure must total 100%; configured total is ${totalPercent}%.`);
    error.code = "INVALID_SALARY_STRUCTURE";
    error.statusCode = 409;
    throw error;
  }
  const amounts = {};
  let assigned = 0;
  entries.forEach(([key, rate], index) => {
    const value = index === entries.length - 1 ? round2(gross - assigned) : round2(gross * Number(rate || 0) / 100);
    amounts[key] = value;
    assigned = round2(assigned + value);
  });
  return amounts;
}

function text(value) {
  return String(value ?? "").trim();
}

async function getActivePolicy({ organizationId, asOf, prismaClient = prisma }) {
  const effectiveDate = text(asOf) || new Date().toISOString().slice(0, 10);
  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT *
       FROM "payroll_policy_versions"
      WHERE "organizationId"=$1
        AND "status"='ACTIVE'
        AND "effectiveFrom" <= $2::date
        AND ("effectiveTo" IS NULL OR "effectiveTo" >= $2::date)
      ORDER BY "effectiveFrom" DESC, "versionNumber" DESC
      LIMIT 1`,
    organizationId,
    effectiveDate
  );
  const row = rows[0];
  if (!row) return null;
  return { ...row, salaryStructure: jsonValue(row.salaryStructure, {}) };
}

const ZERMATT_SLUG = "zermatt-liquor-limited";
const BENEFIT_CODE = "ZERMATT_LEAVE_ALLOWANCE";
const ELIGIBLE_EMPLOYMENT_TYPE = "Full-Time";
const LEAVE_ALLOWANCE_RATE = 10;
const POLICY_MODE = "CURRENT_MONTH_SALARY_FORMULA";
const SALARY_BASIS = "CURRENT_MONTH_GROSS_AND_BASIC";
const PAYMENT_TIMING = "EMPLOYEE_ENTRY_MONTH_AFTER_QUALIFYING_SERVICE";

function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}
function dateText(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : null;
}
function jsonValue(value, fallback = {}) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return fallback; }
}
function anniversaryForYear(hireDate, year) {
  const hire = new Date(hireDate);
  if (Number.isNaN(hire.getTime())) return null;
  const month = hire.getUTCMonth();
  const day = hire.getUTCDate();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay)));
}

function eligibilityForPeriod({ hireDate, periodStart, periodEnd, employmentType }) {
  if (employmentType !== ELIGIBLE_EMPLOYMENT_TYPE) {
    return { eligible: false, reason: "EMPLOYMENT_TYPE_NOT_ELIGIBLE", requiredEmploymentType: ELIGIBLE_EMPLOYMENT_TYPE };
  }
  if (!hireDate || !periodStart || !periodEnd) return { eligible: false, reason: "HIRE_DATE_REQUIRED" };
  const hire = new Date(hireDate);
  const end = new Date(`${dateText(periodEnd)}T23:59:59.999Z`);
  if ([hire, end].some((value) => Number.isNaN(value.getTime()))) return { eligible: false, reason: "INVALID_DATE" };

  const payrollYear = end.getUTCFullYear();
  const hireYear = hire.getUTCFullYear();
  const hireMonth = hire.getUTCMonth();
  const payrollMonth = end.getUTCMonth();
  const anniversary = anniversaryForYear(hire, payrollYear);
  const firstEligibleYear = hireYear + 1;
  const eligible = payrollYear >= firstEligibleYear && payrollMonth === hireMonth && anniversary && anniversary <= end;
  return {
    eligible: Boolean(eligible),
    reason: eligible ? "FULL_TIME_ANNUAL_ENTRY_MONTH_AFTER_FIRST_SERVICE_YEAR" : "NOT_DUE_THIS_PERIOD",
    entitlementYear: payrollYear,
    anniversaryDate: anniversary ? anniversary.toISOString().slice(0, 10) : null,
    firstEligibleYear,
    requiredEmploymentType: ELIGIBLE_EMPLOYMENT_TYPE,
  };
}

function calculateLeaveAllowance({ monthlyGross, monthlyBasic, referenceMonthlyGross, scheduledMonthlyGross, salaryStructure }) {
  const gross = round2(monthlyGross ?? referenceMonthlyGross ?? scheduledMonthlyGross ?? 0);
  const structure = calculateStructure(gross, salaryStructure || {});
  const basic = round2(monthlyBasic ?? structure.basic ?? 0);
  const annualBasicSalary = round2(basic * 12);
  const leaveAllowance = round2(annualBasicSalary * LEAVE_ALLOWANCE_RATE / 100);
  return {
    monthlyGrossSalary: gross,
    monthlyBasicSalary: basic,
    annualBasicSalary,
    leaveAllowance,
    ratePercent: LEAVE_ALLOWANCE_RATE,
    formula: "Monthly Basic Salary × 12 × 10%",
    salaryBasis: SALARY_BASIS,
    contractualStructure: structure,
  };
}

async function assertZermatt(client, organizationId) {
  const organization = await client.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, slug: true, name: true, currency: true },
  });
  if (!organization || organization.slug !== ZERMATT_SLUG) {
    const error = new Error("ZERMATT_LEAVE_ALLOWANCE_TENANT_ONLY");
    error.code = "ZERMATT_LEAVE_ALLOWANCE_TENANT_ONLY";
    error.statusCode = 404;
    throw error;
  }
  return organization;
}

async function getReferenceSalary({ organizationId, employeeId, asOfDate, prismaClient = prisma }) {
  const asOf = new Date(asOfDate);
  if (Number.isNaN(asOf.getTime())) return null;
  const maxReferenceYear = asOf.getUTCFullYear() - 1;
  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT "id","employeeId","employeeNumber","applicableMonth","referenceDecemberYear",
            "referenceDecemberGross","leaveAllowanceAmount","sourceFileName","sourceRowNumber"
       FROM "zermatt_leave_allowance_references"
      WHERE "organizationId"=$1 AND "employeeId"=$2 AND "status"='ACTIVE'
        AND "referenceDecemberYear"<=$3
      ORDER BY "referenceDecemberYear" DESC,"updatedAt" DESC
      LIMIT 1`,
    organizationId,
    employeeId,
    maxReferenceYear
  );
  return rows[0] || null;
}

async function paidEntitlementKeys(client, organizationId, runId, excludeRunIds = []) {
  const excluded = [runId, ...excludeRunIds].filter(Boolean);
  const rows = await client.$queryRawUnsafe(
    `SELECT pl."employeeId", pl."details"->'leaveAllowance'->>'entitlementYear' AS "entitlementYear"
       FROM "payroll_run_lines" pl
       JOIN "payroll_runs" pr ON pr."id"=pl."runId" AND pr."organizationId"=pl."organizationId"
      WHERE pl."organizationId"=$1 AND pr."status"='APPROVED'
        AND NOT (pl."runId" = ANY($2::text[]))
        AND pl."details" ? 'leaveAllowance'`,
    organizationId,
    excluded
  );
  return new Set(rows.map((row) => `${row.employeeId}:${row.entitlementYear}`));
}

async function applyZermattLeaveAllowanceToDraft({ organizationId, actorUserId, runId, periodId, excludeApprovedRunIds = [], prismaClient = prisma }) {
  const organization = await assertZermatt(prismaClient, organizationId);
  const periodRows = await prismaClient.$queryRawUnsafe(
    `SELECT "id","code","periodStart","periodEnd","payDate" FROM "payroll_periods"
      WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,
    organizationId,
    periodId
  );
  const period = periodRows[0];
  if (!period) {
    const error = new Error("Payroll period not found.");
    error.code = "PAYROLL_PERIOD_NOT_FOUND";
    error.statusCode = 404;
    throw error;
  }
  const policy = await getActivePolicy({ organizationId, asOf: dateText(period.periodEnd), prismaClient });
  if (!policy) {
    const error = new Error("No active Nigeria payroll policy covers this payroll period.");
    error.code = "PAYROLL_POLICY_NOT_CONFIGURED";
    error.statusCode = 409;
    throw error;
  }

  const settings = await getSettings(prismaClient, organizationId);
  const beneficiaries = [];

  await prismaClient.$transaction(async (tx) => {
    const runs = await tx.$queryRawUnsafe(
      `SELECT "status","periodId" FROM "payroll_runs"
        WHERE "organizationId"=$1 AND "id"=$2 FOR UPDATE`,
      organizationId, runId
    );
    if (runs[0]?.status !== "DRAFT" || runs[0]?.periodId !== periodId) {
      const error = new Error("Leave Allowance can only update a draft in the selected payroll period.");
      error.code = "LEAVE_ALLOWANCE_DRAFT_REQUIRED";
      error.statusCode = 409;
      throw error;
    }
    const lineRows = await tx.$queryRawUnsafe(
      `SELECT pl.*,e."hireDate",e."locationId",e."status" AS "employeeStatus",e."employmentType"
         FROM "payroll_run_lines" pl
         JOIN "employees" e ON e."id"=pl."employeeId" AND e."organizationId"=pl."organizationId"
        WHERE pl."organizationId"=$1 AND pl."runId"=$2 ORDER BY pl."employeeNumber"`,
      organizationId,
      runId
    );
    const alreadyPaid = await paidEntitlementKeys(tx, organizationId, runId, excludeApprovedRunIds);
    for (const row of lineRows) {
      const details = jsonValue(row.details, {});
      const previousAllowance = round2(details.leaveAllowance?.amount || details.leaveAllowance?.value || 0);
      const baseNet = round2(row.netPreview - previousAllowance);
      const eligibility = eligibilityForPeriod({
        hireDate: row.hireDate,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        employmentType: row.employmentType,
      });
      const calculation = eligibility.eligible
        ? calculateLeaveAllowance({
            monthlyGross: row.grossPay,
            monthlyBasic: details.salaryStructure?.basic,
            salaryStructure: policy.salaryStructure,
          })
        : null;
      const entitlementKey = eligibility.entitlementYear ? `${row.employeeId}:${eligibility.entitlementYear}` : null;
      const amount = settings.enabled && entitlementKey && !alreadyPaid.has(entitlementKey) ? round2(calculation?.leaveAllowance || 0) : 0;
      // Remove the previous value before applying the newly calculated amount.
      // Repeating a calculation is stable; changed eligibility/payment removes stale benefits.
      const effectiveAmount = amount;

      const benefitEarnings = Array.isArray(details.benefitEarnings)
        ? details.benefitEarnings.filter((item) => item?.code !== BENEFIT_CODE)
        : [];
      const nextDetails = {
        ...details,
        benefitEarnings,
        leaveAllowancePolicy: {
          mode: POLICY_MODE,
          formula: "Monthly Basic Salary × 12 × 10%",
          salaryBasis: SALARY_BASIS,
          paymentTiming: PAYMENT_TIMING,
          status: amount > 0 ? "CURRENT_MONTH_SALARY_APPLIED" : "NOT_DUE_OR_ALREADY_PAID",
        },
      };
      delete nextDetails.leaveAllowance;

      if (effectiveAmount > 0) {
        const leaveAllowance = {
          code: BENEFIT_CODE,
          name: "Leave Allowance",
          module: "BENEFITS",
          benefitType: "LEAVE_ALLOWANCE",
          employmentType: row.employmentType,
          amount: effectiveAmount,
          value: effectiveAmount,
          monthlyGrossSalary: calculation.monthlyGrossSalary,
          monthlyBasicSalary: calculation.monthlyBasicSalary,
          annualBasicSalary: calculation.annualBasicSalary,
          ratePercent: LEAVE_ALLOWANCE_RATE,
          formula: calculation.formula,
          hireDate: dateText(row.hireDate),
          anniversaryDate: eligibility.anniversaryDate,
          entitlementYear: eligibility.entitlementYear,
          payrollPeriodId: period.id,
          payrollPeriodCode: period.code,
          taxable: false,
          payrollTreatment: "AFTER_TAX",
          payeImpact: 0,
          source: "ZERMATT_CURRENT_MONTH_SALARY_FORMULA",
        };
        nextDetails.leaveAllowance = leaveAllowance;
        nextDetails.benefitEarnings = [...benefitEarnings, leaveAllowance];
        beneficiaries.push({ employeeId: row.employeeId, employeeNumber: row.employeeNumber, employeeName: row.employeeName, ...leaveAllowance });
      }

      await tx.$executeRawUnsafe(
        `UPDATE "payroll_run_lines"
            SET "netPreview"=$4,"details"=$5::jsonb,"updatedAt"=CURRENT_TIMESTAMP
          WHERE "organizationId"=$1 AND "runId"=$2 AND "id"=$3`,
        organizationId,
        runId,
        row.id,
        round2(baseNet + effectiveAmount),
        JSON.stringify(nextDetails)
      );
    }

    const totals = await tx.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS "employeeCount",COALESCE(SUM("grossPay"),0) AS "grossTotal",
              COALESCE(SUM("deductions"+"advanceRecovery"+COALESCE("loanRecovery",0)),0) AS "deductionTotal",
              COALESCE(SUM("netPreview"),0) AS "netPreviewTotal"
         FROM "payroll_run_lines" WHERE "organizationId"=$1 AND "runId"=$2`,
      organizationId,
      runId
    );
    const total = totals[0] || {};
    await tx.$executeRawUnsafe(
      `UPDATE "payroll_runs"
          SET "employeeCount"=$3,"grossTotal"=$4,"deductionTotal"=$5,"netPreviewTotal"=$6,"updatedAt"=CURRENT_TIMESTAMP
        WHERE "organizationId"=$1 AND "id"=$2`,
      organizationId,
      runId,
      Number(total.employeeCount || 0),
      Number(total.grossTotal || 0),
      Number(total.deductionTotal || 0),
      Number(total.netPreviewTotal || 0)
    );
    await tx.organizationAudit.create({
      data: {
        organizationId,
        actorUserId: actorUserId || null,
        entityType: "PayrollRun",
        entityId: runId,
        action: "ZERMATT_LEAVE_ALLOWANCE_CURRENT_MONTH_SALARY_FORMULA_APPLIED",
        newValue: {
          payrollPeriodId: period.id,
          payrollPeriodCode: period.code,
          policyMode: POLICY_MODE,
          formula: "Monthly Basic Salary × 12 × 10%",
          salaryBasis: SALARY_BASIS,
          paymentTiming: PAYMENT_TIMING,
          beneficiaryCount: beneficiaries.length,
          totalLeaveAllowance: round2(beneficiaries.reduce((sum, item) => sum + item.amount, 0)),
        },
        reason: "Annual Leave Allowance uses the authoritative monthly gross/basic salary elements for the eligible payroll month while retaining Basic × 12 × 10%.",
      },
    });
  });

  return {
    organization: { id: organization.id, name: organization.name, slug: organization.slug },
    period: { id: period.id, code: period.code, periodStart: dateText(period.periodStart), periodEnd: dateText(period.periodEnd) },
    policyMode: POLICY_MODE,
    formula: "Monthly Basic Salary × 12 × 10%",
    salaryBasis: SALARY_BASIS,
    paymentTiming: PAYMENT_TIMING,
    beneficiaryCount: beneficiaries.length,
    totalLeaveAllowance: round2(beneficiaries.reduce((sum, item) => sum + item.amount, 0)),
    beneficiaries,
  };
}

module.exports = {
  ZERMATT_SLUG,
  BENEFIT_CODE,
  ELIGIBLE_EMPLOYMENT_TYPE,
  LEAVE_ALLOWANCE_RATE,
  POLICY_MODE,
  SALARY_BASIS,
  PAYMENT_TIMING,
  eligibilityForPeriod,
  calculateLeaveAllowance,
  getReferenceSalary,
  applyZermattLeaveAllowanceToDraft,
};
