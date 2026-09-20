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
  assert.equal(draftBlock.includes("includePaymentDetails: true"), false, "Draft export must not fetch payment-account details.");
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
