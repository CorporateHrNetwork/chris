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

test("Zermatt Leave Allowance is reference-import only", () => {
  assert.equal(POLICY_MODE, "REFERENCE_SALARY_FORMULA");
  assert.equal(SALARY_BASIS, "LAST_DECEMBER_GROSS");
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

test("Leave Allowance formula is retained on December salary reference", () => {
  const result = calculateLeaveAllowance({
    referenceMonthlyGross: 200000,
    salaryStructure: { basic: 57, housing: 11, transport: 10, meal: 9, medical: 8, utility: 5 },
  });
  assert.ok(result.leaveAllowance > 0);
  assert.equal(result.ratePercent, 10);
  assert.equal(result.formula, "Reference December Basic Salary × 12 × 10%");
  assert.equal(result.salaryBasis, "LAST_DECEMBER_GROSS");
});

test("payroll uses imported December salary reference and retained formula", () => {
  const service = read("backend/src/services/zermattLeaveAllowanceService.js");
  for (const expected of [
    '"zermatt_leave_allowance_references"',
    '"status"=\'ACTIVE\'',
    'source: "ZERMATT_DECEMBER_SALARY_REFERENCE_FORMULA"',
    'salaryBasis: SALARY_BASIS',
    'paymentTiming: PAYMENT_TIMING',
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

test("Leave Allowance remains non-taxable and blank without reference", () => {
  const service = read("backend/src/services/zermattLeaveAllowanceService.js");
  const register = read("backend/src/services/zermattLeaveAllowanceRegisterService.js");
  const payrollUi = read("src/pages/payroll/PayrollIntegratedManaged.jsx");
  const payrollRoute = read("backend/src/routes/payrollRoutes.js");

  assert.ok(service.includes("taxable: false"), "referenced Leave Allowance must remain non-taxable");
  assert.ok(service.includes('payrollTreatment: "AFTER_TAX_NON_TAXABLE"'), "referenced Leave Allowance must remain after-tax");
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
