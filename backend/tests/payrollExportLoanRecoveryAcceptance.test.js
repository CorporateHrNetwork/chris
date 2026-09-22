const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("payroll run line reads preserve stored loanRecovery", () => {
  const service = read("backend/src/services/payrollOperationsService.js");
  assert.ok(service.includes('"advanceRecovery","loanRecovery","grossPay"'));
  assert.ok(service.includes("loanRecovery: numberValue(row.loanRecovery) || 0"));
});

test("Nigeria payroll draft response includes stored loanRecovery from the database trigger", () => {
  const service = read("backend/src/services/nigeriaPayrollComplianceService.js");
  assert.ok(service.includes('"advanceRecovery","loanRecovery","grossPay"'));
  assert.ok(service.includes("loanRecovery: Number(row.loanRecovery || 0)"));
});

test("payroll export uses numeric loanRecovery and numeric loanRecoveryTotal fallback", () => {
  const routes = read("backend/src/routes/payrollRoutes.js");
  assert.ok(routes.includes("Number(line.loanRecovery ?? details.loanRecoveryTotal ?? 0)"));
  assert.equal(routes.includes("Number(line.loanRecovery || details.loanRecovery || 0)"), false);
  assert.ok(routes.includes('"Loan Recovery"'));
  assert.ok(routes.includes('["Loan Recoveries", formulaCell(selectedSumFormula("Loan Recovery"), loans), "money"]'));
});

test("loan recovery migration stores run-line values before export", () => {
  const migration = read("backend/prisma/migrations/20260905014500_activate_loans_payroll_recovery/migration.sql");
  assert.ok(migration.includes('ADD COLUMN "loanRecovery" DECIMAL(18,2) NOT NULL DEFAULT 0'));
  assert.ok(migration.includes('NEW."loanRecovery" := ROUND(COALESCE(v_loan_recovery,0),2)'));
  assert.ok(migration.includes("'loanRecoveryTotal', COALESCE(NEW.\"loanRecovery\",0)"));
});
