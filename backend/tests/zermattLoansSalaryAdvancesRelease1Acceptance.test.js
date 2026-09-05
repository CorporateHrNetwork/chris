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

test("ZERMATT Release-1 Loans and Salary Advances are separate payroll recoveries", () => {
  const migration = read(
    "backend/prisma/migrations/20260905014500_activate_loans_payroll_recovery/migration.sql"
  );
  const loanService = read("backend/src/services/loanService.js");
  const loanRoutes = read("backend/src/routes/loanRoutes.js");
  const app = read("backend/src/app.js");
  const loansPage = read("src/pages/Loans.jsx");
  const payrollOperations = read("backend/src/services/payrollOperationsService.js");
  const nigeriaPayroll = read("backend/src/services/nigeriaPayrollComplianceService.js");

  requireText(
    migration,
    [
      'CREATE TABLE "payroll_loans"',
      'CREATE TABLE "payroll_loan_recoveries"',
      'ADD COLUMN "loanRecovery"',
      "IN ('PENDING_APPROVAL','APPROVED','ACTIVE','PAUSED','COMPLETED','REJECTED','CANCELLED')",
      'CREATE UNIQUE INDEX "payroll_loan_recoveries_loan_run_key"',
      '"loanId","runId"',
      '"status"=\'ACTIVE\'',
      '"outstandingAmount" > 0',
      '"recoveryStartDate" <= v_period_end',
      'GREATEST(',
      'COALESCE(NEW."grossPay",0)',
      'COALESCE(NEW."advanceRecovery",0)',
      'COALESCE(NEW."loanRecovery",0)',
      'STATUTORY_AND_CUSTOM_DEDUCTIONS_THEN_SALARY_ADVANCE_THEN_LOAN',
      'SUM("deductions" + "advanceRecovery" + "loanRecovery")',
      'NEW."status" <> \'APPROVED\'',
      'OLD."status" = \'APPROVED\'',
      'ON CONFLICT ("loanId","runId") DO NOTHING',
      'trg_payroll_run_post_loan_recoveries',
    ],
    "Loan/payroll migration"
  );

  assert.equal(
    migration.includes('ALTER TABLE "employees"'),
    false,
    "Loan activation must not rewrite Employee data."
  );
  assert.equal(
    migration.includes('ALTER TABLE "leave_'),
    false,
    "Loan activation must not rewrite Leave data."
  );
  assert.equal(
    migration.includes('ALTER TABLE "attendance_'),
    false,
    "Loan activation must not rewrite Attendance data."
  );

  requireText(
    loanService,
    [
      '"PENDING_APPROVAL"',
      '"APPROVED"',
      '"ACTIVE"',
      '"PAUSED"',
      'LOAN_APPLICATION_CREATED',
      'LOAN_APPROVED',
      'LOAN_DISBURSED',
      'TOPUP_APPLICATION_CREATED',
      'createTopUp',
      'listRecoveries',
      'payroll_loan_recoveries',
    ],
    "Loan service"
  );

  requireText(
    loanRoutes,
    [
      'requirePermission("payroll.view")',
      'requirePermission("payroll.manage")',
      'router.get("/summary"',
      'router.get("/recoveries"',
      'router.post("/"',
      'router.patch("/:id/decision"',
      'router.patch("/:id/disburse"',
      'router.post("/:id/top-up"',
    ],
    "Loan routes"
  );
  assert.ok(app.includes('app.use(\n  "/api/loans",\n  loanRoutes\n);'), "Loan routes must be mounted.");

  requireText(
    loansPage,
    [
      'apiRequest("/api/loans/summary")',
      'apiRequest("/api/loans")',
      'apiRequest("/api/loans/recoveries")',
      'title="Loans Dashboard"',
      'title="New Loan"',
      'title="Salary Advances"',
      '"/payroll?workspace=salary-advances"',
      'New Loan Application',
      'Loan Register',
      'Loan Recovery History',
      'Approve',
      'Disburse',
      'Top-Up',
    ],
    "Activated Loans UI"
  );
  assert.equal(loansPage.includes('time: "Planned"'), false, "Loans must no longer be a planned-only dashboard.");

  // Salary Advances remain a separate existing payroll liability/recovery engine.
  requireText(
    payrollOperations,
    [
      'payroll_salary_advances',
      '"outstandingAmount"',
      '"installmentAmount"',
      '"recoveryStartDate"',
      '"status"=\'ACTIVE\'',
      'advanceRecovery',
      'GREATEST(0,"outstandingAmount"-$3)',
    ],
    "Salary Advance payroll operations"
  );
  requireText(
    nigeriaPayroll,
    [
      'FROM "payroll_salary_advances"',
      'AND "status"=\'ACTIVE\'',
      'AND "outstandingAmount" > 0',
      'AND "recoveryStartDate" <= $2::date',
      'const advanceRecovery',
      'grossPay - deductions - advanceRecovery',
    ],
    "Nigeria Salary Advance calculation"
  );

  assert.ok(
    migration.includes('COALESCE(NEW."advanceRecovery",0) -') &&
      migration.includes('COALESCE(NEW."loanRecovery",0)'),
    "Loan recovery must be applied after Salary Advance recovery, not merged into it."
  );

  console.log("PASS: ZERMATT Loans + Salary Advances Release-1 payroll recovery gate passed.");
});
