const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const topbar = fs.readFileSync(path.join(root, "src/components/layout/Topbar/Topbar.jsx"), "utf8");
const payrollUi = fs.readFileSync(path.join(root, "src/pages/payroll/PayrollIntegratedManaged.jsx"), "utf8");
const payslipEmail = fs.readFileSync(path.join(root, "backend/src/services/payrollPayslipEmailService.js"), "utf8");
const ess = fs.readFileSync(path.join(root, "backend/src/routes/employeeSelfServiceRoutes.js"), "utf8");

test("CHRiS topbar provides visible scored typeahead suggestions", () => {
  assert.ok(topbar.includes("SEARCH_SYNONYMS"));
  assert.ok(topbar.includes("searchScore"));
  assert.ok(topbar.includes(".sort((a, b) => b.score - a.score"));
  assert.ok(topbar.includes('overflow: "visible"'));
  assert.ok(topbar.includes("No matching CHRiS workspace."));
});

test("notification bell loads live actionable items and shows a count badge", () => {
  assert.ok(topbar.includes('apiRequest("/api/payroll/approvals")'));
  assert.ok(topbar.includes('apiRequest("/api/news")'));
  assert.ok(topbar.includes('apiRequest("/api/leave/overview")'));
  assert.ok(topbar.includes("NEEDS ATTENTION"));
  assert.ok(topbar.includes("No new actionable notifications found."));
  assert.ok(topbar.includes("notificationItems.reduce"));
});

test("payslip email success is surfaced as a visible success toast", () => {
  assert.ok(payrollUi.includes("Email sent successfully to"));
  assert.ok(payrollUi.includes('role="status"'));
  assert.ok(payrollUi.includes("emailSuccessToastStyle"));
  assert.ok(payrollUi.includes('setTimeout(() => setEmailNotice(""), 7000)'));
});

test("official payslip uses a clean white document background", () => {
  assert.ok(payslipEmail.includes('cmd("1 1 1 rg 0 0 595.28 841.89 re f\\n")'));
  assert.equal(payslipEmail.includes("#f7f3e8"), false);
});

test("unlinked Zermatt ESS users reconcile only by unique same-tenant work email", () => {
  assert.ok(ess.includes("ESS_EMPLOYEE_LINK_AUTO_RECONCILED"));
  assert.ok(ess.includes("LOWER(COALESCE(e.\"email\",''))=LOWER($2)"));
  assert.ok(ess.includes("matches.length === 1"));
  assert.ok(ess.includes("alreadyLinked"));
  assert.ok(ess.includes('matchedBy: "work_email"'));
});
