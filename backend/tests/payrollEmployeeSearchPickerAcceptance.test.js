const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.resolve(repoRoot, relativePath), "utf8");

function requireText(source, values, label) {
  for (const value of values) {
    assert.ok(source.includes(value), `${label} must include: ${value}`);
  }
}

test("Loans and Salary Advances use a searchable payroll employee selector", () => {
  const route = read("backend/src/routes/payrollEmployeeOptionRoutes.js");
  const app = read("backend/src/app.js");
  const picker = read("src/components/EmployeeSearchSelect.jsx");
  const loans = read("src/pages/Loans.jsx");
  const payroll = read("src/pages/payroll/PayrollWorkspace.jsx");

  requireText(route, [
    'requirePermission("payroll.view")',
    'status: { in: CURRENT_PAYROLL_STATUSES }',
    'employeeNumber: true',
    'department:',
    'designation:',
    'employeeName:',
  ], "Payroll employee option route");

  requireText(app, [
    'payrollEmployeeOptionRoutes',
    '"/api/payroll/employee-options"',
  ], "App route mount");

  requireText(picker, [
    'apiRequest("/api/payroll/employee-options")',
    'role="combobox"',
    'role="listbox"',
    'option.employeeNumber',
    'option.employeeName',
    'option.department',
    'option.designation',
    'onChange?.(option.employeeNumber, option)',
    'Search employee number or name',
  ], "Searchable employee picker");

  requireText(loans, [
    'import EmployeeSearchSelect from "../components/EmployeeSearchSelect"',
    '<EmployeeSearchSelect',
    'label="Employee"',
    'placeholder="Search employee number or name"',
    'employeeNumber: topUpParent?.employeeNumber || form.employeeNumber',
  ], "Loan application employee selection");
  assert.equal(
    loans.includes('<label><small>Employee Number</small><input'),
    false,
    "Loan application must not retain the manual Employee Number textbox."
  );

  requireText(payroll, [
    'import EmployeeSearchSelect from "../../components/EmployeeSearchSelect"',
    'function SalaryAdvancesWorkspace()',
    '<EmployeeSearchSelect',
    'value={form.employeeNumber}',
    'onChange={(employeeNumber) => setForm((p) => ({ ...p, employeeNumber }))}',
    'disabled={busy || !form.employeeNumber}',
  ], "Salary Advance employee selection");

  console.log("PASS: Loan and Salary Advance employee search/dropdown gate passed.");
});
