const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const read = (file) => fs.readFileSync(path.resolve(root, file), "utf8");

test("Payroll integrates loan recovery, approved payslips and statutory review", () => {
  const loanMigration = read("backend/prisma/migrations/20260905014500_activate_loans_payroll_recovery/migration.sql");
  const integrationRoutes = read("backend/src/routes/payrollIntegrationRoutes.js");
  const statutoryService = read("backend/src/services/payrollStatutoryCatalogueService.js");
  const app = read("backend/src/app.js");
  const ui = read("src/pages/payroll/PayrollIntegratedManaged.jsx");
  const payroll = read("src/pages/Payroll.jsx");

  for (const expected of [
    'ADD COLUMN "loanRecovery"',
    '"status"=\'ACTIVE\'',
    '"outstandingAmount" > 0',
    '"recoveryStartDate" <= v_period_end',
    "STATUTORY_AND_CUSTOM_DEDUCTIONS_THEN_SALARY_ADVANCE_THEN_LOAN",
    "chris_post_loan_recoveries_on_payroll_approval",
  ]) {
    assert.ok(loanMigration.includes(expected), `loan/payroll integration control missing: ${expected}`);
  }

  assert.ok(integrationRoutes.includes('router.get("/runs/:id/integrated-lines"'), "integrated payroll line endpoint missing");
  assert.ok(integrationRoutes.includes('"loanRecovery"'), "integrated payroll lines must carry loanRecovery");
  assert.ok(integrationRoutes.includes('router.get("/payslips"'), "approved payslip endpoint missing");
  assert.ok(integrationRoutes.includes("pr.\"status\"='APPROVED'"), "payslips must be restricted to approved payroll runs");
  assert.ok(integrationRoutes.includes("GENERATED_FROM_APPROVED_PAYROLL"), "payslip source status missing");
  assert.ok(integrationRoutes.includes('router.get("/statutory-catalogue"'), "statutory review endpoint missing");

  for (const expected of ["PAYE", "PENSION", "NHF", "NSITF_ECS", "ITF", "GROUP_LIFE", "REVIEW_BEFORE_ACTIVATION", "EMPLOYER_ONLY"]) {
    assert.ok(statutoryService.includes(expected), `statutory catalogue item/control missing: ${expected}`);
  }

  assert.ok(app.includes('payrollIntegrationRoutes'), "payroll integration routes must be mounted");
  assert.ok(ui.includes("Salary Advance"), "integrated payroll UI must show Salary Advance recovery");
  assert.ok(ui.includes("Loan"), "integrated payroll UI must show Loan recovery");
  assert.ok(ui.includes("View Payslip"), "approved payroll payslip UI missing");
  assert.ok(ui.includes("Print Payslip"), "printable payslip action missing");
  assert.ok(ui.includes("statutory-catalogue"), "statutory review UI missing");
  assert.ok(payroll.includes('PayrollIntegratedManaged'), "Payroll must route integrated workspaces through the new managed workspace");

  console.log("PASS: integrated payroll liabilities, payslips and statutory review gate passed.");
});
