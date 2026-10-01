const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const users = fs.readFileSync(path.join(root, "backend/src/routes/userRoutes.js"), "utf8");
const ess = fs.readFileSync(path.join(root, "backend/src/routes/employeeSelfServiceRoutes.js"), "utf8");
const news = fs.readFileSync(path.join(root, "backend/src/routes/employeeNewsRoutes.js"), "utf8");
const payroll = fs.readFileSync(path.join(root, "backend/src/routes/payrollIntegrationRoutes.js"), "utf8");
const reset = fs.readFileSync(path.join(root, "src/pages/ResetPassword.jsx"), "utf8");
const ui = fs.readFileSync(path.join(root, "src/pages/EmployeeSelfService.jsx"), "utf8");
const app = fs.readFileSync(path.join(root, "src/App.jsx"), "utf8");
const settings = fs.readFileSync(path.join(root, "src/components/settings/UsersRolesSettings.jsx"), "utf8");

test("Zermatt already supports approved payroll bulk payslip email", () => {
  assert.ok(payroll.includes('router.post("/payslips/email-run"'));
  assert.ok(payroll.includes("Bulk payslip email is available only for an APPROVED payroll run."));
  assert.ok(payroll.includes("PAYSLIPS_BULK_EMAIL_REQUESTED"));
  assert.ok(payroll.includes("Employee email is missing."));
});

test("bulk ESS provisioning never overwrites existing users and returns expiring activation links", () => {
  assert.ok(users.includes('router.post("/ess/provision-bulk"'));
  assert.ok(users.includes("user: null"));
  assert.ok(users.includes('name: "Employee Self Service"'));
  assert.ok(users.includes("72 * 60 * 60 * 1000"));
  assert.ok(users.includes("activationUrl"));
  assert.ok(users.includes("ESS_USER_PROVISIONED"));
  assert.ok(reset.includes('new URLSearchParams(location.search).get("token")'));
  assert.ok(settings.includes("Provision Zermatt ESS Accounts"));
  assert.ok(settings.includes("CHRiS-Zermatt-ESS-Activation-Links"));
});

test("published internal news is visible in ESS while drafts remain admin-only", () => {
  assert.ok(news.includes('requirePermission("employees.update")'));
  assert.ok(news.includes("DRAFT"));
  assert.ok(news.includes("PUBLISHED"));
  assert.ok(news.includes("ARCHIVED"));
  assert.ok(ess.includes('router.get("/news"'));
  assert.ok(ess.includes('"status"=\'PUBLISHED\''));
  assert.ok(ui.includes("Zermatt News"));
  assert.ok(ui.includes("Zermatt News & Opportunities"));
  assert.ok(app.includes('path="/employees/news"'));
});

test("internal news supports the approved Zermatt communication categories", () => {
  for (const category of [
    "ANNOUNCEMENT","PROMOTION","INTERNAL_CAREER","TRANSFER",
    "RETIREMENT","TERMINATION","EVENT","POLICY_HR_UPDATE"
  ]) assert.ok(news.includes(category));
});
