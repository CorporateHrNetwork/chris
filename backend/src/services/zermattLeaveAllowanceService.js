const prisma = require("../config/prisma");
const { calculateStructure, getActivePolicy } = require("./nigeriaPayrollComplianceService");

const ZERMATT_SLUG = "zermatt-liquor-limited";
const BENEFIT_CODE = "ZERMATT_LEAVE_ALLOWANCE";
const ELIGIBLE_EMPLOYMENT_TYPE = "Full-Time";
const LEAVE_ALLOWANCE_RATE = 10;
const POLICY_MODE = "REFERENCE_SALARY_FORMULA";
const SALARY_BASIS = "LAST_DECEMBER_GROSS";
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

function calculateLeaveAllowance({ referenceMonthlyGross, scheduledMonthlyGross, salaryStructure }) {
  const gross = round2(referenceMonthlyGross ?? scheduledMonthlyGross ?? 0);
  if (gross <= 0) {
    return {
      referenceMonthlyGross: gross,
      monthlyBasicSalary: 0,
      annualBasicSalary: 0,
      leaveAllowance: 0,
      ratePercent: LEAVE_ALLOWANCE_RATE,
      formula: "Reference December Basic Salary × 12 × 10%",
      salaryBasis: SALARY_BASIS,
    };
  }
  const structure = calculateStructure(gross, salaryStructure || {});
  const monthlyBasicSalary = round2(structure.basic || 0);
  const annualBasicSalary = round2(monthlyBasicSalary * 12);
  const leaveAllowance = round2(annualBasicSalary * LEAVE_ALLOWANCE_RATE / 100);
  return {
    referenceMonthlyGross: gross,
    monthlyBasicSalary,
    annualBasicSalary,
    leaveAllowance,
    ratePercent: LEAVE_ALLOWANCE_RATE,
    formula: "Reference December Basic Salary × 12 × 10%",
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

async function paidEntitlementKeys(client, organizationId, runId) {
  const rows = await client.$queryRawUnsafe(
    `SELECT pl."employeeId", pl."details"->'leaveAllowance'->>'entitlementYear' AS "entitlementYear"
       FROM "payroll_run_lines" pl
       JOIN "payroll_runs" pr ON pr."id"=pl."runId" AND pr."organizationId"=pl."organizationId"
      WHERE pl."organizationId"=$1 AND pr."status"='APPROVED' AND pl."runId"<>$2
        AND pl."details" ? 'leaveAllowance'`,
    organizationId,
    runId
  );
  return new Set(rows.map((row) => `${row.employeeId}:${row.entitlementYear}`));
}

async function applyZermattLeaveAllowanceToDraft({ organizationId, actorUserId, runId, periodId, prismaClient = prisma }) {
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

  const lineRows = await prismaClient.$queryRawUnsafe(
    `SELECT pl.*,e."hireDate",e."locationId",e."status" AS "employeeStatus",e."employmentType"
       FROM "payroll_run_lines" pl
       JOIN "employees" e ON e."id"=pl."employeeId" AND e."organizationId"=pl."organizationId"
      WHERE pl."organizationId"=$1 AND pl."runId"=$2 ORDER BY pl."employeeNumber"`,
    organizationId,
    runId
  );
  const alreadyPaid = await paidEntitlementKeys(prismaClient, organizationId, runId);
  const beneficiaries = [];

  await prismaClient.$transaction(async (tx) => {
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
      const reference = eligibility.eligible
        ? await getReferenceSalary({ organizationId, employeeId: row.employeeId, asOfDate: period.periodEnd, prismaClient: tx })
        : null;
      const entitlementKey = eligibility.entitlementYear ? `${row.employeeId}:${eligibility.entitlementYear}` : null;
      const calculation = reference
        ? calculateLeaveAllowance({ referenceMonthlyGross: reference.referenceDecemberGross, salaryStructure: policy.salaryStructure })
        : null;
      const amount = entitlementKey && !alreadyPaid.has(entitlementKey) ? round2(calculation?.leaveAllowance || 0) : 0;

      const benefitEarnings = Array.isArray(details.benefitEarnings)
        ? details.benefitEarnings.filter((item) => item?.code !== BENEFIT_CODE)
        : [];
      const nextDetails = {
        ...details,
        benefitEarnings,
        leaveAllowancePolicy: {
          mode: POLICY_MODE,
          formula: "Reference December Basic Salary × 12 × 10%",
          salaryBasis: SALARY_BASIS,
          paymentTiming: PAYMENT_TIMING,
          status: amount > 0 ? "REFERENCE_SALARY_APPLIED" : reference ? "NOT_DUE_OR_ALREADY_PAID" : "AWAITING_REFERENCE_SALARY",
        },
      };
      delete nextDetails.leaveAllowance;

      if (amount > 0) {
        const leaveAllowance = {
          code: BENEFIT_CODE,
          name: "Leave Allowance",
          module: "BENEFITS",
          benefitType: "LEAVE_ALLOWANCE",
          employmentType: row.employmentType,
          amount,
          value: amount,
          referenceDecemberYear: Number(reference.referenceDecemberYear),
          referenceDecemberGross: round2(reference.referenceDecemberGross),
          referenceDecemberBasic: calculation.monthlyBasicSalary,
          annualBasicSalary: calculation.annualBasicSalary,
          ratePercent: LEAVE_ALLOWANCE_RATE,
          formula: calculation.formula,
          hireDate: dateText(row.hireDate),
          anniversaryDate: eligibility.anniversaryDate,
          entitlementYear: eligibility.entitlementYear,
          payrollPeriodId: period.id,
          payrollPeriodCode: period.code,
          taxable: false,
          payrollTreatment: "AFTER_TAX_NON_TAXABLE",
          payeImpact: 0,
          source: "ZERMATT_DECEMBER_SALARY_REFERENCE_FORMULA",
          sourceFileName: reference.sourceFileName || null,
          sourceRowNumber: reference.sourceRowNumber || null,
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
        round2(baseNet + amount),
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
        action: "ZERMATT_LEAVE_ALLOWANCE_REFERENCE_SALARY_FORMULA_APPLIED",
        newValue: {
          payrollPeriodId: period.id,
          payrollPeriodCode: period.code,
          policyMode: POLICY_MODE,
          formula: "Reference December Basic Salary × 12 × 10%",
          salaryBasis: SALARY_BASIS,
          paymentTiming: PAYMENT_TIMING,
          beneficiaryCount: beneficiaries.length,
          totalLeaveAllowance: round2(beneficiaries.reduce((sum, item) => sum + item.amount, 0)),
        },
        reason: "Zermatt annual Leave Allowance retains the Basic × 12 × 10% formula. The salary authority is the prior December gross salary reference rather than current salary.",
      },
    });
  });

  return {
    organization: { id: organization.id, name: organization.name, slug: organization.slug },
    period: { id: period.id, code: period.code, periodStart: dateText(period.periodStart), periodEnd: dateText(period.periodEnd) },
    policyMode: POLICY_MODE,
    formula: "Reference December Basic Salary × 12 × 10%",
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
