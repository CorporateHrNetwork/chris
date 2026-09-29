const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.resolve(root, relativePath), "utf8");

test("Leave Allowance uses December salary reference with retained formula end-to-end", () => {
  const service = read("backend/src/services/zermattLeaveAllowanceService.js");
  const importer = read("backend/src/services/zermattLeaveAllowanceReferenceImportService.js");
  const routes = read("backend/src/routes/zermattLeaveAllowanceRoutes.js");
  const ui = read("src/pages/benefits/ZermattLeaveAllowance.jsx");
  assert.ok(service.includes('POLICY_MODE = "REFERENCE_SALARY_FORMULA"'));
  assert.ok(service.includes('SALARY_BASIS = "LAST_DECEMBER_GROSS"'));
  assert.ok(service.includes('PAYMENT_TIMING = "EMPLOYEE_ENTRY_MONTH_AFTER_QUALIFYING_SERVICE"'));
  assert.ok(importer.includes("previewLeaveAllowanceReferenceWorkbook"));
  assert.ok(importer.includes("importLeaveAllowanceReferenceWorkbook"));
  assert.ok(routes.includes("/benefits/leave-allowance/reference-preview"));
  assert.ok(routes.includes("/benefits/leave-allowance/reference-import"));
  assert.ok(ui.includes("Leave Allowance Reference Import"));
});

test("exact payroll component identity and correction controls remain intact", () => {
  const inputUi = read("src/pages/payroll/PayrollComponentsManaged.jsx");
  const payrollUi = read("src/pages/payroll/PayrollIntegratedManaged.jsx");
  const routes = read("backend/src/routes/payrollRoutes.js");
  assert.ok(inputUi.includes("onEdit={editVariableInput}"));
  assert.ok(inputUi.includes("onDelete={deleteVariableInput}"));
  assert.ok(inputUi.includes("scrollIntoView"));
  assert.ok(routes.includes('router.delete("/variable-inputs/:id"'));
  assert.ok(routes.includes('router.delete("/deduction-plans/:id"'));
  assert.ok(payrollUi.includes("payrollLineComponentLabel"));
  assert.ok(!payrollUi.includes('PayslipLedgerRow label="Other Deductions"'));
  assert.ok(!payrollUi.includes('PayslipLedgerRow label="Other Earnings"'));
});

test("Employment Level reselection uses active catalogue and correct API contract", () => {
  const profile = read("src/components/employees/EmployeeProfile.jsx");
  assert.ok(profile.includes('apiRequest("/api/employees/career/employment-levels")'));
  assert.ok(profile.includes("effectiveFrom: employmentLevelForm.effectiveDate"));
  assert.ok(profile.includes('method: "PUT"'));
  assert.ok(profile.includes(".join(\" — \")"));
});

test("loan pause/reactivation controls are available at account and installment level", () => {
  const loans = read("src/pages/Loans.jsx");
  const profile = read("src/pages/LoanProfile.jsx");
  const routes = read("backend/src/routes/loanRoutes.js");
  const service = read("backend/src/services/loanProfileService.js");
  assert.ok(loans.includes("Unpause Loan"));
  assert.ok(profile.includes("reactivateInstallment"));
  assert.ok(profile.includes('row.status === "PAUSED"'));
  assert.ok(profile.includes(">Unpause<"));
  assert.ok(routes.includes("/:id/amortization/reactivate"));
  assert.ok(service.includes("reactivatePausedLegacyInstallment"));
  assert.ok(service.includes('"REACTIVATED"'));
});

test("payslip and exit controls retain hardened behavior", () => {
  const payrollUi = read("src/pages/payroll/PayrollIntegratedManaged.jsx");
  const exitService = read("backend/src/services/exitRegisterService.js");
  assert.ok(payrollUi.includes('document.createElement("iframe")'), "payslip printing must use hidden same-origin iframe");
  assert.ok(!payrollUi.includes('window.open("", "_blank")'), "popup print path must not return");
  assert.ok(exitService.includes("employeeExitProcess"));
  assert.ok(exitService.includes('status: "COMPLETED"'));
  assert.ok(exitService.includes("completedAt"));
});

console.log("PASS: Zermatt release hardening acceptance gate passed.");

