const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.resolve(root, relativePath), "utf8");
const { buildCorrectionPlan } = require("../src/services/loanOpeningBalanceCorrectionService");

function correctedRow(outstandingAmount) {
  return {
    rowNumber: 2,
    valid: true,
    errors: [],
    warnings: [],
    input: {
      employeeId: "emp-1",
      employeeNumber: "ZLL000125",
      employeeName: "Olawale Mojeed Olajide",
      purpose: "Staff Loan",
      principalAmount: 300000,
      outstandingAmount,
      recoveredAmount: 300000 - outstandingAmount,
      installmentAmount: 50000,
      applicationDate: "2026-05-01",
      approvedDate: "2026-05-01",
      disbursedDate: "2026-05-01",
      recoveryStartDate: "2026-05-01",
      status: "ACTIVE",
      sourceReference: "LEGACY-ZLL000125-202605-01",
    },
    display: {
      employeeNumber: "ZLL000125",
      sourceReference: "LEGACY-ZLL000125-202605-01",
    },
  };
}

const existingLoan = {
  id: "loan-1",
  loanNumber: "LN-ZLL000125-OPENING",
  employeeId: "emp-1",
  purpose: "Staff Loan",
  principalAmount: 300000,
  outstandingAmount: 150000,
  installmentAmount: 50000,
  applicationDate: "2026-05-01",
  approvedDate: "2026-05-01",
  disbursedDate: "2026-05-01",
  recoveryStartDate: "2026-05-01",
  status: "ACTIVE",
  notes: "Source Reference: LEGACY-ZLL000125-202605-01 | Opening recovered before CHRiS: 150000.00",
};

test("ZERMATT opening loan balances can be corrected safely without duplicate loans or payroll-history rewrite", () => {
  const routes = read("backend/src/routes/loanRoutes.js");
  const service = read("backend/src/services/loanOpeningBalanceCorrectionService.js");
  const ui = read("src/pages/LoanBulkUpload.jsx");

  for (const route of [
    'router.post("/bulk/correction/preview"',
    'router.post("/bulk/correction/import"',
  ]) {
    assert.ok(routes.includes(route), `missing opening loan correction route: ${route}`);
  }
  assert.ok(routes.includes('requirePermission("payroll.manage")'), "loan correction must remain permission-controlled");

  for (const control of [
    "Source Reference is required for an opening-balance correction",
    "Opening-balance correction may change balances only",
    "LOAN_RECOVERY_HISTORY_LOCKED",
    "LOAN_OPENING_BALANCE_CHANGED",
    'action: "LOAN_OPENING_BALANCE_CORRECTED"',
    "markDraftRunsRecalculationRequired",
    "FOR UPDATE",
  ]) {
    assert.ok(service.includes(control), `missing opening-balance correction control: ${control}`);
  }

  const plan = buildCorrectionPlan({
    rows: [correctedRow(100000)],
    existingLoans: [existingLoan],
    postedRecoveryCounts: new Map(),
  });
  assert.equal(plan.length, 1);
  assert.equal(plan[0].action, "CORRECT");
  assert.equal(plan[0].oldRecovered, 150000);
  assert.equal(plan[0].newRecovered, 200000);
  assert.equal(plan[0].oldOutstanding, 150000);
  assert.equal(plan[0].newOutstanding, 100000);

  const lockedPlan = buildCorrectionPlan({
    rows: [correctedRow(100000)],
    existingLoans: [existingLoan],
    postedRecoveryCounts: new Map([["loan-1", 1]]),
  });
  assert.equal(lockedPlan[0].action, "BLOCKED", "a changed opening balance must be locked after approved-payroll recovery");
  assert.ok(lockedPlan[0].errors.some((item) => item.includes("approved-payroll loan recovery")));

  const unchangedWithHistory = buildCorrectionPlan({
    rows: [correctedRow(150000)],
    existingLoans: [existingLoan],
    postedRecoveryCounts: new Map([["loan-1", 1]]),
  });
  assert.equal(unchangedWithHistory[0].action, "NO_CHANGE", "unchanged rows should not block a correction workbook merely because history exists");

  assert.ok(ui.includes("Correct Previously Imported Opening Balances"), "Loan Bulk Upload must expose explicit correction mode");
  assert.ok(ui.includes("Apply Validated Corrections"), "correction mode must require explicit apply action after preview");
  assert.ok(ui.includes("preview?.importAllowed"), "correction apply must remain blocked until preview validates");
  assert.ok(ui.includes("Source Reference"), "correction UI must explain source-reference matching");
  assert.ok(ui.includes("RECALCULATION_REQUIRED"), "correction UI must disclose payroll draft invalidation");

  console.log("PASS: ZERMATT guarded opening loan balance correction gate passed.");
});
