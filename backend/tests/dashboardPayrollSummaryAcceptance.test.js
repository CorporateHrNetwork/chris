const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const backendRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(backendRoot, "..");

function read(...parts) {
  return fs.readFileSync(path.join(...parts), "utf8").replace(/\r\n/g, "\n");
}

function expect(source, fragment, message) {
  assert.ok(source.includes(fragment), message || `Expected source to contain: ${fragment}`);
}

const dashboard = read(repoRoot, "src", "pages", "Dashboard.jsx");
const payrollSummary = read(repoRoot, "src", "components", "dashboard", "PayrollSummary.jsx");
const branchScope = read(backendRoot, "src", "routes", "activeBranchScopeRoutes.js");
const payrollOperations = read(backendRoot, "src", "services", "payrollOperationsService.js");

expect(dashboard, 'apiRequest("/api/payroll/runs")', "Dashboard does not load authoritative payroll runs.");
expect(dashboard, "latestPayrollRun.netPreviewTotal", "Dashboard payroll KPI does not use the latest run net payroll total.");
expect(dashboard, "<PayrollSummary summary={payrollSummary} />", "Detailed Payroll Summary is not connected to the dashboard payroll data.");
assert.ok(
  !dashboard.includes("Awaiting authoritative payroll-run data"),
  "Old dashboard payroll placeholder is still present."
);

for (const field of ["employeeCount", "grossTotal", "deductionTotal", "netPreviewTotal"]) {
  expect(payrollSummary, `latestRun.${field}`, `Payroll Summary does not display ${field}.`);
}

expect(branchScope, '"/payroll/runs"', "Branch-scoped payroll run route is missing.");
expect(branchScope, 'e."locationId"=$2', "Branch payroll totals are not constrained to the active employee location.");
expect(payrollOperations, 'pr."netPreviewTotal"', "Head Office payroll run totals do not expose net payroll.");

console.log("PASS: Dashboard Payroll Summary acceptance checks.");
