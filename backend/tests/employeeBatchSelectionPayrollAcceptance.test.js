const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.resolve(root, relativePath), "utf8");

test("employee selection is reusable and payroll supports search, checkboxes, view-selected and batch actions", () => {
  const selector = read("src/components/EmployeeBatchSelector.jsx");
  const payroll = read("src/pages/payroll/PayrollIntegratedManaged.jsx");

  for (const expected of [
    "Search / Select Employees",
    "Select visible",
    "Unselect visible",
    "View Selected",
    "Show All",
    "Clear Selection",
    "selectedRows",
    "renderActions",
    "getId",
    "getSearchText",
  ]) assert.ok(selector.includes(expected), `missing reusable employee batch selector capability: ${expected}`);

  assert.ok(payroll.includes('import EmployeeBatchSelector from "../../components/EmployeeBatchSelector"'), "payroll must use the reusable employee batch selector");
  assert.ok(payroll.includes("Employee Payroll Calculation"), "payroll employee calculation section must remain available");
  assert.ok(payroll.includes('columns={["Select", "Employee"'), "payroll lines must expose an individual checkbox column");
  assert.ok(payroll.includes("Batch View Selected Payslips"), "payslips must expose a batch view action");
  assert.ok(payroll.includes("Selected batch:"), "payroll selection must expose batch totals for review");
  assert.ok(payroll.includes("searchPlaceholder=\"Search employee number, name, employment type or cost centre\""), "payroll employee search must support useful employee context");
  assert.ok(payroll.includes("aria-label={`Select ${row.employeeNumber} ${row.employeeName}`}"), "individual payroll employee checkboxes must be accessible");

  console.log("PASS: reusable employee batch-selection payroll gate passed.");
});
