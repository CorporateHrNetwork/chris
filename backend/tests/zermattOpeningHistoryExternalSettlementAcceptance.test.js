const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.resolve(root, relativePath), "utf8");
const {
  applyZermattOpeningHistoryPolicy,
  buildAmortizationSchedule,
} = require("../src/services/loanProfileService");

function paidEvent(year, month, amount = 125000) {
  return {
    periodStart: `${year}-${String(month).padStart(2, "0")}-01`,
    status: "PAID",
    amount,
    source: "OPENING_MIGRATION",
  };
}

test("missing ZERMATT August event is resolved as PAID at runtime while September remains pending", () => {
  const explicitHistory = [];
  for (let offset = 0; offset < 11; offset += 1) {
    const date = new Date(Date.UTC(2025, 8 + offset, 1));
    explicitHistory.push(paidEvent(date.getUTCFullYear(), date.getUTCMonth() + 1));
  }

  const effectiveHistory = applyZermattOpeningHistoryPolicy({
    organizationSlug: "zermatt-liquor-limited",
    employeeNumber: "ZLL000101",
    loanNotes: "Source Reference: LEGACY-101 | Opening loan migration",
    principalAmount: 3000000,
    installmentAmount: 125000,
    recoveryStartDate: "2025-09-01",
    legacyPeriodEvents: explicitHistory,
  });

  const augustEvent = effectiveHistory.find((event) => String(event.periodStart).startsWith("2026-08"));
  assert.ok(augustEvent, "runtime history policy must supply a genuinely missing August event");
  assert.equal(augustEvent.status, "PAID");
  assert.equal(augustEvent.amount, 125000);
  assert.equal(augustEvent.source, "ZERMATT_OPENING_HISTORY_POLICY");

  const schedule = buildAmortizationSchedule({
    principalAmount: 3000000,
    installmentAmount: 125000,
    recoveryStartDate: "2025-09-01",
    openingRecoveredAmount: 1375000,
    legacyPeriodEvents: effectiveHistory,
  });
  const august = schedule.find((row) => row.dueDate === "2026-08-31");
  const september = schedule.find((row) => row.dueDate === "2026-09-30");

  assert.equal(august.status, "PAID");
  assert.equal(august.amountPaid, 125000);
  assert.equal(september.status, "PENDING", "runtime policy must stop at August 2026");
  assert.equal(september.amountPaid, 0);
});

test("the two confirmed ZERMATT August pause employees remain PAUSED", () => {
  for (const employeeNumber of ["ZLL000055", "ZLL000185"]) {
    const history = applyZermattOpeningHistoryPolicy({
      organizationSlug: "zermatt-liquor-limited",
      employeeNumber,
      loanNotes: "Source Reference: OPENING-PAUSE",
      principalAmount: 1000000,
      installmentAmount: 50000,
      recoveryStartDate: "2026-06-01",
      legacyPeriodEvents: [],
    });
    const august = history.find((event) => String(event.periodStart).startsWith("2026-08"));
    assert.ok(august);
    assert.equal(august.status, "PAUSED");
    assert.equal(august.amount, 0);
  }
});

test("external settlement ends the schedule without fabricating a payroll deduction", () => {
  const schedule = buildAmortizationSchedule({
    principalAmount: 500000,
    installmentAmount: 100000,
    recoveryStartDate: "2026-07-01",
    openingRecoveredAmount: 200000,
    legacyPeriodEvents: [
      paidEvent(2026, 7, 100000),
      paidEvent(2026, 8, 100000),
    ],
    externalSettlement: {
      amount: 300000,
      date: "2026-09-15",
      source: "OTHER_EXTERNAL_SOURCE",
      reason: "Employee cleared outstanding balance by bank transfer",
    },
  });

  assert.deepEqual(schedule.map((row) => row.status), ["PAID", "PAID", "SETTLED_EXTERNALLY"]);
  const settlement = schedule[2];
  assert.equal(settlement.dueDate, "2026-09-15");
  assert.equal(settlement.amountPaid, 300000);
  assert.equal(settlement.totalDeduction, 0, "external settlement must never be represented as payroll deduction");
  assert.equal(settlement.outstandingAfter, 0);
  assert.equal(schedule.some((row) => row.status === "PENDING"), false);
});

test("external completion is audited, stops payroll recovery and is exposed in Loans UI", () => {
  const service = read("backend/src/services/loanService.js");
  const ui = read("src/pages/Loans.jsx");
  const migration = read("backend/prisma/migrations/20260915033000_add_loan_external_settlement_control/migration.sql");

  for (const expected of [
    "COMPLETE_EXTERNAL",
    "LOAN_COMPLETED_EXTERNAL_SETTLEMENT",
    '"outstandingAmount"=0',
    '"externalSettlementAmount"=$3',
    "payrollRecoveryCreated: false",
    "markDraftRunsRecalculationRequired",
  ]) {
    assert.ok(service.includes(expected), `external settlement service control missing: ${expected}`);
  }

  for (const expected of [
    "externalSettlementAmount",
    "externalSettlementDate",
    "externalSettlementSource",
    "externalSettlementReason",
    "payroll_loans_external_settlement_completion_check",
  ]) {
    assert.ok(migration.includes(expected), `external settlement database control missing: ${expected}`);
  }

  for (const expected of [
    "Mark Completed",
    "completeExternally",
    'action: "COMPLETE_EXTERNAL"',
    "No payroll recovery will be fabricated",
    "organization audit trail",
  ]) {
    assert.ok(ui.includes(expected), `external settlement UI control missing: ${expected}`);
  }
});

console.log("PASS: ZERMATT opening-history + external-settlement acceptance gate passed.");
