const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");
const script = fs.readFileSync(
  path.resolve(repoRoot, "backend/scripts/reconcile-zermatt-payment-profiles-from-workbook.cjs"),
  "utf8"
);

function requireText(values, label) {
  for (const value of values) {
    assert.ok(script.includes(value), `${label} must include: ${value}`);
  }
}

test("ZERMATT safely reconciles incomplete payroll payment profiles from the existing workbook", () => {
  requireText([
    "ZERMATT_workforce_source.xlsx",
    "DETERMINISTIC_START_DATE_AND_SOURCE_ROW",
    "EXPECTED_EMPLOYEES = 312",
    "PAYMENT_PROFILE_INCOMPLETE",
    "paymentReadyBefore",
    "repairablePaymentProfiles",
    "blockedPaymentRepairs",
    "Bank Name",
    "Account Name",
    "Account Number",
    'payrollCurrency: /^[A-Z]{3}$/.test(sourceCurrency) ? sourceCurrency : "NGN"',
    'paymentMethod: sourcePaymentMethod || "Bank Transfer"',
    "Workbook Account Number is not a valid 10-digit account number.",
    "Workbook Account Number is duplicated with",
    "Workbook Account Number is already used by",
    "correctedInvalidAccountNumber",
    "sourceAccountNumberDigits",
    "CORRECTED_INVALID_PAYMENT_ACCOUNT_FROM_WORKBOOK",
    "PREVIEW ONLY: no payment-profile data was changed.",
    "Run again with --apply only when reconciliationBlockers=0 and blockedPaymentRepairs=0.",
    "BACKFILLED_PAYMENT_PROFILE_FROM_WORKBOOK",
    "accountNumberMasked",
    "paymentReadyAfter",
    "readyForExecutionAfter",
    "executionEnabledAfter",
    "remainingPaymentBlockers",
  ], "Payment reconciliation script");

  assert.ok(script.includes('if (arg === "--apply") args.apply = true;'));
  assert.ok(script.includes("if (!args.apply)"), "Script must default to preview mode.");
  assert.ok(script.includes("mergeMissingPaymentFields(current, sourceValues)"));
  assert.ok(script.includes("const next = { ...current };"), "Existing payment values must be preserved by default.");
  assert.ok(script.includes("if (!clean(current.bankName))"));
  assert.ok(script.includes("if (!clean(current.accountName))"));
  assert.ok(script.includes("if (!clean(current.payrollCurrency))"));
  assert.ok(script.includes("if (!clean(current.paymentMethod))"));
  assert.ok(script.includes("if (currentAccountNumber.length !== 10)"));
  assert.ok(script.includes("if (source.accountNumber.length !== 10)"));
  assert.ok(script.includes("next.accountNumber = source.accountNumber"));
  assert.ok(script.includes("currentAccountOwners.get(accountNumber)"), "Replacement account must be checked against existing valid accounts.");
  assert.ok(script.includes("workbookAccountOwners.get(accountNumber)"), "Replacement account must be checked against workbook duplicates.");
  assert.ok(!script.includes("sectionData = {"), "Script must not replace the entire onboarding section data object.");
  assert.ok(!script.includes('accountNumber: item.next.accountNumber'), "Audit payload must not expose the full bank account number.");

  console.log("PASS: ZERMATT payment-profile reconciliation gate passed.");
});
