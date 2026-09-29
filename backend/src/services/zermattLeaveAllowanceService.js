const prisma = require("../config/prisma");

const ZERMATT_SLUG = "zermatt-liquor-limited";
const BENEFIT_CODE = "ZERMATT_LEAVE_ALLOWANCE";
const ELIGIBLE_EMPLOYMENT_TYPE = "Full-Time";
const POLICY_MODE = "REFERENCE_IMPORT";
const SALARY_BASIS = "LAST_DECEMBER_GROSS";
const PAYMENT_TIMING = "ARREARS";

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

function monthStart(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

function eligibilityForPeriod() {
  return {
    eligible: false,
    reason: "REFERENCE_IMPORT_REQUIRED",
    policyMode: POLICY_MODE,
    salaryBasis: SALARY_BASIS,
    paymentTiming: PAYMENT_TIMING,
  };
}

function calculateLeaveAllowance() {
  return {
    monthlyBasicSalary: 0,
    annualBasicSalary: 0,
    leaveAllowance: 0,
    ratePercent: null,
    formula: null,
    policyMode: POLICY_MODE,
    salaryBasis: SALARY_BASIS,
    paymentTiming: PAYMENT_TIMING,
    automaticCalculation: false,
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

async function applyZermattLeaveAllowanceToDraft({ organizationId, actorUserId, runId, periodId, prismaClient = prisma }) {
  const organization = await assertZermatt(prismaClient, organizationId);
  const periodRows = await prismaClient.$queryRawUnsafe(
    `SELECT "id","code","periodStart","periodEnd","payDate"
       FROM "payroll_periods"
      WHERE "organizationId"=$1 AND "id"=$2
      LIMIT 1`,
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

  const applicableMonth = monthStart(period.periodEnd);
  const lineRows = await prismaClient.$queryRawUnsafe(
    `SELECT pl."id",pl."employeeId",pl."employeeNumber",pl."employeeName",pl."currency",
            pl."allowances",pl."deductions",pl."grossPay",pl."netPreview",pl."details",
            e."employmentType",e."locationId"
       FROM "payroll_run_lines" pl
       JOIN "employees" e ON e."id"=pl."employeeId" AND e."organizationId"=pl."organizationId"
      WHERE pl."organizationId"=$1 AND pl."runId"=$2
      ORDER BY pl."employeeNumber"`,
    organizationId,
    runId
  );

  const referenceRows = await prismaClient.$queryRawUnsafe(
    `SELECT "employeeId","employeeNumber","referenceDecemberYear","referenceDecemberGross",
            "leaveAllowanceAmount","sourceFileName","sourceRowNumber"
       FROM "zermatt_leave_allowance_references"
      WHERE "organizationId"=$1
        AND "applicableMonth"=$2::date
        AND "status"='ACTIVE'`,
    organizationId,
    applicableMonth
  );
  const references = new Map(referenceRows.map((row) => [row.employeeId, row]));
  const beneficiaries = [];

  await prismaClient.$transaction(async (tx) => {
    for (const row of lineRows) {
      const details = jsonValue(row.details, {});
      const previousAllowance = round2(details.leaveAllowance?.amount || details.leaveAllowance?.value || 0);
      const reference = references.get(row.employeeId) || null;
      const amount = reference ? round2(reference.leaveAllowanceAmount) : 0;

      const baseNet = round2(row.netPreview - previousAllowance);
      const benefitEarnings = Array.isArray(details.benefitEarnings)
        ? details.benefitEarnings.filter((item) => item?.code !== BENEFIT_CODE)
        : [];
      const nextDetails = {
        ...details,
        benefitEarnings,
        leaveAllowancePolicy: {
          mode: POLICY_MODE,
          automaticCalculation: false,
          salaryBasis: SALARY_BASIS,
          paymentTiming: PAYMENT_TIMING,
          applicableMonth,
          status: reference ? "REFERENCE_APPLIED" : "AWAITING_REFERENCE",
        },
      };
      delete nextDetails.leaveAllowance;

      if (reference && amount > 0) {
        const leaveAllowance = {
          code: BENEFIT_CODE,
          name: "Leave Allowance",
          module: "BENEFITS",
          benefitType: "LEAVE_ALLOWANCE",
          amount,
          value: amount,
          referenceDecemberYear: Number(reference.referenceDecemberYear),
          referenceDecemberGross: round2(reference.referenceDecemberGross),
          applicableMonth,
          payrollPeriodId: period.id,
          payrollPeriodCode: period.code,
          taxable: false,
          payrollTreatment: "AFTER_TAX_NON_TAXABLE",
          payeImpact: 0,
          source: "ZERMATT_LEAVE_ALLOWANCE_REFERENCE_IMPORT",
          sourceFileName: reference.sourceFileName || null,
          sourceRowNumber: reference.sourceRowNumber || null,
        };
        nextDetails.leaveAllowance = leaveAllowance;
        nextDetails.benefitEarnings = [...benefitEarnings, leaveAllowance];
        beneficiaries.push({
          employeeId: row.employeeId,
          employeeNumber: row.employeeNumber,
          employeeName: row.employeeName,
          employmentType: row.employmentType,
          amount,
          ...leaveAllowance,
        });
      }

      await tx.$executeRawUnsafe(
        `UPDATE "payroll_run_lines"
            SET "netPreview"=$4,
                "details"=$5::jsonb,
                "updatedAt"=CURRENT_TIMESTAMP
          WHERE "organizationId"=$1 AND "runId"=$2 AND "id"=$3`,
        organizationId,
        runId,
        row.id,
        round2(baseNet + amount),
        JSON.stringify(nextDetails)
      );
    }

    const totals = await tx.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS "employeeCount",
              COALESCE(SUM("grossPay"),0) AS "grossTotal",
              COALESCE(SUM("deductions"+"advanceRecovery"+COALESCE("loanRecovery",0)),0) AS "deductionTotal",
              COALESCE(SUM("netPreview"),0) AS "netPreviewTotal"
         FROM "payroll_run_lines"
        WHERE "organizationId"=$1 AND "runId"=$2`,
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
        action: "ZERMATT_LEAVE_ALLOWANCE_REFERENCE_POLICY_APPLIED",
        newValue: {
          payrollPeriodId: period.id,
          payrollPeriodCode: period.code,
          policyMode: POLICY_MODE,
          salaryBasis: SALARY_BASIS,
          paymentTiming: PAYMENT_TIMING,
          automaticCalculation: false,
          referenceCount: referenceRows.length,
          beneficiaryCount: beneficiaries.length,
          totalLeaveAllowance: round2(beneficiaries.reduce((sum, item) => sum + item.amount, 0)),
        },
        reason: "Zermatt Leave Allowance is payable in arrears using an authoritative reference schedule based on last December gross salary. Automatic formula calculation is disabled.",
      },
    });
  });

  return {
    organization: { id: organization.id, name: organization.name, slug: organization.slug },
    period: { id: period.id, code: period.code, periodStart: dateText(period.periodStart), periodEnd: dateText(period.periodEnd) },
    policyMode: POLICY_MODE,
    salaryBasis: SALARY_BASIS,
    paymentTiming: PAYMENT_TIMING,
    automaticCalculation: false,
    referenceCount: referenceRows.length,
    beneficiaryCount: beneficiaries.length,
    totalLeaveAllowance: round2(beneficiaries.reduce((sum, item) => sum + item.amount, 0)),
    beneficiaries,
  };
}

module.exports = {
  ZERMATT_SLUG,
  BENEFIT_CODE,
  ELIGIBLE_EMPLOYMENT_TYPE,
  POLICY_MODE,
  SALARY_BASIS,
  PAYMENT_TIMING,
  eligibilityForPeriod,
  calculateLeaveAllowance,
  applyZermattLeaveAllowanceToDraft,
};
