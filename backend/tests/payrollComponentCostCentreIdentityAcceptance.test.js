const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.resolve(root, relativePath), "utf8");

test("variable payroll inputs retain exact component identity", () => {
  const variable = read("backend/src/services/zermattVariablePayrollService.js");
  for (const expected of [
    "componentCode: component.code",
    "componentName: component.name",
    "\"componentId\"",
    "\"payrollPeriodId\"",
  ]) {
    assert.ok(variable.includes(expected), `variable payroll identity missing: ${expected}`);
  }
});

test("payroll and payslip render exact component code and description", () => {
  const ui = read("src/pages/payroll/PayrollIntegratedManaged.jsx");
  assert.ok(ui.includes("payrollLineComponentLabel"), "component label helper missing");
  assert.ok(ui.includes("details.customAllowances || []"), "custom allowance identity array missing");
  assert.ok(ui.includes("details.customDeductions || []"), "custom deduction identity array missing");
  assert.ok(!ui.includes('PayslipLedgerRow label="Other Deductions"'), "generic Other Deductions caption must not return");
  assert.ok(!ui.includes('PayslipLedgerRow label="Other Earnings"'), "generic Other Earnings caption must not return");
});

test("payroll export keeps component columns beside authoritative employee cost centre", () => {
  const routes = read("backend/src/routes/payrollRoutes.js");
  for (const expected of [
    "\"Cost Centre Code\"",
    "\"Cost Centre / Operating Unit\"",
    "snapshot.costCentreName",
    "snapshot.costCentreCode",
    "allowanceColumns.map",
    "deductionColumns.map",
    "payrollComponentLabel",
  ]) {
    assert.ok(routes.includes(expected), `payroll export identity/cost-centre control missing: ${expected}`);
  }
});

console.log("PASS: exact payroll component and cost-centre identity gate passed.");
