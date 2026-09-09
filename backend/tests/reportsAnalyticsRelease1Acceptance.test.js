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

const app = read(backendRoot, "src", "app.js");
const route = read(backendRoot, "src", "routes", "reportsRelease1Routes.js");
const service = read(backendRoot, "src", "services", "reportsRelease1Service.js");
const page = read(repoRoot, "src", "pages", "Reports.jsx");

expect(app, 'app.use("/api/reports", reportsRelease1Routes);', "Reports Release-1 router is not mounted.");
expect(route, 'requirePermission("reports.view")', "Report reads are not permission protected.");
expect(route, 'requirePermission("reports.view", "reports.export")', "Report exports are not separately export protected.");
expect(route, '"REPORT_EXPORT_DOWNLOADED"', "Report export audit evidence is missing.");
expect(route, 'XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })', "Excel export is not a real XLSX workbook.");

expect(service, "CURRENT_WORKFORCE_STATUSES", "Report headcount is not using centralized current-workforce semantics.");
expect(service, "EXITED_EMPLOYEE_STATUSES", "Report exit counts are not using centralized exit semantics.");
expect(service, '...(scope.locationId ? { locationId: scope.locationId } : {})', "Reports do not apply the active branch to employee data.");
expect(service, 'type: "BRANCH"', "Branch Reports must exclude the physical Head Office metadata row.");
expect(service, 'mode: "HEAD_OFFICE_CONSOLIDATED"', "Head Office consolidated report semantics are missing.");
expect(service, "financialDataIncluded: false", "Release-1 workforce reports must not silently expose payroll financial data.");

expect(page, 'apiRequest("/api/reports/release1")', "Reports Dashboard is not wired to the Release-1 API.");
expect(page, '"Workforce Analytics"', "Workforce Analytics is not active in the Reports workspace.");
expect(page, '"Employee Reports"', "Employee Reports is not active in the Reports workspace.");
expect(page, '"Headcount Reports"', "Headcount Reports is not active in the Reports workspace.");
expect(page, '"Branch Reports"', "Branch Reports is not active in the Reports workspace.");
expect(page, '/api/reports/release1/export.xlsx?view=', "Reports Excel export is not wired.");
expect(page, "window.print()", "Print / Save PDF workflow is not wired.");
expect(page, 'report?.controls?.branchScoped', "Reports UI does not expose branch-scoped operating context.");

console.log("PASS: Reports & Analytics Release-1 acceptance checks.");
