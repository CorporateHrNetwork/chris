const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const backendRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(backendRoot, "..");

function read(relativePath) {
  return fs.readFileSync(path.resolve(repoRoot, relativePath), "utf8");
}

function requireText(source, values, label) {
  for (const value of values) {
    assert.ok(source.includes(value), `${label} must include: ${value}`);
  }
}

test("ZERMATT Release-1 Payroll activation gate", () => {
  const migration = read("backend/prisma/migrations/20260904201500_activate_payroll_release1/migration.sql");
  const routes = read("backend/src/routes/payrollRoutes.js");
  const operations = read("backend/src/services/payrollOperationsService.js");
  const readiness = read("backend/src/services/payrollReadinessService.js");
  const payrollPage = read("src/pages/Payroll.jsx");
  const workspace = read("src/pages/payroll/PayrollWorkspace.jsx");
  const sidebar = read("src/components/layout/Sidebar/Sidebar.jsx");

  requireText(
    migration,
    [
      'CREATE TABLE "payroll_periods"',
      'CREATE TABLE "payroll_salary_rates"',
      'CREATE TABLE "payroll_components"',
      'CREATE TABLE "payroll_salary_advances"',
      'CREATE TABLE "payroll_runs"',
      'CREATE TABLE "payroll_run_lines"',
      'CREATE TABLE "payroll_approvals"',
    ],
    "Payroll migration"
  );
  assert.equal(migration.includes('ALTER TABLE "employees"'), false, "Payroll activation must not rewrite the accepted Employee table.");

  requireText(
    routes,
    [
      '"/periods"',
      '"/salary-rates"',
      '"/salary-rates/template"',
      '"/salary-rates/bulk/preview"',
      '"/salary-rates/bulk/import"',
      '["allowances", "ALLOWANCE"]',
      '["deductions", "DEDUCTION"]',
      '"/salary-advances"',
      '"/paid-leave"',
      '"/runs/draft"',
      '"/runs/:id/submit"',
      '"/runs/:id/decision"',
      '"/approvals"',
      '"/payslips"',
      'requirePermission("payroll.view")',
      'requirePermission("payroll.process")',
      'requirePermission("payroll.manage")',
      'PAYROLL_EXECUTION_READINESS_INCOMPLETE',
      'getPayrollReadiness',
    ],
    "Payroll routes"
  );

  requireText(
    operations,
    [
      "PAYROLL_PERIOD_OVERLAP",
      "SALARY_RATE_OVERLAP",
      "PAYROLL_SALARY_RATES_INCOMPLETE",
      "PAYROLL_EMPLOYMENT_AUTHORITY_INCOMPLETE",
      "NOT_AUTOMATED",
      "STATUTORY_REVIEW_CONFIRMATION_REQUIRED",
      "MANUAL_REVIEW_CONFIRMED",
      "paymentPosted: false",
      'leaveType: { isPaid: true }',
      "salaryAdvanceRecoveries",
      "No payment instruction",
    ],
    "Payroll operations service"
  );

  assert.equal(
    /paymentPosted:\s*true/.test(operations),
    false,
    "Release-1 payroll must not claim that payment instructions were posted."
  );

  requireText(
    readiness,
    [
      'FROM "payroll_salary_rates"',
      "compensationReady",
      "readyForExecution: employmentReady && paymentReady && compensationReady",
      "executionEnabled:",
      "finalizationEnabled: false",
      "STATUTORY_AUTOMATION_NOT_ENABLED",
    ],
    "Payroll readiness service"
  );

  requireText(
    payrollPage,
    [
      '"execute"',
      '"periods"',
      '"rates"',
      '"allowances"',
      '"deductions"',
      '"payslips"',
      '"salary-advances"',
      '"paid-leave"',
      '"approvals"',
      "<PayrollWorkspace mode={workspace} />",
      'title="Execute Payroll"',
      'title="Payroll Periods"',
      'title="Salary Rates"',
      'title="Allowances"',
      'title="Deductions"',
      'title="Payslips"',
      'title="Salary Advances"',
      'title="Paid Leave"',
      'title="Payroll Approvals"',
    ],
    "Payroll dashboard"
  );

  requireText(
    workspace,
    [
      "function PeriodsWorkspace()",
      "function RatesWorkspace()",
      "function ComponentsWorkspace",
      "function SalaryAdvancesWorkspace()",
      "function PaidLeaveWorkspace()",
      "function ExecuteWorkspace()",
      "function PayslipsWorkspace()",
      "function ApprovalsWorkspace()",
      "/api/payroll/salary-rates/template",
      "/api/payroll/salary-rates/bulk/preview",
      "/api/payroll/salary-rates/bulk/import",
      "Calculate Draft Payroll",
      "statutoryReviewed",
      "does not transmit payment instructions",
    ],
    "Payroll frontend workspaces"
  );

  const payrollBlockStart = sidebar.indexOf('id:\n            "payroll"');
  const payrollBlockEnd = sidebar.indexOf("COMPENSATION & REWARDS", payrollBlockStart);
  assert.ok(payrollBlockStart >= 0 && payrollBlockEnd > payrollBlockStart, "Payroll sidebar block must exist.");
  const payrollSidebar = sidebar.slice(payrollBlockStart, payrollBlockEnd);
  requireText(
    payrollSidebar,
    [
      '"/payroll?workspace=execute"',
      '"/payroll?workspace=periods"',
      '"/payroll?workspace=rates"',
      '"/payroll?workspace=allowances"',
      '"/payroll?workspace=deductions"',
      '"/payroll?workspace=payslips"',
      '"/payroll?workspace=salary-advances"',
      '"/payroll?workspace=paid-leave"',
      '"/payroll?workspace=approvals"',
      '"/loans"',
    ],
    "Payroll sidebar"
  );
  assert.equal(payrollSidebar.includes("planned:"), false, "Activated Payroll sidebar items must not remain planned.");

  console.log("PASS: ZERMATT Release-1 Payroll activation gate passed.");
});
