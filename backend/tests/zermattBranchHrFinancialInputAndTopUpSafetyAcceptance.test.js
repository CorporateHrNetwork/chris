const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.resolve(root, relativePath), "utf8");

function includesAll(source, expected, label) {
  for (const value of expected) assert.ok(source.includes(value), `${label}: missing ${value}`);
}

test("ZERMATT Branch HR financial input scope, Head HR audit controls and top-up planner safety", () => {
  const access = read("backend/src/services/zermattHrFinancialAccessService.js");
  const inputRoutes = read("backend/src/routes/zermattHrPayrollInputRoutes.js");
  const financialRoutes = read("backend/src/routes/zermattFinancialSupportRoutes.js");
  const liabilityRoutes = read("backend/src/routes/payrollLiabilityEditRoutes.js");
  const financialService = read("backend/src/services/zermattFinancialSupportService.js");
  const salaryRateControl = read("backend/src/services/zermattSalaryRateControlService.js");
  const loanControl = read("backend/src/services/zermattLoanControlService.js");
  const salaryAdvanceControl = read("backend/src/services/salaryAdvanceControlService.js");
  const migration = read("backend/prisma/migrations/20260915020500_zermatt_branch_hr_loan_input_access/migration.sql");
  const app = read("backend/src/app.js");
  const loansUi = read("src/pages/Loans.jsx");
  const advancesUi = read("src/pages/payroll/SalaryAdvancesManaged.jsx");
  const ratesUi = read("src/pages/payroll/SalaryRatesManaged.jsx");

  includesAll(access, [
    "BRANCH_HR_ROLES",
    '"HR & ADMIN OFFICER - BRANCH"',
    '"BRANCH HR & ADMIN OFFICER"',
    "HEAD_HR_ROLES",
    "canManageEmployeeFinancialInputs",
    "canManageLoans",
    "canDeleteEmployeeFinancialInputs",
    "requireEmployeeFinancialInputEditor",
    "requireLoanEditor",
    "requireHeadHrFinancialControl",
    "assertEmployeeNumberAccess",
    "assertLoanRecordAccess",
    "assertSalaryAdvanceAccess",
    "assertSalaryRateAccess",
    'locationScope === "ALL_LOCATIONS"',
    "activeLocationId",
    "canBulkPayrollInputs",
  ], "HR financial access service");

  includesAll(inputRoutes, [
    'router.get("/payroll/hr-input-capabilities"',
    '"/payroll/salary-rates"',
    '"/payroll/salary-rates/:id"',
    '"/payroll/salary-rates/:id/retire"',
    '"/payroll/salary-rates/:id"',
    "requireEmployeeFinancialInputEditor",
    "requireHeadHrFinancialControl",
    "assertEmployeeNumberAccess",
    "assertSalaryRateAccess",
    "markDraftRunsRecalculationRequired",
  ], "salary-rate HR input routes");

  includesAll(financialRoutes, [
    'router.post("/loans/approved-disbursed", zermattOnly, requireLoanEditor',
    'router.post("/loans/:id/top-up", zermattOnly, requireLoanEditor',
    "assertEmployeeNumberAccess",
    "assertLoanRecordAccess",
    'router.delete("/loans/:id", zermattOnly, requireHeadHrFinancialControl',
    '"/payroll/salary-advances"',
    "requireEmployeeFinancialInputEditor",
  ], "loan/advance HR recording routes");

  includesAll(liabilityRoutes, [
    "requireSalaryAdvanceEditor",
    "requireLoanLiabilityEditor",
    "assertSalaryAdvanceAccess",
    "assertLoanRecordAccess",
    "assertEmployeeNumberAccess",
    "requireSalaryAdvanceDeleteControl",
  ], "branch-safe liability edit routes");

  includesAll(salaryRateControl, [
    "SALARY_RATE_CORRECTED_BY_HR",
    "SALARY_RATE_DELETED_BY_HEAD_HR",
    "SALARY_RATE_APPROVED_PAYROLL_HISTORY_LOCKED",
    "SALARY_RATE_FINANCIAL_HISTORY_DELETE_BLOCKED",
    "FOR UPDATE",
    "markDraftRunsRecalculationRequired",
  ], "salary-rate history safeguards");
  includesAll(loanControl, [
    "LOAN_DELETED_BY_HEAD_HR",
    "LOAN_FINANCIAL_HISTORY_DELETE_BLOCKED",
    "postedRecoveryCount",
    "FOR UPDATE",
  ], "loan delete safeguards");
  includesAll(salaryAdvanceControl, [
    "SALARY_ADVANCE_CANCELLED_BY_HEAD_HR_CONTROL",
    "SALARY_ADVANCE_DELETED_BY_HEAD_HR",
    "SALARY_ADVANCE_FINANCIAL_HISTORY_DELETE_BLOCKED",
  ], "salary-advance delete safeguards");

  includesAll(financialService, [
    "MAX_REPAYMENT_MONTHS = 600",
    "Number.isSafeInteger(offset)",
    "Number.isNaN(date.getTime())",
    "INVALID_REPAYMENT_TERM",
    "LOAN_APPROVED_DISBURSED_RECORDED_BY_HR",
    "LOAN_TOPUP_APPROVED_DISBURSED_MERGED_BY_HR",
    "SALARY_ADVANCE_APPROVED_DISBURSED_RECORDED_BY_HR",
  ], "server repayment planner safety");

  includesAll(loansUi, [
    "MAX_REPAYMENT_MONTHS = 600",
    "Number.isSafeInteger(offset)",
    "Number.isNaN(date.getTime())",
    "invalidReason",
    "Save Loan Changes",
    "canManageLoans",
    "canDeleteEmployeeFinancialInputs",
    'method: "DELETE"',
    "Branch HR",
    "Head HR",
  ], "Loans UI safety/access");
  includesAll(advancesUi, [
    "MAX_REPAYMENT_MONTHS = 600",
    "Number.isSafeInteger(offset)",
    "invalidReason",
    "capabilities.canEdit",
    "capabilities.canCancelDelete",
    "Branch HR & Admin Officers",
    "Head HR correction/delete control",
  ], "Salary Advance UI safety/access");
  includesAll(ratesUi, [
    'apiRequest("/api/payroll/hr-input-capabilities")',
    "editingRate",
    "Save Salary Rate Changes",
    "canManageEmployeeFinancialInputs",
    "canDeleteEmployeeFinancialInputs",
    "canBulkPayrollInputs",
    "Branch HR & Admin Officers",
    "Head HR",
  ], "Salary Rate UI access");

  includesAll(migration, [
    "HR & Admin Officer - Branch",
    "Branch HR & Admin Officer",
    "loans.apply",
    'ON CONFLICT ("roleId","permissionId") DO NOTHING',
  ], "Branch HR loan-input migration");
  assert.equal(migration.includes("payroll.manage"), false, "Branch HR must not receive payroll.manage through this migration");
  assert.equal(migration.includes("loans.approve"), false, "Branch HR must not receive in-system loan approval authority");
  assert.equal(migration.includes("loans.disburse"), false, "Branch HR must not receive CHRiS disbursement authority");

  const scopeMount = app.indexOf('app.use("/api", activeBranchScopeRoutes);');
  const financialMount = app.indexOf('app.use("/api", zermattFinancialSupportRoutes);');
  const inputMount = app.indexOf('app.use("/api", zermattHrPayrollInputRoutes);');
  assert.ok(scopeMount >= 0 && financialMount > scopeMount && inputMount > scopeMount, "active branch scope must execute before all HR financial write routes");

  console.log("PASS: ZERMATT Branch HR financial input + Head HR audit + top-up crash-safety gate passed.");
});