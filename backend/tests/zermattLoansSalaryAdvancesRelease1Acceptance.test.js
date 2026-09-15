const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.resolve(repoRoot, relativePath), "utf8");

function requireText(source, values, label) {
  for (const value of values) {
    assert.ok(source.includes(value), `${label} must include: ${value}`);
  }
}

test("ZERMATT Loans and Salary Advances use external approval/payment with branch-scoped HR recording", () => {
  const migration = read("backend/prisma/migrations/20260905014500_activate_loans_payroll_recovery/migration.sql");
  const policyService = read("backend/src/services/zermattFinancialSupportService.js");
  const policyRoutes = read("backend/src/routes/zermattFinancialSupportRoutes.js");
  const access = read("backend/src/services/zermattHrFinancialAccessService.js");
  const app = read("backend/src/app.js");
  const loansPage = read("src/pages/Loans.jsx");
  const salaryAdvancesPage = read("src/pages/payroll/SalaryAdvancesManaged.jsx");
  const payrollOperations = read("backend/src/services/payrollOperationsService.js");
  const nigeriaPayroll = read("backend/src/services/nigeriaPayrollComplianceService.js");

  requireText(migration, [
    'CREATE TABLE "payroll_loans"',
    'CREATE TABLE "payroll_loan_recoveries"',
    'ADD COLUMN "loanRecovery"',
    'CREATE UNIQUE INDEX "payroll_loan_recoveries_loan_run_key"',
    '"status"=\'ACTIVE\'',
    '"outstandingAmount" > 0',
    'COALESCE(NEW."advanceRecovery",0)',
    'COALESCE(NEW."loanRecovery",0)',
    'STATUTORY_AND_CUSTOM_DEDUCTIONS_THEN_SALARY_ADVANCE_THEN_LOAN',
    'trg_payroll_run_post_loan_recoveries',
  ], "Loan/payroll migration");
  assert.equal(migration.includes('ALTER TABLE "employees"'), false);
  assert.equal(migration.includes('ALTER TABLE "leave_'), false);

  requireText(policyService, [
    'approvalMode: "MANUAL_GM_OUTSIDE_CHRIS"',
    'disbursementMode: "ACCOUNTS_PAYMENT_OUTSIDE_CHRIS"',
    'systemPurpose: "PAYROLL_RECOVERY_RECORD_ONLY"',
    "recordApprovedDisbursedLoan",
    "applyApprovedDisbursedLoanTopUp",
    "recordApprovedDisbursedSalaryAdvance",
    "LOAN_APPROVED_DISBURSED_RECORDED_BY_HR",
    "LOAN_TOPUP_APPROVED_DISBURSED_MERGED_BY_HR",
    "SALARY_ADVANCE_APPROVED_DISBURSED_RECORDED_BY_HR",
    "FOR UPDATE",
    "currentPrincipal + topUpAmount",
    "currentOutstanding + topUpAmount",
    'UPDATE "payroll_loans"',
    "repaymentPlan",
    "MAX_REPAYMENT_MONTHS",
    "INVALID_REPAYMENT_TERM",
    "markDraftRunsRecalculationRequired",
  ], "Zermatt financial-support service");

  requireText(policyRoutes, [
    'router.post("/loans", zermattOnly, rejectLegacyLoanOrigination)',
    'router.post("/loans/applications", zermattOnly, rejectLegacyLoanOrigination)',
    'router.post("/loans/:id/submit-for-hr-verification", zermattOnly, rejectLegacyLoanWorkflowMutation)',
    'router.post("/loans/:id/hr-verification", zermattOnly, rejectLegacyLoanWorkflowMutation)',
    'router.post("/loans/:id/gm-decision", zermattOnly, rejectLegacyLoanWorkflowMutation)',
    'router.post("/loans/:id/disbursement", zermattOnly, rejectLegacyLoanWorkflowMutation)',
    'router.patch("/loans/:id/decision", zermattOnly, rejectLegacyLoanWorkflowMutation)',
    'router.patch("/loans/:id/disburse", zermattOnly, rejectLegacyLoanWorkflowMutation)',
    'router.post("/loans/approved-disbursed", zermattOnly, requireLoanEditor',
    'router.post("/loans/:id/top-up", zermattOnly, requireLoanEditor',
    'router.post(\n  "/payroll/salary-advances"',
    "requireEmployeeFinancialInputEditor",
    "assertEmployeeNumberAccess",
    "assertLoanRecordAccess",
    "ZERMATT_MANUAL_GM_APPROVAL_POLICY",
    "ZERMATT_LEGACY_LOAN_WORKFLOW_RETIRED",
    "assessLoanCollateral",
    "No second loan account was created",
  ], "Zermatt financial-support routes");

  requireText(access, [
    "BRANCH_HR_ROLES",
    "HEAD_HR_ROLES",
    "canManageEmployeeFinancialInputs",
    "canManageLoans",
    "canDeleteEmployeeFinancialInputs",
    "assertLocationWithinAccess",
    "ASSIGNED_LOCATIONS",
  ], "HR financial access control");

  const revisedMount = app.indexOf('app.use("/api", zermattFinancialSupportRoutes);');
  const legacyWorkflowMount = app.indexOf('app.use("/api/loans", loanOriginationWorkflowRoutes);');
  const payrollMount = app.indexOf('app.use("/api/payroll", payrollRoutes);');
  const legacyLoanMount = app.indexOf('app.use("/api/loans", loanRoutes);');
  assert.ok(revisedMount >= 0);
  assert.ok(revisedMount < legacyWorkflowMount);
  assert.ok(revisedMount < payrollMount);
  assert.ok(revisedMount < legacyLoanMount);

  requireText(loansPage, [
    'title="Loans Dashboard"',
    "Record Approved & Disbursed Loan",
    "approved manually by the GM",
    "paid outside CHRiS by Accounts",
    '"/api/loans/approved-disbursed"',
    "Top-Up Amount Approved by GM",
    "New cumulative principal",
    "Revised outstanding",
    "Revised Repayment Schedule",
    "Total installments",
    "Final installment",
    "No second loan account was created",
    "Internal Surety-backed",
    "Loan Recovery History",
    "Branch HR",
    "Head HR",
  ], "Revised Loans UI");
  for (const obsoleteFlow of ["/submit-for-hr-verification", "GM Approve", "Process Disbursement", "Verify & Forward to GM"]) {
    assert.equal(loansPage.includes(obsoleteFlow), false);
  }

  requireText(salaryAdvancesPage, [
    "approved manually by the GM",
    "paid outside CHRiS by Accounts",
    "Record Approved & Paid Salary Advance",
    "GM Approval Date",
    "External Accounts Payment Date",
    "Payroll Recovery Start Month",
    "Payroll Recovery Schedule",
    "Installments",
    "Final installment",
    "Branch HR & Admin Officers",
    'apiRequest("/api/payroll/salary-advances"',
  ], "Revised Salary Advance UI");

  requireText(payrollOperations, [
    'payroll_salary_advances',
    '"outstandingAmount"',
    '"installmentAmount"',
    '"recoveryStartDate"',
    '"status"=\'ACTIVE\'',
    "advanceRecovery",
    'GREATEST(0,"outstandingAmount"-$3)',
  ], "Salary Advance payroll operations");
  requireText(nigeriaPayroll, [
    'FROM "payroll_salary_advances"',
    'AND "status"=\'ACTIVE\'',
    'AND "outstandingAmount" > 0',
    'AND "recoveryStartDate" <= $2::date',
    "const advanceRecovery",
    "grossPay - deductions - advanceRecovery",
  ], "Nigeria Salary Advance calculation");

  assert.ok(migration.includes('COALESCE(NEW."advanceRecovery",0) -') && migration.includes('COALESCE(NEW."loanRecovery",0)'));
  console.log("PASS: ZERMATT branch-scoped HR Loans + Salary Advances policy gate passed.");
});