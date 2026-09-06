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

test("ZERMATT loan origination, email approval, disbursement and reversible payroll recovery gate", () => {
  const migration = read("backend/prisma/migrations/20260906114500_add_loan_origination_payroll_reopen/migration.sql");
  const repostMigration = read("backend/prisma/migrations/20260906122000_allow_reposting_reversed_loan_recovery/migration.sql");
  const permissionMigration = read("backend/prisma/migrations/20260906123000_assign_zermatt_loan_workflow_permissions/migration.sql");
  const locationBackfill = read("backend/prisma/migrations/20260906124000_backfill_loan_workflow_locations/migration.sql");
  const routes = read("backend/src/routes/loanOriginationWorkflowRoutes.js");
  const workflow = read("backend/src/services/loanOriginationWorkflowService.js");
  const notifications = read("backend/src/services/loanWorkflowNotificationService.js");
  const access = read("backend/src/services/loanWorkflowAccessService.js");
  const reopen = read("backend/src/services/payrollReopenService.js");
  const reopenRoutes = read("backend/src/routes/payrollReopenRoutes.js");
  const app = read("backend/src/app.js");
  const loansUi = read("src/pages/Loans.jsx");
  const employeePicker = read("src/components/EmployeeSearchSelect.jsx");
  const payrollUi = read("src/pages/payroll/PayrollIntegratedManaged.jsx");

  includesAll(migration, [
    "PENDING_HR_VERIFICATION",
    "RETURNED_FOR_CORRECTION",
    "PENDING_GM_APPROVAL",
    "AWAITING_DISBURSEMENT",
    "payroll_loan_attachments",
    "payroll_loan_workflow_events",
    "payroll_loan_email_approval_tokens",
    "payroll_loan_recipient_rules",
    "payroll_loan_notification_outbox",
    "REOPENED_FOR_CORRECTION",
    "BRANCH_OPERATIONS_VISIBILITY",
    "INTERNAL_AUDITOR_VISIBILITY",
    "CHIEF_ACCOUNTANT_DISBURSEMENT",
    "BRANCH_ACCOUNTANT_VISIBILITY",
    "ACCOUNTS_OFFICER_VISIBILITY",
    "HEAD_HR_VERIFIER",
    "GM_APPROVER",
    "RECOVERY_START_MONTH_FROM_BEGINNING_OF_MONTH",
    "DATE_TRUNC('month', l.\"recoveryStartDate\") <= DATE_TRUNC('month', v_period_start)",
  ], "workflow migration");

  includesAll(permissionMigration, [
    "loans.view",
    "loans.apply",
    "loans.verify",
    "loans.approve",
    "loans.disburse",
    "HR & Admin Officer",
    "Head of Human Resources",
    "General Manager",
    "Chief Accountant",
    "Internal Auditor",
    "Branch Accountant",
    "Accounts Officer",
  ], "workflow permissions");

  includesAll(locationBackfill, [
    'UPDATE "payroll_loans"',
    'SET "workflowLocationId" = e."locationId"',
    'l."workflowLocationId" IS NULL',
  ], "existing-loan location backfill");

  includesAll(routes, [
    'router.get("/employee-options"',
    'router.get("/summary"',
    'router.get("/recoveries"',
    'router.get("/"',
    'router.post("/applications"',
    'router.patch("/:id"',
    'router.post("/:id/application-form"',
    'router.post("/:id/submit-for-hr-verification"',
    'router.post("/:id/hr-verification"',
    'router.get("/email-approval/:token"',
    'router.post("/:id/gm-decision"',
    'router.post("/:id/disbursement"',
    'router.get("/:id/workflow"',
    'requireAnyPermission("loans.apply", "payroll.manage")',
    'requireAnyPermission("loans.verify", "payroll.manage")',
    'requireAnyPermission("loans.approve", "payroll.manage")',
    'requireAnyPermission("loans.disburse", "payroll.manage")',
    "assertLoanLocationAccess",
  ], "workflow routes");

  includesAll(workflow, [
    "LOAN_APPLICATION_FORM_REQUIRED",
    '"status"=\'PENDING_HR_VERIFICATION\'',
    'nextStatus = "PENDING_GM_APPROVAL"',
    "HR_VERIFIED_AND_FORWARDED_TO_GM",
    "GM_APPROVER_NOT_CONFIGURED",
    "createGmApprovalTokens",
    "LOAN_APPROVAL_LINK_WRONG_USER",
    "LOAN_APPROVAL_LINK_EXPIRED",
    'nextStatus = command === "APPROVE" ? "AWAITING_DISBURSEMENT"',
    '"status"=\'ACTIVE\'',
    "markDraftRunsRecalculationRequired",
    "recoveryStartDate",
    "disbursementReference",
  ], "workflow service");

  includesAll(notifications, [
    "crypto.randomBytes(32)",
    "hashToken",
    "GM_APPROVAL_REQUEST",
    "Authentication is still required",
    "General Manager is the approval action owner",
    "Chief Accountant action required",
    "attachmentIds",
    "payroll_loan_notification_outbox",
    "CHRIS_SMTP_HOST",
    "CHRIS_SMTP_USER",
    "CHRIS_SMTP_PASS",
    "QUEUED",
  ], "notification service");

  includesAll(access, [
    'locationScope === "ALL_LOCATIONS"',
    'locationId: { in: access.locationIds }',
    "LOAN_LOCATION_ACCESS_DENIED",
    "workflowLocationId",
    "employeeName",
    "listVisibleLoans",
    "listVisibleRecoveries",
  ], "location-scoped loan access");

  includesAll(reopenRoutes, [
    'router.post("/runs/:id/reopen"',
    'requireAnyPermission("payroll.manage", "payroll.approve")',
  ], "payroll reopen route");

  includesAll(reopen, [
    "PAYROLL_REOPEN_REASON_REQUIRED",
    "PAYROLL_RUN_NOT_APPROVED",
    "PAYROLL_PERIOD_CLOSED",
    '"status"=\'REVERSED\'',
    '"outstandingAmount"=LEAST("principalAmount","outstandingAmount"+$3)',
    '"outstandingAmount"=LEAST("amount","outstandingAmount"+$3)',
    '"status"=\'DRAFT\'',
    '"statutoryStatus"=\'RECALCULATION_REQUIRED\'',
    "APPROVED_PAYSLIP_SUPERSEDED_UNTIL_REAPPROVAL",
    "APPROVED_PAYROLL_REOPENED_FOR_CORRECTION",
  ], "payroll reopen service");

  includesAll(repostMigration, [
    'ON CONFLICT ("loanId","runId") DO UPDATE',
    '"status"=\'POSTED\'',
    'WHERE "payroll_loan_recoveries"."status"=\'REVERSED\'',
  ], "reapproval repost control");

  includesAll(app, [
    'app.use(\n  "/api/payroll",\n  payrollReopenRoutes',
    'app.use(\n  "/api/loans",\n  loanOriginationWorkflowRoutes',
  ], "route mounting");

  includesAll(employeePicker, [
    'window.location.pathname.startsWith("/loans")',
    '"/api/loans/employee-options"',
  ], "loan employee picker access");

  includesAll(loansUi, [
    "Create & Submit to Head HR",
    "Completed Loan Application Form",
    "Verify & Forward to GM",
    "GM Approve",
    "Process Disbursement",
    "Recovery Start Month",
    "Disbursement Reference",
    "employeeNumber} — {loan.employeeName",
    "reopened payroll changes the posting to REVERSED",
  ], "Loans UI");

  includesAll(payrollUi, [
    "Reopen for Correction",
    "recalculated, submitted and approved again",
    "employeeNumber} — {row.employeeName",
    "Draft and Submitted payroll affect Net Pay preview only",
  ], "Payroll UI");

  console.log("PASS: ZERMATT loan origination + reversible payroll recovery gate passed.");
});
