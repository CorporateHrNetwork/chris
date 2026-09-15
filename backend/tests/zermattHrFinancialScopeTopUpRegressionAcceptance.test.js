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
  const scopeRoutes = read("backend/src/routes/activeBranchScopeRoutes.js");
  const hrRoutes = read("backend/src/routes/zermattHrPayrollInputRoutes.js");
  const financialRoutes = read("backend/src/routes/zermattFinancialSupportRoutes.js");
  const liabilityRoutes = read("backend/src/routes/payrollLiabilityEditRoutes.js");
  const financialService = read("backend/src/services/zermattFinancialSupportService.js");
  const salaryAdvanceControl = read("backend/src/services/salaryAdvanceControlService.js");
  const salaryRateControl = read("backend/src/services/zermattSalaryRateControlService.js");
  const loanControl = read("backend/src/services/zermattLoanControlService.js");
  const app = read("backend/src/app.js");

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

  // Read scoping remains centralized in Active Branch Scope; do not create a
  // second copy of branch/head-office visibility rules in the HR mutation router.
  includesAll(scopeRoutes, [
    '"/payroll/salary-rates"',
    '"/payroll/salary-advances"',
    "activeLocationId",
    "workflowLocationId",
    "payroll_salary_rates",
    "payroll_salary_advances",
    "payroll_loans",
  ], "authoritative active-branch financial read scope");

  includesAll(hrRoutes, [
    'router.get("/payroll/hr-input-capabilities"',
    '"/payroll/salary-rates"',
    '"/payroll/salary-rates/:id"',
    '"/payroll/salary-rates/:id/retire"',
    "requireEmployeeFinancialInputEditor",
    "requireHeadHrFinancialControl",
    "assertEmployeeNumberAccess",
    "assertSalaryRateAccess",
  ], "Scoped salary-rate mutation routes");

  const branchScopeMount = app.indexOf('app.use("/api", activeBranchScopeRoutes);');
  const financialMount = app.indexOf('app.use("/api", zermattFinancialSupportRoutes);');
  const hrInputMount = app.indexOf('app.use("/api", zermattHrPayrollInputRoutes);');
  assert.ok(branchScopeMount >= 0 && financialMount > branchScopeMount && hrInputMount > branchScopeMount, "Active Branch Scope must precede all HR financial write routes");

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
    "assertEmployeeNumberAccess",
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
    "SALARY_RATE_CORRECTED_BY_HR",
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