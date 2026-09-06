const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.resolve(root, relativePath), "utf8");
const { buildAmortizationSchedule } = require("../src/services/loanProfileService");

function event(periodStart, status, amount = 0, reason = "") {
  return { periodStart, status, amount, reason, source: "OPENING_MIGRATION" };
}

test("ZERMATT August 2026 loan history uses full paid/paused installments and Loans has employee search", () => {
  const migration = read("backend/prisma/migrations/20260906134500_zermatt_legacy_loan_history_and_full_installments/migration.sql");
  const service = read("backend/src/services/loanProfileService.js");
  const loansUi = read("src/pages/Loans.jsx");

  for (const expected of [
    "payroll_loan_legacy_period_events",
    "ZLL000055",
    "ZLL000185",
    "2026-08-01",
    "PAUSED",
    "FULL_INSTALLMENT_ONLY",
    "loanRecoveryShortfall",
    "ELSE 0",
  ]) {
    assert.ok(migration.includes(expected), `missing August/full-installment migration control: ${expected}`);
  }

  assert.ok(!service.includes('status = "PARTIAL"'), "loan profile must not classify deductions as PARTIAL");
  assert.ok(service.includes('status = "PAUSED"'), "loan profile must expose explicit paused periods");
  assert.ok(service.includes('schedule.find((row) => row.status === "PENDING")'), "next payment must skip historical PAUSED rows and point to the next pending month");
  assert.ok(service.includes('partialInstallmentsPermitted: false'), "profile controls must state that partial installments are not permitted");
  assert.ok(service.includes('ABSORB_UP_TO_ONE_NAIRA_INTO_FINAL_INSTALLMENT'), "micro residuals must not create a separate 0.xx installment");

  const regular = buildAmortizationSchedule({
    principalAmount: 300000,
    installmentAmount: 50000,
    recoveryStartDate: "2026-05-01",
    openingRecoveredAmount: 200000,
    legacyPeriodEvents: [
      event("2026-05-01", "PAID", 50000),
      event("2026-06-01", "PAID", 50000),
      event("2026-07-01", "PAID", 50000),
      event("2026-08-01", "PAID", 50000),
    ],
  });
  assert.deepEqual(regular.slice(0, 5).map((row) => row.status), ["PAID", "PAID", "PAID", "PAID", "PENDING"]);
  assert.equal(regular[3].period, "August 2026");
  assert.equal(regular[3].amountPaid, 50000);
  assert.equal(regular[4].period, "September 2026");
  assert.equal(regular.some((row) => row.status === "PARTIAL"), false);

  const ella = buildAmortizationSchedule({
    principalAmount: 400000,
    installmentAmount: 50000,
    recoveryStartDate: "2026-06-01",
    openingRecoveredAmount: 100000,
    legacyPeriodEvents: [
      event("2026-06-01", "PAID", 50000),
      event("2026-07-01", "PAID", 50000),
      event("2026-08-01", "PAUSED", 0, "August deduction paused"),
    ],
  });
  assert.deepEqual(ella.slice(0, 4).map((row) => row.status), ["PAID", "PAID", "PAUSED", "PENDING"]);
  assert.equal(ella[2].period, "August 2026");
  assert.equal(ella[2].amountPaid, 0);
  assert.equal(ella[3].period, "September 2026");
  assert.equal(ella.length, 9, "one paused month must extend an eight-installment schedule by one month");

  const michael = buildAmortizationSchedule({
    principalAmount: 450000,
    installmentAmount: 50000,
    recoveryStartDate: "2026-10-01",
    openingRecoveredAmount: 0,
    legacyPeriodEvents: [],
  });
  assert.equal(michael[0].period, "October 2026");
  assert.equal(michael[0].status, "PENDING");

  const roundingCase = buildAmortizationSchedule({
    principalAmount: 3499999.92,
    installmentAmount: 145833.32,
    recoveryStartDate: "2025-02-01",
    openingRecoveredAmount: 0,
    legacyPeriodEvents: [],
  });
  assert.equal(roundingCase.length, 24, "a 24-installment loan must not create a 25th ₦0.24 residual row");
  assert.equal(roundingCase[23].principalAmount, 145833.56, "the ₦0.24 currency residue should be absorbed into the final installment");
  assert.equal(roundingCase.some((row) => row.principalAmount > 0 && row.principalAmount < 1), false, "micro installment rows are not permitted");

  for (const expected of [
    "Search Loan / Employee",
    "Search Loan Register",
    "Employee number, employee name, loan number, policy or status",
    "filteredLoans.map",
    "loan.employeeName",
    "loan.employeeNumber",
  ]) {
    assert.ok(loansUi.includes(expected), `loan register search control missing: ${expected}`);
  }

  console.log("PASS: ZERMATT August loan history + full-installment + Loan Register search gate passed.");
});
