const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const dataOps = fs.readFileSync(
  path.join(root, "backend/src/services/employeeDataOperationsService.js"),
  "utf8"
);
const routes = fs.readFileSync(
  path.join(root, "backend/src/routes/employeeDataOperationsRoutes.js"),
  "utf8"
);
const frontend = fs.readFileSync(
  path.join(root, "src/pages/BulkEmployeeImport.jsx"),
  "utf8"
);

test("bulk employee template includes opening salary authority columns", () => {
  for (const label of [
    "Monthly Gross Salary",
    "Salary Currency",
    "Salary Effective From",
  ]) {
    assert.ok(dataOps.includes(label), `Missing bulk employee salary column: ${label}`);
  }
});

test("Zermatt bulk employee validation requires payroll-critical authority", () => {
  for (const expected of [
    "Employment Type is required for ZERMATT payroll readiness.",
    "Cost Centre / Operating Unit is required for ZERMATT payroll readiness.",
    "Monthly Gross Salary is required for ZERMATT payroll readiness.",
  ]) {
    assert.ok(dataOps.includes(expected), `Missing Zermatt payroll-readiness validation: ${expected}`);
  }
});

test("bulk import creates opening salary rate through the controlled payroll service", () => {
  assert.ok(routes.includes('require("../services/payrollOperationsService")'));
  assert.ok(routes.includes("payroll.saveSalaryRate"));
  assert.ok(routes.includes('(req.auth.permissions || []).includes("payroll.manage")'));
  assert.ok(routes.includes("Opening salary rate from bulk employee import"));
});

test("bulk employee preview exposes salary and payroll-critical fields", () => {
  for (const expected of [
    "<th>Employment Type</th>",
    "<th>Cost Centre</th>",
    "<th>Opening Salary</th>",
    "Created / review",
  ]) {
    assert.ok(frontend.includes(expected), `Missing bulk preview field: ${expected}`);
  }
});
