const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.resolve(root, p), "utf8");

test("Legacy liability correction safeguards remain while revised Zermatt entry uses approved/disbursed recording", () => {
  const service = read("backend/src/services/payrollLiabilityEditService.js");
  const routes = read("backend/src/routes/payrollLiabilityEditRoutes.js");
  const revisedService = read("backend/src/services/zermattFinancialSupportService.js");
  const loansPage = read("src/pages/Loans.jsx");
  const salaryAdvancesPage = read("src/pages/payroll/SalaryAdvancesManaged.jsx");
  const payrollPage = read("src/pages/Payroll.jsx");

  for (const value of [
    "updateSalaryAdvance",
    "SALARY_ADVANCE_FINANCIAL_HISTORY_LOCKED",
    "SALARY_ADVANCE_CLOSED_RECORD_LOCKED",
    "SALARY_ADVANCE_UPDATED",
    'UPDATE "payroll_salary_advances"',
    "updateLoan",
    "LOAN_FINANCIAL_HISTORY_LOCKED",
    "LOAN_UPDATED",
    'FROM "payroll_loan_recoveries"',
    "postedRecoveryCount",
    "LOAN_CLOSED_RECORD_LOCKED",
  ]) assert.ok(service.includes(value), `historical correction safeguard missing: ${value}`);

  assert.ok(routes.includes('router.patch("/payroll/salary-advances/:id"'), "salary advance correction route missing");
  assert.ok(routes.includes('router.patch("/loans/:id"'), "legacy loan correction route must remain for historical records");
  assert.ok(routes.includes('requirePermission("payroll.manage")'), "legacy liability correction must remain privileged");

  // Salary Advance corrections remain visible because future installment/recovery settings may be adjusted.
  assert.ok(salaryAdvancesPage.includes(">Edit<"), "salary advance edit action must remain visible");
  assert.ok(salaryAdvancesPage.includes("Save Changes"), "salary advance correction save action must remain visible");
  assert.ok(salaryAdvancesPage.includes("posted payroll recovery"), "salary advance UI must explain historical lock");

  // Revised loans are not re-originated through the old edit/approval workflow. Top-up is the controlled
  // balance-changing operation and it updates the same locked loan account transactionally.
  for (const value of [
    "Top-Up Amount Approved by GM",
    "New cumulative principal",
    "Revised outstanding",
    "Revised Repayment Schedule",
    "No second loan account was created",
  ]) assert.ok(loansPage.includes(value), `revised loan top-up control missing: ${value}`);
  for (const value of [
    "FOR UPDATE",
    "currentPrincipal + topUpAmount",
    "currentOutstanding + topUpAmount",
    'UPDATE "payroll_loans"',
  ]) assert.ok(revisedService.includes(value), `transactional top-up safeguard missing: ${value}`);

  assert.ok(payrollPage.includes('workspace === "salary-advances"'), "Payroll must route Salary Advances to the managed workspace");
  assert.equal(service.includes('DELETE FROM "payroll_loan_recoveries"'), false, "correction must never delete posted loan recoveries");
  assert.equal(service.includes('DELETE FROM "payroll_run_lines"'), false, "correction must never rewrite payroll run lines");
  assert.ok(service.includes("previousValue"), "edits must retain previous values in audit history");
  assert.ok(service.includes("newValue"), "edits must retain new values in audit history");

  console.log("PASS: liability correction + revised Zermatt top-up safeguards passed.");
});
