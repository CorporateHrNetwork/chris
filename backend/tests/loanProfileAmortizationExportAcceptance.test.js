const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.resolve(root, relativePath), "utf8");

test("ZERMATT loans expose zero-interest profiles, amortization and individual/bulk exports", () => {
  const policies = read("backend/src/services/loanPolicyService.js");
  const profile = read("backend/src/services/loanProfileService.js");
  const exportsService = read("backend/src/services/loanReportExportService.js");
  const routes = read("backend/src/routes/loanRoutes.js");
  const loansUi = read("src/pages/Loans.jsx");
  const profileUi = read("src/pages/LoanProfile.jsx");

  for (const name of [
    "Staff Loan",
    "Car Loan",
    "School Loan",
    "Accommodation Loan",
    "Building Project Loan",
    "Medical Support Loan",
    "Marriage Loan",
    "Education Loan",
  ]) {
    assert.ok(policies.includes(`\"${name}\"`), `missing ZERMATT loan policy: ${name}`);
  }
  assert.ok(policies.includes("interestRatePercent: 0"), "ZERMATT loan policy catalogue must be zero-interest");

  for (const expected of [
    "buildAmortizationSchedule",
    "interestRatePercent: 0",
    "totalInterest: 0",
    "APPROVED_PAYROLL_ONLY",
    "MONTH_END_FROM_RECOVERY_START",
    "historicalRecoveriesImmutable: true",
    'FROM "payroll_loan_recoveries"',
  ]) {
    assert.ok(profile.includes(expected), `loan profile/amortization control missing: ${expected}`);
  }

  for (const expected of [
    'router.get("/policies"',
    'router.get("/reports/export"',
    'router.get("/:id/profile"',
    'router.get("/:id/export"',
    '"xlsx", "csv", "pdf"',
  ]) {
    assert.ok(routes.includes(expected), `loan profile/export route missing: ${expected}`);
  }

  assert.ok(exportsService.includes('bookType: "xlsx"'), "Excel export must be generated");
  assert.ok(exportsService.includes('contentType: "text/csv; charset=utf-8"'), "CSV export must be generated");
  assert.ok(exportsService.includes('contentType: "application/pdf"'), "PDF export must be generated");
  assert.ok(exportsService.includes('"Loan Summary"'), "individual Excel must include Loan Summary sheet");
  assert.ok(exportsService.includes('"Amortization"'), "individual Excel must include Amortization sheet");
  assert.ok(exportsService.includes('"Recoveries"'), "individual Excel must include Recoveries sheet");
  assert.ok(exportsService.includes('"Loan Portfolio"'), "bulk Excel must include Loan Portfolio sheet");

  assert.ok(loansUi.includes("Loan Policy / Purpose"), "Loans form must expose controlled loan policy selection");
  assert.ok(loansUi.includes("Select ZERMATT loan policy"), "Loans form must not rely on free-typed purpose");
  assert.ok(loansUi.includes("View Profile"), "Loan Register must expose a clickable View Profile action");
  assert.ok(loansUi.includes("Bulk Loan Report"), "Loan Register must expose bulk exports");
  assert.ok(loansUi.includes("apiDownload(`/api/loans/reports/export?format=${format}`)"), "bulk loan report download wiring missing");

  assert.ok(profileUi.includes("Loan Amortization Schedule"), "individual profile must display amortization schedule");
  assert.ok(profileUi.includes("Repayment History"), "individual profile must display repayment history");
  assert.ok(profileUi.includes("Next scheduled payment"), "individual profile must display next repayment");
  assert.ok(profileUi.includes("/export?format=${format}"), "individual loan report export wiring missing");

  console.log("PASS: ZERMATT loan profile, amortization and reporting gate passed.");
});
