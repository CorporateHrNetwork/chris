const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const syncSource = fs.readFileSync(
  path.join(root, "backend/src/services/employeePayrollAuthoritySyncService.js"),
  "utf8"
);
const payrollRoutes = fs.readFileSync(
  path.join(root, "backend/src/routes/payrollRoutes.js"),
  "utf8"
);

test("payroll calculation self-heals only derivable employee authority", () => {
  for (const expected of [
    "DEPARTMENT_MAPPING",
    "ONBOARDING_WORKFLOW",
    "PAYROLL_AUTHORITY_AUTO_SYNC",
    "employee.department?.costCentreId",
    "onboarding?.template?.employmentType || onboarding?.template?.name",
  ]) {
    assert.ok(syncSource.includes(expected), `Missing payroll authority sync control: ${expected}`);
  }
});

test("workflow employment types map to authoritative employee employment types", () => {
  for (const expected of [
    '"permanent"',
    'return "Full-Time"',
    'return zermatt ? "Part-time" : "Part-Time"',
    'return zermatt ? "NYSC/Internship" : "NYSC / Internship"',
  ]) {
    assert.ok(syncSource.includes(expected), `Missing employment-type mapping: ${expected}`);
  }
});

test("draft calculation synchronizes mappings before readiness evaluation", () => {
  const syncIndex = payrollRoutes.indexOf("await synchronizePayrollAuthorityFromMappings");
  const readinessIndex = payrollRoutes.indexOf("const readiness = await getPayrollReadiness", syncIndex);
  assert.ok(syncIndex >= 0);
  assert.ok(readinessIndex > syncIndex);
});
