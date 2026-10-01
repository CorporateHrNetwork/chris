const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const route = fs.readFileSync(path.join(root, "backend/src/routes/employeeSelfServiceRoutes.js"), "utf8");
const auth = fs.readFileSync(path.join(root, "backend/src/middleware/authMiddleware.js"), "utf8");
const app = fs.readFileSync(path.join(root, "backend/src/app.js"), "utf8");
const ui = fs.readFileSync(path.join(root, "src/pages/EmployeeSelfService.jsx"), "utf8");
const router = fs.readFileSync(path.join(root, "src/App.jsx"), "utf8");
const login = fs.readFileSync(path.join(root, "src/pages/Login.jsx"), "utf8");
const migration = fs.readFileSync(
  path.join(root, "backend/prisma/migrations/20261001191500_zermatt_employee_self_service_role/migration.sql"),
  "utf8"
);

test("ESS identity is derived from authenticated user employeeId and never a caller-supplied employee number", () => {
  assert.ok(auth.includes("employeeId: user.employeeId || null"));
  assert.ok(route.includes("id: req.auth.employeeId"));
  assert.ok(route.includes("organizationId: req.auth.organizationId"));
  assert.equal(route.includes("req.params.employeeNumber"), false);
  assert.equal(route.includes("req.query.employeeNumber"), false);
  assert.equal(route.includes("req.body.employeeNumber"), false);
});

test("ESS exposes only approved employee payroll and 12-month-gated gratuity", () => {
  assert.ok(route.includes("r.\"status\"='APPROVED'"));
  assert.ok(route.includes('l."employeeId"=$2'));
  assert.ok(route.includes("twelveCalendarMonthsCompleted"));
  assert.ok(route.includes("becomes visible after 12 completed calendar months"));
  assert.ok(route.includes('"/payslips"'));
  assert.ok(route.includes('"/leave"'));
  assert.ok(route.includes('"/gratuity"'));
});

test("ESS is mounted separately from admin workspaces and employee-only role routes to /ess", () => {
  assert.ok(app.includes('app.use("/api/ess", employeeSelfServiceRoutes)'));
  assert.ok(router.includes('path="/ess"'));
  assert.ok(router.includes("<EmployeeSelfService />"));
  assert.ok(login.includes('roleNames.includes("employee self service")'));
  assert.ok(login.includes('employeeSelfServiceOnly ? "/ess" : "/"'));
  assert.ok(migration.includes("'Employee Self Service'"));
});

test("employee page presents only scoped profile, payroll, payslips, leave, training and gratuity views", () => {
  for (const label of ["My Profile", "Payroll", "Payslips", "Leave Ledger", "Training", "Gratuity Account"]) {
    assert.ok(ui.includes(label), `missing ESS view: ${label}`);
  }
  assert.ok(ui.includes("Only your own approved payroll information"));
  assert.ok(ui.includes("Available after 12 completed months"));
  assert.equal(ui.includes("Employee Directory"), false);
  assert.equal(ui.includes("Payroll Approvals"), false);
});
