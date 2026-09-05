const prisma = require("../config/prisma");

function text(value) {
  return String(value ?? "").trim();
}

function numberValue(value) {
  return Number(value || 0);
}

function dateText(value) {
  if (!value) return null;
  return new Date(value).toISOString().slice(0, 10);
}

function jsonValue(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function mapIntegratedLine(row) {
  return {
    ...row,
    periodStart: dateText(row.periodStart),
    periodEnd: dateText(row.periodEnd),
    payDate: dateText(row.payDate),
    baseSalary: numberValue(row.baseSalary),
    allowances: numberValue(row.allowances),
    deductions: numberValue(row.deductions),
    advanceRecovery: numberValue(row.advanceRecovery),
    loanRecovery: numberValue(row.loanRecovery),
    grossPay: numberValue(row.grossPay),
    netPreview: numberValue(row.netPreview),
    details: jsonValue(row.details, {}),
  };
}

async function listIntegratedRunLines({ organizationId, runId, prismaClient = prisma }) {
  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT pl."id",pl."runId",pl."employeeId",pl."employeeNumber",pl."employeeName",pl."currency",
            pl."baseSalary",pl."allowances",pl."deductions",pl."advanceRecovery",pl."loanRecovery",pl."grossPay",pl."netPreview",
            pl."statutoryStatus",pl."details",pl."createdAt",pl."updatedAt",
            pr."status" AS "runStatus",pr."statutoryStatus" AS "runStatutoryStatus",
            pp."code" AS "periodCode",pp."name" AS "periodName",pp."periodStart",pp."periodEnd",pp."payDate"
       FROM "payroll_run_lines" pl
       JOIN "payroll_runs" pr ON pr."id"=pl."runId" AND pr."organizationId"=pl."organizationId"
       JOIN "payroll_periods" pp ON pp."id"=pr."periodId" AND pp."organizationId"=pr."organizationId"
      WHERE pl."organizationId"=$1 AND pl."runId"=$2
      ORDER BY pl."employeeNumber" ASC`,
    organizationId,
    text(runId)
  );
  return rows.map(mapIntegratedLine);
}

async function listPayslips({ organizationId, runId, employeeNumber, prismaClient = prisma }) {
  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT pl."id",pl."runId",pl."employeeId",pl."employeeNumber",pl."employeeName",pl."currency",
            pl."baseSalary",pl."allowances",pl."deductions",pl."advanceRecovery",pl."loanRecovery",pl."grossPay",pl."netPreview",
            pl."statutoryStatus",pl."details",pl."createdAt",pl."updatedAt",
            pr."status" AS "runStatus",pr."statutoryStatus" AS "runStatutoryStatus",pr."approvedAt",
            pp."code" AS "periodCode",pp."name" AS "periodName",pp."periodStart",pp."periodEnd",pp."payDate"
       FROM "payroll_run_lines" pl
       JOIN "payroll_runs" pr ON pr."id"=pl."runId" AND pr."organizationId"=pl."organizationId"
       JOIN "payroll_periods" pp ON pp."id"=pr."periodId" AND pp."organizationId"=pr."organizationId"
      WHERE pl."organizationId"=$1
        AND pr."status"='APPROVED'
        AND ($2::text IS NULL OR pl."runId"=$2)
        AND ($3::text IS NULL OR UPPER(pl."employeeNumber")=UPPER($3))
      ORDER BY pp."periodStart" DESC,pl."employeeNumber" ASC`,
    organizationId,
    text(runId) || null,
    text(employeeNumber) || null
  );
  return rows.map(mapIntegratedLine);
}

async function getStatutoryCatalog({ organizationId, prismaClient = prisma }) {
  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT "id","code","name","versionNumber","effectiveFrom","effectiveTo","jurisdiction","status",
            "pensionEmployeeRate","pensionEmployerRate","pensionableComponents","payeRules","employerStatutoryRules"
       FROM "payroll_policy_versions"
      WHERE "organizationId"=$1 AND "status"='ACTIVE'
        AND "effectiveFrom" <= CURRENT_DATE
        AND ("effectiveTo" IS NULL OR "effectiveTo" >= CURRENT_DATE)
      ORDER BY "effectiveFrom" DESC,"versionNumber" DESC
      LIMIT 1`,
    organizationId
  );
  const policy = rows[0];
  if (!policy) return { configured: false, policy: null, items: [] };

  const payeRules = jsonValue(policy.payeRules, {});
  const employerRules = jsonValue(policy.employerStatutoryRules, {});
  const pensionable = jsonValue(policy.pensionableComponents, []);
  const nhf = payeRules.nhf || {};
  const nsitf = employerRules.nsitf || {};
  const itf = employerRules.itf || {};
  const employeeExemptions = payeRules.statutoryDeductionExemptEmploymentTypes || [];
  const pensionExemptions = employerRules.pensionParticipationExemptEmploymentTypes || [];

  return {
    configured: true,
    policy: {
      id: policy.id,
      code: policy.code,
      name: policy.name,
      versionNumber: Number(policy.versionNumber || 0),
      jurisdiction: policy.jurisdiction,
      effectiveFrom: dateText(policy.effectiveFrom),
      effectiveTo: dateText(policy.effectiveTo),
    },
    items: [
      {
        code: "PAYE",
        name: "Pay-As-You-Earn Income Tax",
        classification: "EMPLOYEE_DEDUCTION",
        status: "AUTOMATED",
        rate: "Graduated 0%–25% annual bands",
        basis: "Annualised chargeable employment income after permitted reliefs/deductions",
        payrollEffect: "Reduces employee net pay",
        applicability: employeeExemptions.length ? `Employment-type exemptions configured: ${employeeExemptions.join(", ")}` : "Applicable where employee has taxable income",
      },
      {
        code: "PENSION",
        name: "Contributory Pension",
        classification: "EMPLOYEE_DEDUCTION_AND_EMPLOYER_CONTRIBUTION",
        status: "AUTOMATED",
        rate: `${Number(policy.pensionEmployeeRate || 0)}% employee + ${Number(policy.pensionEmployerRate || 0)}% employer`,
        basis: pensionable.length ? pensionable.join(" + ") : "Configured pensionable monthly emoluments",
        payrollEffect: "Employee contribution reduces net pay; employer contribution is an employer cost",
        applicability: pensionExemptions.length ? `Participation exemptions configured: ${pensionExemptions.join(", ")}` : "Employees covered by the configured pension policy",
      },
      {
        code: "NHF",
        name: "National Housing Fund",
        classification: "CONDITIONAL_EMPLOYEE_DEDUCTION",
        status: nhf.enabled === true ? "ENABLED" : "CONFIGURATION_REQUIRED",
        rate: `${Number(nhf.employeeRate || 2.5)}%`,
        basis: "Basic salary",
        payrollEffect: nhf.enabled === true ? "Employee deduction" : "No deduction until applicability/participation is configured",
        applicability: "Activate only for employees for whom NHF deduction is applicable and supported by participation data",
      },
      {
        code: "NSITF-ECS",
        name: "Employees’ Compensation Scheme",
        classification: "EMPLOYER_ONLY_CONTRIBUTION",
        status: nsitf.enabled === true ? "ENABLED" : "DISABLED",
        rate: `${Number(nsitf.employerRate || 1)}% employer`,
        basis: "Total payroll / emoluments under the configured policy",
        payrollEffect: "Employer cost only; never an employee deduction",
        applicability: "Employer-side statutory contribution",
      },
      {
        code: "ITF",
        name: "Industrial Training Fund",
        classification: "EMPLOYER_ONLY_ACCRUAL",
        status: itf.enabled === true ? "ENABLED" : "DISABLED",
        rate: `${Number(itf.employerRate || 1)}% employer`,
        basis: "Annual payroll",
        payrollEffect: "Employer levy/accrual; never an employee deduction",
        applicability: "Where employer meets ITF statutory threshold",
      },
    ],
    controls: {
      employeeOnlyDeductions: ["PAYE", "PENSION", ...(nhf.enabled === true ? ["NHF"] : [])],
      employerOnlyItems: ["NSITF-ECS", "ITF"],
      nonStatutoryExamples: ["Loan Recovery", "Salary Advance Recovery", "Union/Cooperative deductions where authorised"],
      note: "Loan and Salary Advance recoveries are liabilities, not statutory deductions. Employer-only statutory costs must not be deducted from employee net pay.",
    },
  };
}

module.exports = {
  listIntegratedRunLines,
  listPayslips,
  getStatutoryCatalog,
};
