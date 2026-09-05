const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.resolve(root, p), "utf8");

test("Loans and Salary Advances support controlled editing", () => {
  const service = read("backend/src/services/payrollLiabilityEditService.js");
  const routes = read("backend/src/routes/payrollLiabilityEditRoutes.js");
  const app = read("backend/src/app.js");
  const loansPage = read("src/pages/Loans.jsx");
  const salaryAdvancesPage = read("src/pages/payroll/SalaryAdvancesManaged.jsx");
  const payrollPage = read("src/pages/Payroll.jsx");

  for (const value of [
    "updateSalaryAdvance",
    "SALARY_ADVANCE_FINANCIAL_HISTORY_LOCKED",
    "SALARY_ADVANCE_UPDATED",
    "recoveredAmount",
    'UPDATE "payroll_salary_advances"',
  ]) assert.ok(service.includes(value), `salary advance edit control missing: ${value}`);

  for (const value of [
    "updateLoan",
    "LOAN_FINANCIAL_HISTORY_LOCKED",
    "LOAN_UPDATED",
    'FROM "payroll_loan_recoveries"',
    "postedRecoveryCount",
    "approvalReset",
  ]) assert.ok(service.includes(value), `loan edit control missing: ${value}`);

  assert.ok(routes.includes('router.patch("/payroll/salary-advances/:id"'), "salary advance edit route missing");
  assert.ok(routes.includes('router.patch("/loans/:id"'), "loan edit route missing");
  assert.ok(routes.includes('requirePermission("payroll.manage")'), "liability edits must require payroll.manage");
  assert.ok(app.includes('payrollLiabilityEditRoutes'), "liability edit routes must be mounted");

  for (const source of [loansPage, salaryAdvancesPage]) {
    assert.ok(source.includes(">Edit<"), "edit action must be visible");
    assert.ok(source.includes("Save Changes"), "edit save action must be visible");
    assert.ok(source.includes("Cancel Edit"), "edit cancellation must be visible");
  }

  assert.ok(loansPage.includes("posted recoveries"), "loan UI must explain historical lock");
  assert.ok(salaryAdvancesPage.includes("posted payroll recovery"), "salary advance UI must explain historical lock");
  assert.ok(payrollPage.includes('workspace === "salary-advances"'), "Payroll must route Salary Advances to the editable workspace");

  assert.equal(service.includes('DELETE FROM "payroll_loan_recoveries"'), false, "editing must never delete posted loan recoveries");
  assert.equal(service.includes('DELETE FROM "payroll_run_lines"'), false, "editing must never rewrite payroll run lines");

  console.log("PASS: controlled Loan + Salary Advance editing gate passed.");
});
