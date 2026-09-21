const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const full = fs.readFileSync(path.join(root, "src/pages/FullOnboardingWizard.jsx"), "utf8");
const entry = fs.readFileSync(path.join(root, "src/pages/AddOnboardEmployeeEntry.jsx"), "utf8");
const bulk = fs.readFileSync(path.join(root, "backend/src/services/employeeDataOperationsService.js"), "utf8");
const employeeRoutes = fs.readFileSync(path.join(root, "backend/src/routes/employeeRoutes.js"), "utf8");

test("primary employee entry uses one unified onboarding workspace", () => {
  assert.ok(entry.includes('return <FullOnboardingWizard />'));
  assert.equal(entry.includes("QuickAddEmployeeWizard"), false);
  assert.ok(full.includes("EMPLOYEE ENTRY · UNIFIED ONBOARDING"));
  assert.ok(full.includes("Review Once, Submit Once"));
  assert.ok(full.includes("Create Employee & Start Onboarding"));
});

test("unified onboarding contains the complete sequential employee journey", () => {
  for (const expected of [
    "Identity & Contact",
    "Employment Authority",
    "Placement & Structure",
    "Payroll Readiness",
    "Statutory Details",
    "Employee Contacts",
    "Employee Documents",
    "Compliance & Company Property",
    "Tasks & Ownership",
    "Review Once, Submit Once",
  ]) {
    assert.ok(full.includes(expected), `Missing unified onboarding section: ${expected}`);
  }
  for (const sectionKey of [
    '"payment-details"',
    '"statutory-details"',
    '"next-of-kin"',
    '"emergency-contact"',
    '"legal"',
    '"assets"',
  ]) {
    assert.ok(full.includes(sectionKey), `Missing onboarding data section: ${sectionKey}`);
  }
});

test("mapped values are automated instead of re-entered", () => {
  for (const expected of [
    "getActiveLocationId",
    "department?.costCentreId",
    "Employment Level (auto)",
    "Workflow auto-matched",
    "workflowMatchesEmploymentType",
    "openingSalaryRate",
    "Opening salary created with employee",
  ]) {
    assert.ok(full.includes(expected), `Missing onboarding automation: ${expected}`);
  }
  assert.ok(employeeRoutes.includes("costCentreId: true"));
  assert.ok(employeeRoutes.includes("costCentre: {"));
});

test("bulk onboarding mirrors payroll-critical individual fields and derives mapped cost centre", () => {
  for (const expected of [
    "Employment Type",
    "Cost Centre / Operating Unit",
    "Monthly Gross Salary",
    "Salary Currency",
    "Salary Effective From",
    "mappedCostCentre",
    '"Auto from Department"',
  ]) {
    assert.ok(bulk.includes(expected), `Missing bulk onboarding alignment: ${expected}`);
  }
});
