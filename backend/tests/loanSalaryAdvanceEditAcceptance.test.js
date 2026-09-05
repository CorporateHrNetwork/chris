const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.resolve(root, p), "utf8");

test("Loans and Salary Advances support controlled editing", () => {
  const payroll = read("backend/src/services/payrollOperationsService.js");
  const payrollRoutes = read("backend/src/routes/payrollRoutes.js");
  const loanService = read("backend/src/services/loanService.js");
  const loanRoutes = read("backend/src/routes/loanRoutes.js");
  const loansPage = read("src/pages/Loans.jsx");
  const payrollPage = read("src/pages/payroll/PayrollWorkspace.jsx");

  for (const value of [
    "updateSalaryAdvance",
    "SALARY_ADVANCE_FINANCIAL_HISTORY_LOCKED",
    "SALARY_ADVANCE_UPDATED",
    'FROM "payroll_run_lines"',
    '"advanceRecovery" > 0',
  ]) assert.ok(payroll.includes(value), `salary advance edit control missing: ${value}`);

  assert.ok(payrollRoutes.includes('router.patch("/salary-advances/:id"'), "salary advance edit route missing");
  assert.ok(payrollRoutes.includes("updateSalaryAdvance({"), "salary advance edit route must call updateSalaryAdvance");

  for (const value of [
    "updateLoan",
    "LOAN_FINANCIAL_HISTORY_LOCKED",
    "LOAN_UPDATED",
    'FROM "payroll_loan_recoveries"',
    "postedRecoveryCount",
  ]) assert.ok(loanService.includes(value), `loan edit control missing: ${value}`);

  assert.ok(loanRoutes.includes('router.patch("/:id"'), "loan edit route missing");
  assert.ok(loanRoutes.includes("loans.updateLoan({"), "loan edit route must call updateLoan");

  for (const source of [loansPage, payrollPage]) {
    assert.ok(source.includes(">Edit<"), "edit action must be visible");
    assert.ok(source.includes(">Save Changes<"), "edit save action must be visible");
    assert.ok(source.includes(">Cancel Edit<"), "edit cancellation must be visible");
  }

  assert.ok(loansPage.includes("posted recoveries"), "loan UI must explain historical lock");
  assert.ok(payrollPage.includes("posted payroll recovery"), "salary advance UI must explain historical lock");

  console.log("PASS: controlled Loan + Salary Advance editing gate passed.");
});
