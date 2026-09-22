const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.resolve(root, relativePath), "utf8");

function includesAll(source, values, label) {
  for (const value of values) assert.ok(source.includes(value), `${label}: missing ${value}`);
}

test("ZERMATT preserves historical loan workflow records while new financial support follows the revised scoped-HR recording policy", () => {
  const migration = read("backend/prisma/migrations/20260906114500_add_loan_origination_payroll_reopen/migration.sql");
  const repostMigration = read("backend/prisma/migrations/20260906122000_allow_reposting_reversed_loan_recovery/migration.sql");
  const legacyRoutes = read("backend/src/routes/loanOriginationWorkflowRoutes.js");
  const legacyWorkflow = read("backend/src/services/loanOriginationWorkflowService.js");
  const revisedRoutes = read("backend/src/routes/zermattFinancialSupportRoutes.js");
  const revisedService = read("backend/src/services/zermattFinancialSupportService.js");
  const access = read("backend/src/services/zermattHrFinancialAccessService.js");
  const reopen = read("backend/src/services/payrollReopenService.js");
  const app = read("backend/src/app.js");
  const loansUi = read("src/pages/Loans.jsx");
  const payrollUi = read("src/pages/payroll/PayrollIntegratedManaged.jsx");

  includesAll(migration, [
    "PENDING_HR_VERIFICATION",
    "PENDING_GM_APPROVAL",
    "AWAITING_DISBURSEMENT",
    "payroll_loan_attachments",
    "payroll_loan_workflow_events",
    "payroll_loan_email_approval_tokens",
    "payroll_loan_notification_outbox",
    "HEAD_HR_VERIFIER",
    "GM_APPROVER",
    "RECOVERY_START_MONTH_FROM_BEGINNING_OF_MONTH",
  ], "historical workflow migration");

  includesAll(legacyRoutes, [
    'router.get("/:id/workflow"',
    'router.get("/email-approval/:token"',
    "assertLoanLocationAccess",
  ], "historical workflow routes");
  includesAll(legacyWorkflow, [
    "LOAN_APPLICATION_FORM_REQUIRED",
    "HR_VERIFIED_AND_FORWARDED_TO_GM",
    "createGmApprovalTokens",
    "markDraftRunsRecalculationRequired",
  ], "historical workflow service");

  includesAll(revisedRoutes, [
    'router.post("/loans", zermattOnly, rejectLegacyLoanOrigination)',
    'router.post("/loans/applications", zermattOnly, rejectLegacyLoanOrigination)',
    "ZERMATT_MANUAL_GM_APPROVAL_POLICY",
    'router.post("/loans/approved-disbursed", zermattOnly, requireLoanEditor',
    'router.post("/loans/:id/top-up", zermattOnly, requireLoanEditor',
    '"/payroll/salary-advances"',
    "requireEmployeeFinancialInputEditor",
    "assertLoanRecordAccess",
  ], "revised Zermatt routes");
  includesAll(revisedService, [
    'approvalMode: "MANUAL_GM_OUTSIDE_CHRIS"',
    'disbursementMode: "ACCOUNTS_PAYMENT_OUTSIDE_CHRIS"',
    'systemPurpose: "PAYROLL_RECOVERY_RECORD_ONLY"',
    '"status","purpose","notes","workflowLocationId","createdByUserId")',
    "LOAN_APPROVED_DISBURSED_RECORDED_BY_HR",
    "LOAN_TOPUP_APPROVED_DISBURSED_MERGED_BY_HR",
    "MAX_REPAYMENT_MONTHS",
    "INVALID_REPAYMENT_TERM",
  ], "revised Zermatt service");
  includesAll(access, [
    "BRANCH_HR_ROLES",
    "HEAD_HR_ROLES",
    "assertLocationWithinAccess",
    "canManageLoans",
  ], "scoped HR access");

  const revisedMount = app.indexOf('app.use("/api", zermattFinancialSupportRoutes);');
  const legacyMount = app.indexOf('app.use("/api/loans", loanOriginationWorkflowRoutes);');
  assert.ok(revisedMount >= 0 && legacyMount >= 0 && revisedMount < legacyMount, "revised Zermatt policy must intercept new origination before legacy workflow routes");

  includesAll(reopen, [
    "PAYROLL_REOPEN_REASON_REQUIRED",
    "PAYROLL_RUN_NOT_APPROVED",
    '"status"=\'REVERSED\'',
    '"outstandingAmount"=LEAST("principalAmount","outstandingAmount"+$3)',
    '"outstandingAmount"=LEAST("amount","outstandingAmount"+$3)',
    '"statutoryStatus"=\'RECALCULATION_REQUIRED\'',
    "APPROVED_PAYROLL_REOPENED_FOR_CORRECTION",
  ], "payroll reopen service");
  includesAll(repostMigration, [
    'ON CONFLICT ("loanId","runId") DO UPDATE',
    '"status"=\'POSTED\'',
    'WHERE "payroll_loan_recoveries"."status"=\'REVERSED\'',
  ], "reapproval repost control");

  includesAll(loansUi, [
    "Record Approved & Disbursed Loan",
    "GM Approval Date",
    "External Accounts Payment Date",
    "Payroll Recovery Start Month",
    "Top-Up Amount Approved by GM",
    "Revised Repayment Schedule",
    "No second loan account was created",
    "canManageLoans",
    "canDeleteEmployeeFinancialInputs",
  ], "active Loans UI");
  for (const obsoleteControl of ["Create & Submit to Head HR", "Verify & Forward to GM", "GM Approve", "Process Disbursement"]) {
    assert.equal(loansUi.includes(obsoleteControl), false, `obsolete active-workflow control must be removed: ${obsoleteControl}`);
  }

  includesAll(payrollUi, [
    "Reopen for Correction",
    "recalculated, submitted and approved again",
    "Draft and Submitted payroll affect Net Pay preview only",
  ], "Payroll UI");

  console.log("PASS: ZERMATT scoped-HR financial-support + historical workflow preservation gate passed.");
});