const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.resolve(repoRoot, relativePath), "utf8");
}

function requireText(source, values, label) {
  for (const value of values) {
    assert.ok(source.includes(value), `${label} must include: ${value}`);
  }
}

test("ZERMATT Release-1 Payroll activation and Nigeria compliance gate", () => {
  const foundationMigration = read("backend/prisma/migrations/20260904201500_activate_payroll_release1/migration.sql");
  const complianceMigration = read("backend/prisma/migrations/20260904233000_add_zermatt_nigeria_payroll_compliance/migration.sql");
  const routes = read("backend/src/routes/payrollRoutes.js");
  const operations = read("backend/src/services/payrollOperationsService.js");
  const statutory = read("backend/src/services/nigeriaPayrollComplianceService.js");
  const approvalCompliance = read("backend/src/services/payrollApprovalComplianceService.js");
  const readiness = read("backend/src/services/payrollReadinessService.js");
  const payrollPage = read("src/pages/Payroll.jsx");
  const nigeriaWorkspace = read("src/pages/payroll/NigeriaPayrollWorkspace.jsx");
  const supplementWorkspace = read("src/pages/payroll/NigeriaPayrollSupplementWorkspace.jsx");
  const sidebar = read("src/components/layout/Sidebar/Sidebar.jsx");

  requireText(foundationMigration, [
    'CREATE TABLE "payroll_periods"',
    'CREATE TABLE "payroll_salary_rates"',
    'CREATE TABLE "payroll_components"',
    'CREATE TABLE "payroll_salary_advances"',
    'CREATE TABLE "payroll_runs"',
    'CREATE TABLE "payroll_run_lines"',
    'CREATE TABLE "payroll_approvals"',
  ], "Payroll foundation migration");
  assert.equal(foundationMigration.includes('ALTER TABLE "employees"'), false, "Payroll activation must not rewrite the accepted Employee table.");

  requireText(complianceMigration, [
    'CREATE TABLE "payroll_policy_versions"',
    'CREATE TABLE "payroll_tax_reliefs"',
    'zermatt-liquor-limited',
    '"basic":57', '"housing":11', '"transport":10', '"meal":9', '"medical":8', '"utility":5',
    '"Full-Time":26', '"Part-Time":16',
    '["basic","housing","transport"]',
    '"rentReliefRate":20', '"rentReliefCap":500000', '"minimumWageMonthly":70000',
    '"bands":[{"limit":800000,"rate":0},{"limit":2200000,"rate":15},{"limit":9000000,"rate":18},{"limit":13000000,"rate":21},{"limit":25000000,"rate":23},{"limit":null,"rate":25}]',
    '"employeeDeduction":false',
  ], "ZERMATT Nigeria compliance migration");
  assert.equal(complianceMigration.includes('ALTER TABLE "employees"'), false, "Compliance policy must not rewrite Employee authority.");

  requireText(statutory, [
    "calculateAnnualPaye", "calculateStructure", "PAYROLL_STANDARD_DAYS_NOT_CONFIGURED",
    "PAYROLL_SALARY_RATES_INCOMPLETE", "attendancePayrollInput.findMany", "STANDARD_DAYS_DEFAULT",
    "ATTENDANCE_PAYROLL_INPUT", "pensionableBase", "employeePension", "employerPension",
    "payeTax", "rentReliefAnnual", "nsitfEmployeeDeduction: 0", "itfEmployeeDeduction: 0",
    "CALCULATED_NIGERIA_2026",
  ], "Nigeria payroll calculation service");
  assert.equal(/nsitfEmployeeDeduction:\s*[1-9]/.test(statutory), false, "NSITF must never become an employee deduction.");
  assert.equal(/itfEmployeeDeduction:\s*[1-9]/.test(statutory), false, "ITF must never become an employee deduction.");

  requireText(approvalCompliance, [
    "validateNigeriaPayrollApproval", "NIGERIA_STATUTORY_IDENTIFIERS_INCOMPLETE",
    "taxIdentificationNumber", "payeState", "pensionPfa", "pensionPin",
  ], "Nigeria payroll approval compliance");

  requireText(routes, [
    '"/compliance-policy"', '"/tax-reliefs"', '"/tax-reliefs/rent"', '"/tax-reliefs/:id/decision"',
    '"/periods"', '"/salary-rates"', '"/salary-rates/template"', '"/salary-rates/bulk/preview"',
    '"/salary-rates/bulk/import"', '["allowances", "ALLOWANCE"]', '["deductions", "DEDUCTION"]',
    '"/salary-advances"', '"/paid-leave"', '"/runs/draft"', '"/runs/:id/submit"',
    '"/runs/:id/decision"', '"/approvals"', '"/payslips"',
    'requirePermission("payroll.view")', 'requirePermission("payroll.process")', 'requirePermission("payroll.manage")',
    "PAYROLL_EXECUTION_READINESS_INCOMPLETE", "executeNigeriaDraftPayroll", "validateNigeriaPayrollApproval",
  ], "Payroll routes");

  requireText(operations, [
    "PAYROLL_PERIOD_OVERLAP", "SALARY_RATE_OVERLAP", "salaryAdvanceRecoveries",
    "paymentPosted: false", 'leaveType: { isPaid: true }',
  ], "Payroll operations");
  assert.equal(/paymentPosted:\s*true/.test(operations), false, "Payroll approval must not claim that bank payment was posted.");

  requireText(readiness, [
    'FROM "payroll_salary_rates"', 'FROM "payroll_policy_versions"',
    "readyForExecution: employmentReady && paymentReady && compensationReady",
    "statutoryCalculationEnabled", "paymentTransmissionEnabled: false", "PAYMENT_TRANSMISSION_SEPARATE_CONTROL",
  ], "Payroll readiness");
  assert.equal(readiness.includes("STATUTORY_AUTOMATION_NOT_ENABLED"), false, "Readiness must not claim Nigeria PAYE/pension automation is unavailable after activation.");

  requireText(payrollPage, [
    '"execute"', '"periods"', '"rates"', '"allowances"', '"deductions"', '"payslips"',
    '"salary-advances"', '"paid-leave"', '"approvals"', '"statutory"', '"rent-relief"',
    "NigeriaPayrollWorkspace", "NigeriaPayrollSupplementWorkspace",
    'title="Execute Payroll"', 'title="Payroll Periods"', 'title="Salary Rates"',
    'title="Nigeria Statutory Setup"', 'title="Tax Rent Relief"', 'title="Other Allowances"',
    'title="Other Deductions"', 'title="Payslips"', 'title="Payroll Approvals"',
  ], "Payroll dashboard");

  requireText(nigeriaWorkspace, [
    "Nigeria-Compliant Draft Payroll", "26/16", "Tax Rent Relief", "20% of annual rent paid",
    "Save for Verification", "/api/payroll/tax-reliefs/rent", "/api/payroll/compliance-policy",
  ], "Nigeria payroll workspaces");

  requireText(supplementWorkspace, [
    "Other Allowances", "Other Deductions", "Taxable earning (default)",
    "PAYE and pension are statutory calculations and should not be recreated here",
    "I confirm I reviewed CHRiS-calculated PAYE/pension",
    'const path = kind === "ALLOWANCE" ? "allowances" : "deductions"',
    "/api/payroll/payslips", "/api/payroll/approvals",
  ], "Nigeria payroll supplement workspaces");

  const payrollBlockStart = sidebar.indexOf('id:\n            "payroll"');
  const payrollBlockEnd = sidebar.indexOf("COMPENSATION & REWARDS", payrollBlockStart);
  assert.ok(payrollBlockStart >= 0 && payrollBlockEnd > payrollBlockStart, "Payroll sidebar block must exist.");
  const payrollSidebar = sidebar.slice(payrollBlockStart, payrollBlockEnd);
  requireText(payrollSidebar, [
    '"/payroll?workspace=execute"', '"/payroll?workspace=periods"', '"/payroll?workspace=rates"',
    '"/payroll?workspace=allowances"', '"/payroll?workspace=deductions"', '"/payroll?workspace=payslips"',
    '"/payroll?workspace=salary-advances"', '"/payroll?workspace=paid-leave"',
    '"/payroll?workspace=approvals"', '"/loans"',
  ], "Payroll sidebar");
  assert.equal(payrollSidebar.includes("planned:"), false, "Activated Payroll sidebar items must not remain planned.");

  console.log("PASS: ZERMATT Release-1 Payroll activation and Nigeria compliance gate passed.");
});
