const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.resolve(root, relativePath), "utf8");

function includesAll(source, values, label) {
  for (const value of values) {
    assert.ok(source.includes(value), `${label}: missing ${value}`);
  }
}

test("ZERMATT loan top-up remains render-safe and HR financial inputs preserve branch/head-office scope", () => {
  const loansUi = read("src/pages/Loans.jsx");
  const access = read("backend/src/services/zermattHrFinancialAccessService.js");
  const hrRoutes = read("backend/src/routes/zermattHrPayrollInputRoutes.js");
  const financialRoutes = read("backend/src/routes/zermattFinancialSupportRoutes.js");
  const liabilityRoutes = read("backend/src/routes/payrollLiabilityEditRoutes.js");
  const financialService = read("backend/src/services/zermattFinancialSupportService.js");
  const salaryAdvanceControl = read("backend/src/services/salaryAdvanceControlService.js");
  const salaryRateControl = read("backend/src/services/zermattSalaryRateControlService.js");
  const loanControl = read("backend/src/services/zermattLoanControlService.js");

  includesAll(loansUi, [
    "MAX_REPAYMENT_MONTHS",
    "Number.isSafeInteger(installmentCount)",
    "installmentCount > MAX_REPAYMENT_MONTHS",
    "Number.isNaN(date.getTime())",
    "plan?.invalidReason",
    "const validPlan = Boolean(plan && !plan.invalidReason)",
    "disabled={Boolean(busy) || !validPlan}",
    "Record Approved Top-Up",
    "New cumulative principal",
    "Revised outstanding",
    "No second loan account was created",
  ], "Loan top-up render guard");

  includesAll(access, [
    "BRANCH_HR_ROLES",
    "HEAD_HR_ROLES",
    "canManageEmployeeFinancialInputs",
    "canManageLoans",
    "canDeleteEmployeeFinancialInputs",
    "assertLocationWithinAccess",
    'req.auth?.locationScope === "ALL_LOCATIONS"',
    "availableLocations",
  ], "HR financial access model");

  includesAll(hrRoutes, [
    'router.get(\n  "/payroll/salary-rates"',
    'router.get(\n  "/payroll/salary-advances"',
    "visibleInCurrentHrScope",
    "employeeLocationId",
    "activeLocationId",
    'req.auth?.locationScope === "ALL_LOCATIONS"',
    "availableLocations",
    'router.post(\n  "/payroll/salary-rates"',
    'router.patch(\n  "/payroll/salary-rates/:id"',
    'router.patch(\n  "/payroll/salary-rates/:id/retire"',
    'router.delete(\n  "/payroll/salary-rates/:id"',
    "requireEmployeeFinancialInputEditor",
    "requireHeadHrFinancialControl",
  ], "Scoped salary-rate and salary-advance routes");

  assert.ok(
    hrRoutes.indexOf('router.get(\n  "/payroll/salary-rates"') < hrRoutes.indexOf('router.post(\n  "/payroll/salary-rates"'),
    "Zermatt scoped salary-rate read must be registered before salary-rate mutations in the tenant router"
  );

  includesAll(financialRoutes, [
    'router.post("/loans/approved-disbursed", zermattOnly, requireLoanEditor',
    'router.post("/loans/:id/top-up", zermattOnly, requireLoanEditor',
    "assertEmployeeNumberAccess",
    "assertLoanRecordAccess",
    "requireEmployeeFinancialInputEditor",
  ], "Branch-scoped financial-support recording");

  includesAll(liabilityRoutes, [
    "requireSalaryAdvanceEditor",
    "requireLoanLiabilityEditor",
    "requireSalaryAdvanceDeleteControl",
    "assertSalaryAdvanceAccess",
    "assertLoanRecordAccess",
    'router.patch("/payroll/salary-advances/:id"',
    'router.delete("/payroll/salary-advances/:id"',
    'router.patch("/loans/:id"',
  ], "Branch edit / Head HR delete controls");

  includesAll(financialService, [
    "LOAN_APPROVED_DISBURSED_RECORDED_BY_HR",
    "LOAN_TOPUP_APPROVED_DISBURSED_MERGED_BY_HR",
    "SALARY_ADVANCE_APPROVED_DISBURSED_RECORDED_BY_HR",
    "markDraftRunsRecalculationRequired",
  ], "Financial-support audit and payroll freshness");
  includesAll(salaryAdvanceControl, [
    "SALARY_ADVANCE_DELETED_BY_HEAD_HR",
    "previousValue",
    "organizationAudit.create",
  ], "Salary Advance delete audit");
  includesAll(salaryRateControl, [
    "SALARY_RATE_UPDATED_BY_HR",
    "SALARY_RATE_DELETED_BY_HEAD_HR",
    "previousValue",
    "organizationAudit.create",
  ], "Salary Rate audit");
  includesAll(loanControl, [
    "LOAN_DELETED_BY_HEAD_HR",
    "previousValue",
    "organizationAudit.create",
  ], "Loan delete audit");

  console.log("PASS: ZERMATT top-up render safety + branch/head-office HR financial scope gate passed.");
});
