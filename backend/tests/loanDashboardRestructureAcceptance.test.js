const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.resolve(root, relativePath), "utf8");

test("Loans dashboard follows the approved six-card management layout with correct financial summaries", () => {
  const loansUi = read("src/pages/Loans.jsx");
  const dashboardShell = read("src/components/dashboard/ModuleDashboardShell.jsx");

  for (const title of [
    "Active Loans",
    "Paused Loans",
    "Recovered Loans",
    "Outstanding Balance",
    "Pending Workflow",
    "Awaiting Disbursement",
    "Loan Workflow",
    "Loan Intelligence",
  ]) {
    assert.ok(loansUi.includes(`title=\"${title}\"`), `missing loan dashboard section: ${title}`);
  }

  assert.ok(loansUi.includes("metricsColumns={3}"), "desktop loan KPI layout must use three columns");
  assert.ok(dashboardShell.includes("metricsColumns"), "dashboard shell must support route-specific metric columns");
  assert.ok(dashboardShell.includes("@media (max-width: 1000px)"), "three-column layout must remain responsive on smaller screens");
  assert.ok(dashboardShell.includes("@media (max-width: 680px)"), "loan KPI layout must collapse to one column on mobile");

  for (const metric of [
    "activeAmount",
    "pausedAmount",
    "recoveredAmount",
    "outstandingBalance",
    "pendingAmount",
    "awaitingAmount",
    "activePercentage",
    "pausedPercentage",
    "recoveredPercentage",
    "outstandingPercentage",
  ]) {
    assert.ok(loansUi.includes(metric), `loan management metric missing: ${metric}`);
  }

  assert.ok(loansUi.includes('loan.status === "ACTIVE"'), "active loan count/exposure must come from authoritative loan status");
  assert.ok(loansUi.includes('loan.status === "PAUSED"'), "paused loan count/exposure must come from authoritative loan status");
  assert.ok(loansUi.includes('loan.status === "COMPLETED"'), "completed loans must contribute to historical recovered amount");
  assert.ok(loansUi.includes("total + Number(loan.principalAmount || 0)"), "active/paused amount must summarize original principal, not outstanding balance");
  assert.ok(loansUi.includes("Math.max(0, principal - outstanding)"), "recovered amount must include opening recoveries as principal less outstanding");
  assert.ok(!loansUi.includes("const recoveredAmount = Number(summary.recoveredAmount || 0)"), "dashboard recovered amount must not depend only on CHRiS-posted payroll recovery rows");
  assert.ok(loansUi.includes("active + paused principal"), "active/paused percentages must clearly state their denominator");
  assert.ok(loansUi.includes("disbursed loan exposure"), "recovered/outstanding percentages must clearly state their denominator");

  console.log("PASS: Loans dashboard restructuring and summary gate passed.");
});
