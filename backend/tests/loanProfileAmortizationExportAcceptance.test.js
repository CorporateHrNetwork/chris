const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("ZERMATT loan profile, amortization, controlled purposes and exports are wired", () => {
  const policy = read("backend/src/services/loanPolicyService.js");
  const profile = read("backend/src/services/loanProfileService.js");
  const exports = read("backend/src/services/loanReportExportService.js");
  const routes = read("backend/src/routes/loanRoutes.js");
  const loansPage = read("src/pages/Loans.jsx");
  const loanProfile = read("src/pages/LoanProfile.jsx");
  const app = read("src/App.jsx");

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
    assert.ok(policy.includes(`\"${name}\"`), `missing ZERMATT loan policy: ${name}`);
  }
  assert.ok(policy.includes("interestRatePercent: 0"), "ZERMATT loan policies must be zero-interest");

  for (const expected of [
    "buildAmortizationSchedule",
    "termMonths",
    "nextPaymentDue",
    "expectedFinalInstallmentDate",
    "recoverySource: \"APPROVED_PAYROLL_ONLY\"",
  ]) {
    assert.ok(profile.includes(expected), `loan profile control missing: ${expected}`);
  }

  for (const expected of ["xlsx", "csv", "pdf", "exportIndividualLoan", "exportBulkLoans"]) {
    assert.ok(exports.includes(expected), `loan export support missing: ${expected}`);
  }

  assert.ok(routes.includes('router.get("/:id/profile"'), "loan profile route missing");
  assert.ok(routes.includes('router.get("/:id/export"'), "individual loan export route missing");
  assert.ok(routes.includes('router.get("/reports/export"'), "bulk loan export route missing");
  assert.ok(routes.includes('router.get("/policies"'), "loan policy catalogue route missing");

  assert.ok(loansPage.includes("View Profile"), "loan register must expose a View Profile action");
  assert.ok(loansPage.includes("Loan Type / Purpose"), "loan form must use controlled loan type selection");
  assert.ok(loansPage.includes("Export Portfolio"), "loan dashboard must expose bulk report export");

  assert.ok(loanProfile.includes("Loan Amortization Schedule"), "loan profile must show amortization schedule");
  assert.ok(loanProfile.includes("Repayment History"), "loan profile must show repayment history");
  assert.ok(app.includes('path="/loans/:loanId"'), "loan profile page route missing");

  console.log("PASS: ZERMATT loan profile/amortization/export gate passed.");
});
