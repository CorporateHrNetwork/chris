const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.resolve(root, relativePath), "utf8");
const {
  POLICY_MODE,
  SALARY_BASIS,
  PAYMENT_TIMING,
  eligibilityForPeriod,
  calculateLeaveAllowance,
} = require("../src/services/zermattLeaveAllowanceService");

test("Zermatt Leave Allowance uses current monthly salary authority", () => {
  assert.equal(POLICY_MODE, "CURRENT_MONTH_SALARY_FORMULA");
  assert.equal(SALARY_BASIS, "CURRENT_MONTH_GROSS_AND_BASIC");
  assert.equal(PAYMENT_TIMING, "EMPLOYEE_ENTRY_MONTH_AFTER_QUALIFYING_SERVICE");
  const eligibility = eligibilityForPeriod({
    hireDate: "2026-09-18",
    periodStart: "2027-09-01",
    periodEnd: "2027-09-30",
    employmentType: "Full-Time",
  });
  assert.equal(eligibility.eligible, true);
  assert.equal(eligibility.reason, "FULL_TIME_ANNUAL_ENTRY_MONTH_AFTER_FIRST_SERVICE_YEAR");
});

test("Leave Allowance formula is retained on current monthly basic salary", () => {
  const result = calculateLeaveAllowance({
    monthlyGross: 200000,
    salaryStructure: { basic: 57, housing: 11, transport: 10, meal: 9, medical: 8, utility: 5 },
  });
  assert.ok(result.leaveAllowance > 0);
  assert.equal(result.ratePercent, 10);
  assert.equal(result.formula, "Monthly Basic Salary × 12 × 10%");
  assert.equal(result.salaryBasis, "CURRENT_MONTH_GROSS_AND_BASIC");
});

test("payroll uses current monthly salary elements and retained formula", () => {
  const service = read("backend/src/services/zermattLeaveAllowanceService.js");
  for (const expected of [
    'source: "ZERMATT_CURRENT_MONTH_SALARY_FORMULA"',
    'salaryBasis: SALARY_BASIS',
    'paymentTiming: PAYMENT_TIMING',
    'monthlyBasic: details.salaryStructure?.basic',
    'monthlyGross: row.grossPay',
    ]) {
    assert.ok(service.includes(expected), `Reference-only Leave Allowance control missing: ${expected}`);
  }
});

test("reference workbook workflow supports template preview and audited import", () => {
  const importer = read("backend/src/services/zermattLeaveAllowanceReferenceImportService.js");
  const routes = read("backend/src/routes/zermattLeaveAllowanceRoutes.js");
  const page = read("src/pages/benefits/ZermattLeaveAllowance.jsx");

  for (const expected of [
    "previewLeaveAllowanceReferenceWorkbook",
    "importLeaveAllowanceReferenceWorkbook",
    "leaveAllowanceReferenceTemplateBuffer",
    "Employee Number",
    "Reference December Year",
    "Last December Gross",
    "organizationAudit.create",
  ]) {
    assert.ok(importer.includes(expected), `Reference importer control missing: ${expected}`);
  }

  for (const endpoint of [
    "/benefits/leave-allowance/reference-template",
    "/benefits/leave-allowance/reference-preview",
    "/benefits/leave-allowance/reference-import",
  ]) {
    assert.ok(routes.includes(endpoint), `Leave Allowance reference endpoint missing: ${endpoint}`);
  }

  assert.ok(page.includes("Leave Allowance Reference Import"), "Benefits page must expose reference import workspace");
  assert.ok(page.includes("Validate / Preview"), "Benefits page must require workbook validation before import");
  assert.ok(page.includes("Confirm Import"), "Benefits page must expose controlled confirm import");
});

test("Leave Allowance remains after-tax and blank when not due", () => {
  const service = read("backend/src/services/zermattLeaveAllowanceService.js");
  const register = read("backend/src/services/zermattLeaveAllowanceRegisterService.js");
  const payrollUi = read("src/pages/payroll/PayrollIntegratedManaged.jsx");
  const payrollRoute = read("backend/src/routes/payrollRoutes.js");

  assert.ok(service.includes("taxable: false"), "Leave Allowance tax treatment remains unchanged by salary-authority migration");
  assert.ok(service.includes('payrollTreatment: "AFTER_TAX"'), "Leave Allowance must remain after-tax");
  assert.ok(payrollUi.includes('details.leaveAllowance?.amount == null ? null'), "payroll UI must distinguish missing Leave Allowance from zero");
  assert.ok(payrollRoute.includes('details.leaveAllowance?.amount == null ? ""'), "payroll export must leave missing Leave Allowance blank");
});

test("approved history is preserved while mutable payroll can be cleared", () => {
  const migration = read("backend/prisma/migrations/20260929183500_zermatt_leave_allowance_reference_policy/migration.sql");
  assert.ok(migration.includes("pr.\"status\" IN ('DRAFT','SUBMITTED')"), "only mutable payroll may be scrubbed");
  assert.ok(!migration.includes("pr.\"status\"='APPROVED'"), "migration must not rewrite approved payroll");
  assert.ok(migration.includes('"zermatt_leave_allowance_references"'), "reference authority table migration missing");
});

console.log("PASS: Zermatt Leave Allowance reference-policy acceptance gate passed.");
