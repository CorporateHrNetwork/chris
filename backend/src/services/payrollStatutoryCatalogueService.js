const { getActivePolicy } = require("./nigeriaPayrollComplianceService");

async function getPayrollStatutoryCatalogue({ organizationId, prismaClient }) {
  const policy = await getActivePolicy({ organizationId, prismaClient });
  const paye = policy?.payeRules || {};
  const employer = policy?.employerStatutoryRules || {};

  return {
    policyCode: policy?.code || null,
    policyVersion: policy?.versionNumber || null,
    items: [
      {
        code: "PAYE",
        name: "Pay As You Earn (PAYE)",
        category: "EMPLOYEE_DEDUCTION",
        payrollFrequency: "MONTHLY",
        status: policy ? "ACTIVE_AUTOMATED" : "NOT_CONFIGURED",
        basis: paye.ruleCode || "NG-NTA-2025-2026",
        employeeEffect: "Deducted from employee net pay where chargeable tax arises.",
        employerEffect: "Employer withholds and remits to the relevant tax authority.",
      },
      {
        code: "PENSION",
        name: "Contributory Pension",
        category: "EMPLOYEE_AND_EMPLOYER",
        payrollFrequency: "MONTHLY",
        status: policy ? "ACTIVE_AUTOMATED" : "NOT_CONFIGURED",
        basis: `${Number(policy?.pensionEmployeeRate || 0)}% employee + ${Number(policy?.pensionEmployerRate || 0)}% employer on configured pensionable components`,
        employeeEffect: "Employee contribution is deducted where the employee is in-scope under the tenant policy.",
        employerEffect: "Employer contribution is accrued separately from employee deductions.",
      },
      {
        code: "NHF",
        name: "National Housing Fund (NHF)",
        category: "EMPLOYEE_DEDUCTION",
        payrollFrequency: "MONTHLY",
        status: paye?.nhf?.enabled === true ? "ACTIVE_AUTOMATED" : "REVIEW_BEFORE_ACTIVATION",
        basis: paye?.nhf?.employeeRate ? `${Number(paye.nhf.employeeRate)}% of configured NHF basis` : "2.5% statutory contribution basis subject to applicability and participation configuration",
        employeeEffect: paye?.nhf?.enabled === true ? "Deducted for configured participating/in-scope employees." : "Not currently deducted by CHRiS for ZERMATT.",
        employerEffect: "Employer deducts/remits where applicable; activation requires employee/applicability data.",
      },
      {
        code: "NSITF_ECS",
        name: "NSITF Employees' Compensation Scheme",
        category: "EMPLOYER_ONLY",
        payrollFrequency: "MONTHLY_ACCRUAL",
        status: employer?.nsitf?.enabled === true ? "ACTIVE_EMPLOYER_COST" : "REVIEW_BEFORE_ACTIVATION",
        basis: employer?.nsitf?.employerRate ? `${Number(employer.nsitf.employerRate)}% employer rate configured in policy` : "Employer contribution; not an employee deduction",
        employeeEffect: "Never deducted from employee pay by CHRiS.",
        employerEffect: "Tracked as employer statutory cost where enabled.",
      },
      {
        code: "ITF",
        name: "Industrial Training Fund (ITF)",
        category: "EMPLOYER_ONLY",
        payrollFrequency: "MONTHLY_ACCRUAL_ANNUAL_SETTLEMENT",
        status: employer?.itf?.enabled === true ? "ACTIVE_EMPLOYER_ACCRUAL" : "REVIEW_BEFORE_ACTIVATION",
        basis: employer?.itf?.employerRate ? `${Number(employer.itf.employerRate)}% payroll accrual configured in policy` : "Employer levy/accrual; not an employee deduction",
        employeeEffect: "Never deducted from employee pay by CHRiS.",
        employerEffect: "Tracked as employer accrual where enabled; legal applicability should be reviewed before remittance.",
      },
      {
        code: "GROUP_LIFE",
        name: "Group Life Insurance",
        category: "EMPLOYER_OBLIGATION",
        payrollFrequency: "NON_PAYROLL_PREMIUM",
        status: "TRACKING_ONLY",
        basis: "Employer insurance obligation; not a payroll deduction.",
        employeeEffect: "No employee payroll deduction.",
        employerEffect: "Track compliance evidence/policy outside net-pay deductions.",
      },
    ],
    control: "Only items marked ACTIVE_AUTOMATED or ACTIVE_EMPLOYER_COST/ACCRUAL are applied by payroll. REVIEW_BEFORE_ACTIVATION items require tenant approval and applicability data before deduction/remittance.",
  };
}

module.exports = { getPayrollStatutoryCatalogue };
