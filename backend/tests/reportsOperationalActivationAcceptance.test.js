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
const route = read(backendRoot, "src", "routes", "reportsOperationalRoutes.js");
const page = read(repoRoot, "src", "pages", "Reports.jsx");
const sidebar = read(repoRoot, "src", "components", "layout", "Sidebar", "Sidebar.jsx");

expect(app, 'app.use("/api/reports", reportsOperationalRoutes);', "Operational report router is not mounted.");

for (const domain of ["attendance", "leave", "payroll"]) {
  expect(route, `"/operational/${domain}"`, `${domain} report API is missing.`);
  expect(route, `"/operational/${domain}/export.xlsx"`, `${domain} Excel export API is missing.`);
  expect(page, `key: "${domain}"`, `${domain} report workspace is missing from Reports.jsx.`);
  expect(page, `/api/reports/operational/${domain}`, `${domain} report page is not wired to its API.`);
  expect(sidebar, `/reports?view=${domain}`, `${domain} report is not active in the sidebar.`);
}

expect(route, 'requirePermission("reports.view", "attendance.view")', "Attendance Reports need reports.view plus attendance.view.");
expect(route, 'requirePermission("reports.view", "leave.view")', "Leave Reports need reports.view plus leave.view.");
expect(route, 'requirePermission("reports.view", "payroll.view")', "Payroll Reports need reports.view plus payroll.view.");
expect(route, 'requirePermission("reports.view", "reports.export", "attendance.view")', "Attendance export permission gate is incomplete.");
expect(route, 'requirePermission("reports.view", "reports.export", "leave.view")', "Leave export permission gate is incomplete.");
expect(route, 'requirePermission("reports.view", "reports.export", "payroll.view")', "Payroll export permission gate is incomplete.");
expect(route, 'req.auth.activeLocationId', "Operational reports do not use the authenticated active branch context.");
expect(route, 'e."locationId"=$2', "Branch payroll report is not filtered through employee branch membership.");
expect(route, '"REPORT_EXPORT_DOWNLOADED"', "Operational Excel exports are not audited.");
expect(route, 'XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })', "Operational report exports are not real XLSX workbooks.");

expect(page, 'window.addEventListener("chris:location-context-changed"', "Reports do not reload when global branch context changes.");
expect(sidebar, 'permission: "attendance.view"', "Attendance report navigation is not permission-aware.");
expect(sidebar, 'permission: "leave.view"', "Leave report navigation is not permission-aware.");
expect(sidebar, 'permission: "payroll.view"', "Payroll report navigation is not permission-aware.");
expect(sidebar, '!child.permission || hasPermission(child.permission)', "Sidebar does not enforce child report visibility permissions.");

for (const plannedLabel of ["Recruitment Reports", "Compensation Reports", "Benefits Reports", "Custom Reports"]) {
  const pattern = new RegExp(`\\{ label: "${plannedLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}", planned: true \\}`);
  assert.ok(pattern.test(sidebar), `${plannedLabel} must remain planned until its authoritative source module is functional.`);
}

console.log("PASS: Reports & Analytics operational activation acceptance checks.");
