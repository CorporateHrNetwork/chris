const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.resolve(root, relativePath), "utf8");
const { buildAmortizationSchedule } = require("../src/services/loanProfileService");

const migrationPath = "backend/prisma/migrations/20260915024500_backfill_zermatt_august_opening_loan_history/migration.sql";

test("normal ZERMATT opening loan history remains PAID through August 2026 without making September paid", () => {
  const legacyPeriodEvents = [];
  for (let monthOffset = 0; monthOffset < 12; monthOffset += 1) {
    const date = new Date(Date.UTC(2025, 8 + monthOffset, 1));
    legacyPeriodEvents.push({
      periodStart: date.toISOString().slice(0, 10),
      status: "PAID",
      amount: 125000,
      source: "OPENING_HISTORY_RECONCILIATION",
    });
  }

  const schedule = buildAmortizationSchedule({
    principalAmount: 3000000,
    installmentAmount: 125000,
    recoveryStartDate: "2025-09-01",
    openingRecoveredAmount: 1500000,
    recoveries: [],
    legacyPeriodEvents,
  });

  const august = schedule.find((row) => row.dueDate === "2026-08-31");
  const september = schedule.find((row) => row.dueDate === "2026-09-30");

  assert.ok(august, "August 2026 installment must exist");
  assert.equal(august.installmentNumber, 12);
  assert.equal(august.status, "PAID", "confirmed opening-loan August history must display PAID");
  assert.equal(august.amountPaid, 125000);
  assert.equal(august.paymentSource, "OPENING_HISTORY_RECONCILIATION");

  assert.ok(september, "September 2026 installment must remain in the forward schedule");
  assert.equal(september.status, "PENDING", "future/unposted September must not be inferred as paid");
  assert.equal(september.amountPaid, 0);
});

test("August 2026 confirmed pause remains PAUSED rather than being backfilled as PAID", () => {
  const legacyPeriodEvents = [];
  for (let monthOffset = 0; monthOffset < 11; monthOffset += 1) {
    const date = new Date(Date.UTC(2025, 8 + monthOffset, 1));
    legacyPeriodEvents.push({
      periodStart: date.toISOString().slice(0, 10),
      status: "PAID",
      amount: 125000,
      source: "OPENING_MIGRATION",
    });
  }
  legacyPeriodEvents.push({
    periodStart: "2026-08-01",
    status: "PAUSED",
    amount: 0,
    source: "OPENING_HISTORY_RECONCILIATION",
    reason: "Confirmed ZERMATT August pause",
  });

  const schedule = buildAmortizationSchedule({
    principalAmount: 3000000,
    installmentAmount: 125000,
    recoveryStartDate: "2025-09-01",
    recoveries: [],
    legacyPeriodEvents,
  });
  const august = schedule.find((row) => row.dueDate === "2026-08-31");

  assert.ok(august);
  assert.equal(august.status, "PAUSED");
  assert.equal(august.amountPaid, 0);
  assert.equal(august.outstandingAfter, august.outstandingBalance, "paused month must not consume scheduled principal");
});

test("August opening-loan backfill is idempotent and late-import safe", () => {
  const migration = read(migrationPath);

  for (const expected of [
    "DATE '2026-08-01'",
    "ZLL000055",
    "ZLL000185",
    "OPENING_HISTORY_RECONCILIATION",
    "OPENING_IMPORT_RECONCILIATION",
    'ON CONFLICT ("organizationId","loanId","periodStart") DO NOTHING',
    'CREATE OR REPLACE FUNCTION "chris_seed_zermatt_opening_loan_legacy_history"()',
    'CREATE TRIGGER "trg_zermatt_opening_loan_legacy_history"',
    'AFTER INSERT ON "payroll_loans"',
    "COALESCE(NEW.\"notes\", '') NOT ILIKE '%Source Reference:%'",
  ]) {
    assert.ok(migration.includes(expected), `opening-loan history correction missing: ${expected}`);
  }

  assert.equal(
    migration.includes("DATE '2026-09-01'"),
    false,
    "history repair must not seed September 2026 as paid"
  );
});

console.log("PASS: ZERMATT August 2026 opening-loan history regression gate passed.");
