const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const reportsPage = fs.readFileSync(path.join(root, "src/pages/Reports.jsx"), "utf8");
const reportsCss = fs.readFileSync(path.join(root, "src/pages/Reports.css"), "utf8");
const printableBranding = fs.readFileSync(
  path.join(root, "src/components/reporting/PrintableReportBranding.jsx"),
  "utf8"
);
const printableBrandingCss = fs.readFileSync(
  path.join(root, "src/components/reporting/PrintableReportBranding.css"),
  "utf8"
);
const operational = fs.readFileSync(path.join(root, "backend/src/routes/reportsOperationalRoutes.js"), "utf8");
const attendance = fs.readFileSync(path.join(root, "backend/src/services/attendanceService.js"), "utf8");
const leave = fs.readFileSync(path.join(root, "backend/src/services/leaveService.js"), "utf8");
const payroll = fs.readFileSync(path.join(root, "backend/src/routes/payrollRoutes.js"), "utf8");
const payrollOps = fs.readFileSync(path.join(root, "backend/src/services/payrollOperationsService.js"), "utf8");

test("operational report tabs do not wait for a redundant full workforce report", () => {
  for (const expected of [
    "coreLoadedRef",
    "loadCoreReport",
    "loadOperationalReport",
    "Promise.allSettled(tasks)",
    "operationalLoading",
  ]) {
    assert.ok(reportsPage.includes(expected), `Missing report loading optimisation: ${expected}`);
  }
});

test("attendance and leave queries are scoped in the database", () => {
  assert.ok(attendance.includes("locationId = null"));
  assert.ok(attendance.includes("...(locationId ? { locationId } : {})"));
  assert.ok(operational.includes("locationId: req.auth.activeLocationId || null"));

  for (const expected of [
    "leaveYear = null",
    "locationId = null",
    "startDate: { lt: nextYearStart }",
    "endDate: { gte: yearStart }",
    "employee: { is: { locationId } }",
  ]) {
    assert.ok(leave.includes(expected), `Missing leave query scope: ${expected}`);
  }
});

test("payroll reporting includes department and cost centre dimensions with employer cost", () => {
  for (const expected of [
    "organizationSnapshot",
    "departmentName",
    "costCentreName",
    '"Department", "Cost Centre Code", "Cost Centre / Operating Unit", "Branch"',
    '"Payroll by Department"',
    '"Payroll by Cost Centre / Operating Unit"',
    "latestEmployerStatutoryCost",
    "latestTotalEmployerCost",
    '"By Department"',
    '"By Cost Centre"',
    '"Payroll Detail"',
  ]) {
    assert.ok(
      payroll.includes(expected) || payrollOps.includes(expected) || operational.includes(expected) || reportsPage.includes(expected),
      `Missing payroll reporting dimension/control: ${expected}`
    );
  }
});

test("print preview isolates the report and removes application chrome", () => {
  for (const expected of [
    "@page",
    "size: A4 landscape",
    ".chris-mobile-sidebar-wrap",
    ".chris-topbar-shell",
    ".chris-shell-ambient",
    ".chris-standalone-back-wrap",
    ".reports-no-print",
    ".reports-print-header",
    "overflow: visible !important",
    "height: auto !important",
    "max-height: none !important",
  ]) {
    assert.ok(reportsCss.includes(expected), `Missing print-preview correction: ${expected}`);
  }
  assert.ok(reportsPage.includes('className="reports-print-content"'));
  assert.ok(reportsPage.includes('className="reports-print-header"'));
});

test("payroll Excel dashboard uses native chart objects and no cell-bar pseudo charts", () => {
  assert.ok(payroll.includes("addNativeExcelCharts(workbookBuffer, nativeCharts)"));
  assert.equal(payroll.includes('REPT("█"'), false);
  assert.equal(payroll.includes('return "█".repeat'), false);
});


test("printable reports are owned by the client organisation and credit CHRiS in the footer", () => {
  for (const expected of [
    "organization?.legalName",
    "organization?.name",
    "chris-print-report-owner",
    "chris-print-report-header",
    "Powered by CHRiS",
    "chris-print-report-footer",
  ]) {
    assert.ok(
      printableBranding.includes(expected) || printableBrandingCss.includes(expected),
      `Missing printable report branding standard: ${expected}`
    );
  }
  assert.ok(reportsPage.includes("PrintableReportHeader"));
  assert.ok(reportsPage.includes("PrintableReportFooter"));
  assert.equal(reportsPage.includes("CHRiS · Reports & Analytics"), false);
});

test("bar-based report visuals use CHRiS white summary cards with readable titles", () => {
  assert.ok(reportsPage.includes('variant="summary"'));
  assert.ok(reportsPage.includes('background: "#FFFFFF"'));
  assert.ok(reportsPage.includes('color: "#064E3B"'));
  assert.ok(reportsPage.includes('color: "#64748B"'));
  assert.ok(reportsCss.includes(".reports-panel--summary"));
  assert.ok(reportsCss.includes("color: #064e3b !important"));
});
