const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("reopened payroll can replace old lines without deleting reversed loan recovery history", () => {
  const migration = read("backend/prisma/migrations/20260920183500_allow_reversed_loan_recovery_line_replacement/migration.sql");
  for (const expected of [
    'ALTER COLUMN "runLineId" DROP NOT NULL',
    'ON DELETE SET NULL',
    'ON UPDATE CASCADE',
    '"payroll_loan_recoveries_runLineId_fkey"',
  ]) assert.ok(migration.includes(expected), `Missing recovery-history FK control: ${expected}`);
});

test("draft payroll recalculation refuses to replace lines while loan recoveries are still posted", () => {
  const service = read("backend/src/services/nigeriaPayrollComplianceService.js");
  const postedCheck = service.indexOf('AND "status"=\'POSTED\'');
  const lineDelete = service.indexOf('DELETE FROM "payroll_run_lines"');
  assert.ok(postedCheck >= 0, "Posted loan recoveries must be checked before recalculation.");
  assert.ok(lineDelete > postedCheck, "Posted-recovery guard must run before old payroll lines are deleted.");
  for (const expected of [
    "POSTED_LOAN_RECOVERY_RECALCULATION_BLOCKED",
    "postedRecoveryCount",
    "postedRecoveryAmount",
    "Reopen/reverse the approved payroll before recalculation",
  ]) assert.ok(service.includes(expected), `Missing posted recovery safeguard: ${expected}`);
});

test("approved payroll reopen reverses loan recoveries and reapproval reconnects them to new run lines", () => {
  const reopen = read("backend/src/services/payrollReopenService.js");
  const repost = read("backend/prisma/migrations/20260906122000_allow_reposting_reversed_loan_recovery/migration.sql");
  assert.ok(reopen.includes('UPDATE "payroll_loan_recoveries" SET "status"=\'REVERSED\''));
  assert.ok(reopen.includes('"outstandingAmount"=LEAST("principalAmount","outstandingAmount"+$3)'));
  assert.ok(repost.includes('ON CONFLICT ("loanId","runId") DO UPDATE'));
  assert.ok(repost.includes('SET "runLineId"=EXCLUDED."runLineId"'));
  assert.ok(repost.includes('WHERE "payroll_loan_recoveries"."status"=\'REVERSED\''));
});
