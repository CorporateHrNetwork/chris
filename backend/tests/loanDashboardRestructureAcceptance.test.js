const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.resolve(root, relativePath), "utf8");

test("Loans dashboard reflects the revised Zermatt payroll-recovery operating model", () => {
  const loansUi = read("src/pages/Loans.jsx");
  const dashboardShell = read("src/components/dashboard/ModuleDashboardShell.jsx");

  for (const title of [
    "Active Loan Accounts",
    "Borrowers",
    "Outstanding Balance",
    "Recovered",
    "Zermatt Loan Control",
    "Recording Rule",
  ]) {
    assert.ok(loansUi.includes(`title=\"${title}\"`), `missing revised loan dashboard section: ${title}`);
  }

  assert.ok(loansUi.includes("metricsColumns={4}"), "revised loan KPI layout must use four management cards");
  assert.ok(dashboardShell.includes("metricsColumns"), "dashboard shell must support route-specific metric columns");
  assert.ok(dashboardShell.includes("@media (max-width: 1000px)"), "dashboard layout must remain responsive on smaller screens");
  assert.ok(dashboardShell.includes("@media (max-width: 680px)"), "loan KPI layout must collapse on mobile");

  for (const phrase of [
    "GM approval takes place outside CHRiS",
    "Accounts processes payment outside CHRiS",
    "Authorized HR records the approved/disbursed amount",
    "CHRiS recovers the configured installment through payroll",
    "Branch HR",
    "Head HR",
  ]) {
    assert.ok(loansUi.includes(phrase), `revised operating model missing: ${phrase}`);
  }

  assert.ok(loansUi.includes('["ACTIVE", "PAUSED", "COMPLETED"]'), "financial history must include active, paused and completed loans");
  assert.ok(loansUi.includes('Math.max(0, Number(loan.outstandingAmount || 0))'), "outstanding exposure must use authoritative running balance");
  assert.ok(loansUi.includes("principal - balance"), "recovered amount must remain principal less outstanding so opening recoveries are included");
  assert.ok(loansUi.includes("Record Approved Loan"), "approved/disbursed recording action must be prominent");
  assert.ok(loansUi.includes("Same manual GM approval / external payment policy"), "Salary Advances must visibly share the revised policy");
  assert.ok(loansUi.includes("canManageLoans"), "loan register actions must be capability-controlled");
  assert.ok(loansUi.includes("canDeleteEmployeeFinancialInputs"), "Head HR delete authority must be capability-controlled");
  assert.ok(!loansUi.includes("Pending Workflow"), "obsolete in-system approval workflow KPI must be removed");
  assert.ok(!loansUi.includes("Awaiting Disbursement"), "obsolete in-system disbursement KPI must be removed");

  console.log("PASS: revised Zermatt Loans dashboard + scoped HR gate passed.");
});