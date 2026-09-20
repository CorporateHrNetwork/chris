const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const routes = fs.readFileSync(path.join(root, "backend/src/routes/payrollRoutes.js"), "utf8");
const ui = fs.readFileSync(path.join(root, "src/pages/payroll/PayrollIntegratedManaged.jsx"), "utf8");

test("draft payroll review export is pre-approval, non-payable and audit logged", () => {
  for (const expected of [
    '"/runs/:id/draft-review.xlsx"',
    '"DRAFT", "REJECTED", "SUBMITTED"',
    '"PRE-APPROVAL REVIEW — NOT FOR PAYOUT"',
    '"Draft Payroll External HR Review / Investigation"',
    '"Investigation / Verification Result"',
    '"Corrective Action Required"',
    '"PAYROLL_DRAFT_REVIEW_EXPORTED"',
    '"CHRiS_${safePeriod}_Draft_Payroll_External_HR_Review.xlsx"',
  ]) assert.ok(routes.includes(expected), `Missing draft payroll review control: ${expected}`);

  const draftStart = routes.indexOf('router.get("/runs/:id/draft-review.xlsx"');
  const approvedStart = routes.indexOf('router.get("/runs/:id/approved-payout.xlsx"');
  const draftBlock = routes.slice(draftStart, approvedStart);
  assert.ok(draftBlock.includes("includePaymentDetails: true"), "Draft export must fetch employee bank/account details for verification.");
  for (const expected of [
    '"Bank", "Account Name", "Account Number"',
    "including employee bank/account details for verification",
    "Verify payroll figures and employee bank/account details.",
  ]) assert.ok(routes.includes(expected), `Missing draft bank-verification control: ${expected}`);
});

test("approved payroll export requires CHRiS approval and includes controlled payout register", () => {
  for (const expected of [
    '"/runs/:id/approved-payout.xlsx"',
    'context.run.status !== "APPROVED"',
    '{ includePaymentDetails: true }',
    '"Payment Register"',
    '"Bank", "Account Name", "Account Number", "Net Pay"',
    '"External Auditor Confirmation"',
    '"GM Approval"',
    '"Accounts & Finance Payout"',
    '"PAYROLL_APPROVED_PAYOUT_EXPORTED"',
    '"CHRiS_${safePeriod}_Approved_Payroll_External_Approval_Payout.xlsx"',
  ]) assert.ok(routes.includes(expected), `Missing approved payout export control: ${expected}`);
});

test("legacy approved audit pack remains backward compatible", () => {
  assert.ok(routes.includes('"/runs/:id/audit-pack.xlsx"'));
  assert.ok(routes.includes('action: "PAYROLL_AUDIT_PACK_EXPORTED"'));
});

test("Payroll Runs UI exposes explicit draft-review and approved-payout actions", () => {
  for (const expected of [
    "exportDraftReview",
    "exportApprovedPayout",
    "Export Draft Review",
    "Export Approved Payout",
    "/draft-review.xlsx",
    "/approved-payout.xlsx",
    "PRE-APPROVAL / NOT FOR PAYOUT",
  ]) assert.ok(ui.includes(expected), `Missing payroll export UI control: ${expected}`);
  assert.equal(ui.includes("Export Audit Pack"), false, "Primary UI should use the explicit Approved Payout export label.");
});


test("Payroll Register formulas remain aligned after bank columns are included", () => {
  for (const expected of [
    "SUM('Payroll Register'!J2:J",
    "SUM('Payroll Register'!Q2:Q",
    "SUM('Payroll Register'!K2:K",
    "SUM('Payroll Register'!L2:L",
    "SUM('Payroll Register'!N2:N",
    "SUM('Payroll Register'!O2:O",
    "'Payroll Register'!J$2:J",
    "'Payroll Register'!Q$2:Q",
  ]) assert.ok(routes.includes(expected), `Payroll Register formulas must follow bank columns: ${expected}`);
});
