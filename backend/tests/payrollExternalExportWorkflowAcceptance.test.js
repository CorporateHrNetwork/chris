const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const routes = fs.readFileSync(path.join(root, "backend/src/routes/payrollRoutes.js"), "utf8");
const ui = fs.readFileSync(path.join(root, "src/pages/payroll/PayrollIntegratedManaged.jsx"), "utf8");

test("draft payroll review export remains pre-approval, non-payable and includes verification data", () => {
  for (const expected of [
    '"/runs/:id/draft-review.xlsx"',
    '"DRAFT", "REJECTED", "SUBMITTED"',
    '"PRE-APPROVAL REVIEW — NOT FOR PAYOUT"',
    '"Draft Payroll External HR Review / Investigation"',
    '"Investigation / Verification Result"',
    '"Corrective Action Required"',
    '"PAYROLL_DRAFT_REVIEW_EXPORTED"',
    '"CHRiS_${safePeriod}_Draft_Payroll_External_HR_Review.xlsx"',
    '{ includePaymentDetails: true }',
    "Verify payroll figures, allowances/deductions, bank/account details, PAYE, employee/employer pension, PFA/PIN/TIN",
  ]) assert.ok(routes.includes(expected), "Missing draft payroll review control: " + expected);
});

test("comprehensive payroll workbook includes statutory identifiers, employer/employee pension and every component class", () => {
  for (const expected of [
    '"PFA", "Pension PIN", "TIN", "PAYE State"',
    '"Employee Pension", "Employer Pension", "Total Pension"',
    '"PAYE"',
    '"NHF"',
    '"NSITF Employer"',
    '"ITF Employer"',
    "customAllowances",
    "customDeductions",
    "salaryStructure",
    "payrollComponentKey",
    "payrollComponentLabel",
    '"Statutory Register"',
  ]) assert.ok(routes.includes(expected), "Missing comprehensive payroll export field: " + expected);
});

test("payroll workbook includes executive dashboard, KPI visuals and separate branch worksheets", () => {
  for (const expected of [
    '"Payroll Dashboard"',
    '"KEY PAYROLL INDICATORS"',
    '"BRANCH PAYROLL COMPARISON"',
    '"STATUTORY COST COMPOSITION"',
    "payrollVisualBar",
    '"Total Employer Cost"',
    '"Employer Statutory Cost"',
    '"Branch - " + branch',
    "payrollBranchRank",
    'if (value === "ABUJA") return 0',
    'if (value === "LAGOS") return 1',
    'if (value === "PHC") return 2',
  ]) assert.ok(routes.includes(expected), "Missing dashboard/branch workbook control: " + expected);
});

test("approved payroll export requires CHRiS approval and includes controlled payout register", () => {
  for (const expected of [
    '"/runs/:id/approved-payout.xlsx"',
    'context.run.status !== "APPROVED"',
    '"Payment Register"',
    '"Bank", "Account Name", "Account Number"',
    '"External Auditor Confirmation"',
    '"GM Approval"',
    '"Accounts & Finance Payout"',
    '"PAYROLL_APPROVED_PAYOUT_EXPORTED"',
    '"CHRiS_${safePeriod}_Approved_Payroll_External_Approval_Payout.xlsx"',
  ]) assert.ok(routes.includes(expected), "Missing approved payout export control: " + expected);
});

test("payroll export context reads PFA PIN TIN and PAYE state from statutory-details", () => {
  for (const expected of [
    'payrollSection(sectionData, "statutory-details", "statutoryDetails")',
    "statutory.pensionPfa",
    "statutory.pensionPin",
    "statutory.taxIdentificationNumber",
    "statutory.payeState",
  ]) assert.ok(routes.includes(expected), "Missing employee statutory metadata mapping: " + expected);
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
  ]) assert.ok(ui.includes(expected), "Missing payroll export UI control: " + expected);
  assert.equal(ui.includes("Export Audit Pack"), false, "Primary UI should use the explicit Approved Payout export label.");
});
