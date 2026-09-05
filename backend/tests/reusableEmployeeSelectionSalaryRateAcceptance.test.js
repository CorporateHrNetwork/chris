const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.resolve(root, relativePath), "utf8");

test("Payroll employee selection is searchable and salary rates auto-populate current gross", () => {
  const employeeOptions = read("backend/src/routes/payrollEmployeeOptionRoutes.js");
  const salaryRates = read("src/pages/payroll/SalaryRatesManaged.jsx");
  const components = read("src/pages/payroll/PayrollComponentsManaged.jsx");
  const rentRelief = read("src/pages/payroll/RentReliefManaged.jsx");
  const salaryAdvances = read("src/pages/payroll/SalaryAdvancesManaged.jsx");
  const loans = read("src/pages/Loans.jsx");
  const payroll = read("src/pages/Payroll.jsx");
  const currencies = read("src/constants/payrollCurrencies.js");

  for (const expected of [
    'FROM "payroll_salary_rates"',
    '"effectiveFrom" <= CURRENT_DATE',
    "currentSalaryRate",
    "amount: Number(currentRate.amount || 0)",
    "currency: currentRate.currency || \"NGN\"",
  ]) {
    assert.ok(employeeOptions.includes(expected), `employee picker salary enrichment missing: ${expected}`);
  }

  assert.ok(salaryRates.includes("<EmployeeSearchSelect"), "Salary Rates must use searchable employee selection.");
  assert.ok(salaryRates.includes("employee?.currentSalaryRate"), "Salary Rates must consume current salary authority from selected employee.");
  assert.ok(salaryRates.includes('amount: currentRate ? String(currentRate.amount ?? "") : ""'), "Selected employee must auto-populate current gross.");
  assert.ok(salaryRates.includes('currency: currentRate?.currency || "NGN"'), "Selected employee must auto-populate current salary currency.");
  assert.ok(salaryRates.includes("Effective From above is intentionally the effective date of the new decision"), "Existing salary start date must not silently become the new salary effective date.");

  for (const code of ["NGN", "USD", "EUR", "GBP"]) {
    assert.ok(currencies.includes(`[\"${code}\"`), `currency option missing: ${code}`);
  }

  for (const source of [salaryRates, components, rentRelief, salaryAdvances, loans]) {
    assert.ok(source.includes("EmployeeSearchSelect"), "Active employee-targeted payroll workflow must use EmployeeSearchSelect.");
  }

  assert.ok(payroll.includes('workspace === "rates"'), "Salary Rates managed route missing.");
  assert.ok(payroll.includes('workspace === "allowances"'), "Allowance managed route missing.");
  assert.ok(payroll.includes('workspace === "deductions"'), "Deduction managed route missing.");
  assert.ok(payroll.includes('workspace === "rent-relief"'), "Rent Relief managed route missing.");
  assert.ok(payroll.includes("<SalaryRatesManaged />"), "Salary Rates managed workspace must be active.");
  assert.ok(payroll.includes('<PayrollComponentsManaged kind="ALLOWANCE" />'), "Allowance picker workspace must be active.");
  assert.ok(payroll.includes('<PayrollComponentsManaged kind="DEDUCTION" />'), "Deduction picker workspace must be active.");
  assert.ok(payroll.includes("<RentReliefManaged />"), "Rent Relief picker workspace must be active.");

  console.log("PASS: reusable employee selection + salary-rate auto-population gate passed.");
});
