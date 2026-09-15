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

test("ZERMATT Loans and Salary Advances use manual GM approval, external payment and payroll-only recording", () => {
  const migration = read("backend/prisma/migrations/20260905014500_activate_loans_payroll_recovery/migration.sql");
  const policyService = read("backend/src/services/zermattFinancialSupportService.js");
  const policyRoutes = read("backend/src/routes/zermattFinancialSupportRoutes.js");
  const app = read("backend/src/app.js");
  const loansPage = read("src/pages/Loans.jsx");
  const salaryAdvancesPage = read("src/pages/payroll/SalaryAdvancesManaged.jsx");
  const payrollOperations = read("backend/src/services/payrollOperationsService.js");
  const nigeriaPayroll = read("backend/src/services/nigeriaPayrollComplianceService.js");

  // Existing payroll posting/reversal mechanics remain authoritative and separate.
  requireText(
    migration,
    [
      'CREATE TABLE "payroll_loans"',
      'CREATE TABLE "payroll_loan_recoveries"',
      'ADD COLUMN "loanRecovery"',
      'CREATE UNIQUE INDEX "payroll_loan_recoveries_loan_run_key"',
      '"status"=\'ACTIVE\'',
      '"outstandingAmount" > 0',
      'GREATEST(',
      'COALESCE(NEW."advanceRecovery",0)',
      'COALESCE(NEW."loanRecovery",0)',
      'STATUTORY_AND_CUSTOM_DEDUCTIONS_THEN_SALARY_ADVANCE_THEN_LOAN',
      'ON CONFLICT ("loanId","runId") DO NOTHING',
      'trg_payroll_run_post_loan_recoveries',
    ],
    "Loan/payroll migration"
  );

  assert.equal(migration.includes('ALTER TABLE "employees"'), false, "Financial support activation must not rewrite Employee data.");
  assert.equal(migration.includes('ALTER TABLE "leave_'), false, "Financial support activation must not rewrite Leave data.");

  requireText(
    policyService,
    [
      'approvalMode: "MANUAL_GM_OUTSIDE_CHRIS"',
      'disbursementMode: "ACCOUNTS_PAYMENT_OUTSIDE_CHRIS"',
      'systemPurpose: "PAYROLL_RECOVERY_RECORD_ONLY"',
      "recordApprovedDisbursedLoan",
      "applyApprovedDisbursedLoanTopUp",
      "recordApprovedDisbursedSalaryAdvance",
      "LOAN_APPROVED_DISBURSED_RECORDED_BY_HEAD_HR",
      "LOAN_TOPUP_APPROVED_DISBURSED_MERGED_BY_HEAD_HR",
      "SALARY_ADVANCE_APPROVED_DISBURSED_RECORDED_BY_HEAD_HR",
      "FOR UPDATE",
      "currentPrincipal + topUpAmount",
      "currentOutstanding + topUpAmount",
      'UPDATE "payroll_loans"',
      "repaymentPlan",
      "installmentCount",
      "endMonth",
      "finalInstallment",
      "markDraftRunsRecalculationRequired",
    ],
    "Zermatt financial-support service"
  );

  requireText(
    policyRoutes,
    [
      'router.post("/loans", zermattOnly, rejectLegacyLoanOrigination)',
      'router.post("/loans/applications", zermattOnly, rejectLegacyLoanOrigination)',
      'router.post("/loans/approved-disbursed"',
      'router.post("/loans/:id/top-up"',
      'router.post("/payroll/salary-advances"',
      "requireHeadHrRecorder",
      'permissions.has("loans.verify")',
      "ZERMATT_MANUAL_GM_APPROVAL_POLICY",
      "assessLoanCollateral",
      "No second loan account was created",
    ],
    "Zermatt financial-support routes"
  );

  const revisedMount = app.indexOf('app.use("/api", zermattFinancialSupportRoutes);');
  const legacyWorkflowMount = app.indexOf('app.use("/api/loans", loanOriginationWorkflowRoutes);');
  const payrollMount = app.indexOf('app.use("/api/payroll", payrollRoutes);');
  const legacyLoanMount = app.indexOf('app.use("/api/loans", loanRoutes);');
  assert.ok(revisedMount >= 0, "revised Zermatt financial-support router must be mounted");
  assert.ok(revisedMount < legacyWorkflowMount, "revised Zermatt policy must intercept obsolete loan origination before the legacy workflow");
  assert.ok(revisedMount < payrollMount, "revised Salary Advance recording must precede generic payroll creation");
  assert.ok(revisedMount < legacyLoanMount, "legacy compatibility loan creation must not bypass the revised Zermatt policy");

  requireText(
    loansPage,
    [
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
      "Top-Up",
      "Loan Recovery History",
    ],
    "Revised Loans UI"
  );
  for (const obsoleteFlow of [
    "/submit-for-hr-verification",
    "GM Approve",
    "Process Disbursement",
    "Verify & Forward to GM",
  ]) {
    assert.equal(loansPage.includes(obsoleteFlow), false, `active Zermatt Loans UI must not expose obsolete in-system workflow: ${obsoleteFlow}`);
  }

  requireText(
    salaryAdvancesPage,
    [
      "approved manually by the GM",
      "paid outside CHRiS by Accounts",
      "Record Approved & Paid Salary Advance",
      "GM Approval Date",
      "External Accounts Payment Date",
      "Payroll Recovery Start Month",
      "Payroll Recovery Schedule",
      "Installments",
      "Final installment",
      'apiRequest("/api/payroll/salary-advances"',
    ],
    "Revised Salary Advance UI"
  );

  // Salary Advances remain a separate payroll liability/recovery engine.
  requireText(
    payrollOperations,
    [
      'payroll_salary_advances',
      '"outstandingAmount"',
      '"installmentAmount"',
      '"recoveryStartDate"',
      '"status"=\'ACTIVE\'',
      "advanceRecovery",
      'GREATEST(0,"outstandingAmount"-$3)',
    ],
    "Salary Advance payroll operations"
  );
  requireText(
    nigeriaPayroll,
    [
      'FROM "payroll_salary_advances"',
      'AND "status"=\'ACTIVE\'',
      'AND "outstandingAmount" > 0',
      'AND "recoveryStartDate" <= $2::date',
      "const advanceRecovery",
      "grossPay - deductions - advanceRecovery",
    ],
    "Nigeria Salary Advance calculation"
  );

  assert.ok(
    migration.includes('COALESCE(NEW."advanceRecovery",0) -') && migration.includes('COALESCE(NEW."loanRecovery",0)'),
    "Loan recovery must remain separate from and subordinate to Salary Advance recovery."
  );

  console.log("PASS: revised ZERMATT Loans + Salary Advances policy gate passed.");
});
