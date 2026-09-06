const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.resolve(root, relativePath), "utf8");
const {
  exactLegacyIdentityMatches,
  buildCorrectionPlanWithLegacyFallback,
} = require("../src/services/loanOpeningBalanceReconciliationService");

function correctionRow({ outstandingAmount = 1625000, sourceReference = "LEGACY-ZLL000006-202510-01" } = {}) {
  return {
    rowNumber: 34,
    valid: true,
    errors: [],
    warnings: [],
    input: {
      employeeId: "emp-zll000006",
      employeeNumber: "ZLL000006",
      employeeName: "Agunbiade Solomon",
      purpose: "Staff Loan",
      principalAmount: 3000000,
      outstandingAmount,
      recoveredAmount: 3000000 - outstandingAmount,
      installmentAmount: 125000,
      applicationDate: "2025-10-01",
      approvedDate: "2025-10-01",
      disbursedDate: "2025-10-01",
      recoveryStartDate: "2025-10-01",
      status: "ACTIVE",
      sourceReference,
    },
    display: {
      employeeNumber: "ZLL000006",
      employeeName: "Agunbiade Solomon",
      sourceReference,
    },
  };
}

const legacyLoanWithoutReference = {
  id: "loan-solomon",
  loanNumber: "LN-ZLL000006-LEGACY",
  employeeId: "emp-zll000006",
  purpose: "Staff Loan",
  principalAmount: 3000000,
  outstandingAmount: 1625000,
  installmentAmount: 125000,
  applicationDate: "2025-10-01",
  approvedDate: "2025-10-01",
  disbursedDate: "2025-10-01",
  recoveryStartDate: "2025-10-01",
  status: "ACTIVE",
  notes: "Opening loan migrated before Source Reference became mandatory",
};

test("legacy opening-loan corrections fall back to one exact identity match without creating a duplicate", () => {
  const service = read("backend/src/services/loanOpeningBalanceReconciliationService.js");
  const routes = read("backend/src/routes/loanRoutes.js");

  assert.equal(
    exactLegacyIdentityMatches(legacyLoanWithoutReference, correctionRow().input),
    true,
    "the known ZLL000006 legacy identity should match exactly"
  );

  const unchangedPlan = buildCorrectionPlanWithLegacyFallback({
    rows: [correctionRow()],
    existingLoans: [legacyLoanWithoutReference],
    postedRecoveryCounts: new Map(),
  });
  assert.equal(unchangedPlan[0].action, "NO_CHANGE");
  assert.equal(unchangedPlan[0].loanId, "loan-solomon");
  assert.equal(unchangedPlan[0].matchMethod, "EXACT_LEGACY_IDENTITY");
  assert.ok(unchangedPlan[0].warnings.some((item) => item.includes("no stored Source Reference")));
  assert.ok(!unchangedPlan[0].errors.includes("No previously imported CHRiS loan matches this Source Reference."));

  const correctedPlan = buildCorrectionPlanWithLegacyFallback({
    rows: [correctionRow({ outstandingAmount: 1500000 })],
    existingLoans: [legacyLoanWithoutReference],
    postedRecoveryCounts: new Map(),
  });
  assert.equal(correctedPlan[0].action, "CORRECT");
  assert.equal(correctedPlan[0].oldOutstanding, 1625000);
  assert.equal(correctedPlan[0].newOutstanding, 1500000);
  assert.equal(correctedPlan[0].matchMethod, "EXACT_LEGACY_IDENTITY");

  const historyLockedPlan = buildCorrectionPlanWithLegacyFallback({
    rows: [correctionRow({ outstandingAmount: 1500000 })],
    existingLoans: [legacyLoanWithoutReference],
    postedRecoveryCounts: new Map([["loan-solomon", 1]]),
  });
  assert.equal(historyLockedPlan[0].action, "BLOCKED");
  assert.ok(historyLockedPlan[0].errors.some((item) => item.includes("approved-payroll loan recovery")));

  const ambiguousPlan = buildCorrectionPlanWithLegacyFallback({
    rows: [correctionRow()],
    existingLoans: [
      legacyLoanWithoutReference,
      { ...legacyLoanWithoutReference, id: "loan-solomon-duplicate", loanNumber: "LN-ZLL000006-DUP" },
    ],
    postedRecoveryCounts: new Map(),
  });
  assert.equal(ambiguousPlan[0].action, "BLOCKED");
  assert.equal(ambiguousPlan[0].matchMethod, "AMBIGUOUS_LEGACY_IDENTITY");
  assert.ok(ambiguousPlan[0].errors.some((item) => item.includes("More than one legacy CHRiS loan matches")));

  const differentReferenceLoan = {
    ...legacyLoanWithoutReference,
    notes: "Source Reference: LEGACY-OTHER-LOAN",
  };
  const protectedPlan = buildCorrectionPlanWithLegacyFallback({
    rows: [correctionRow()],
    existingLoans: [differentReferenceLoan],
    postedRecoveryCounts: new Map(),
  });
  assert.equal(protectedPlan[0].action, "BLOCKED", "a loan already bound to another source reference must not be hijacked by fallback matching");

  assert.ok(service.includes("EXACT_LEGACY_IDENTITY"));
  assert.ok(service.includes("!sourceReferenceFromNotes(loan.notes)"), "fallback must exclude loans already linked to another source reference");
  assert.ok(routes.includes('require("../services/loanOpeningBalanceReconciliationService")'), "correction preview/import routes must use the guarded reconciliation service");
  assert.ok(routes.includes("legacyIdentityMatches"), "preview response should disclose exact-identity fallback matches");

  console.log("PASS: guarded legacy loan Source Reference reconciliation gate passed.");
});
