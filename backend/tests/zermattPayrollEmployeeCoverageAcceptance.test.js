const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../..");
const read = pathName => fs.readFileSync(path.join(root,pathName),"utf8");
test("Payroll employee coverage compares tenant employee, effective salary and actual run line",()=>{
  const routes=read("backend/src/routes/payrollRoutes.js");
  assert.ok(routes.includes('router.get("/coverage/employee", requirePermission("payroll.view")'));
  assert.ok(routes.includes("organizationId:req.auth.organizationId"));
  assert.ok(routes.includes("availableLocations"));
  assert.ok(routes.includes("activeLocationId"));
  assert.ok(routes.includes("NO_SALARY_RATE_EFFECTIVE_IN_PERIOD"));
  assert.ok(routes.includes("HIRE_DATE_AFTER_PERIOD_END"));
  assert.ok(routes.includes("DEACTIVATION_EVENT_IN_PERIOD"));
  assert.ok(routes.includes("COST_CENTRE_MISSING"));
  assert.ok(routes.includes("DRAFT_RECALCULATION_REQUIRED"));
  assert.ok(routes.includes("APPROVED_OR_SUBMITTED_RUN_MISSING_EMPLOYEE"));
  assert.ok(!routes.slice(routes.indexOf('router.get("/coverage/employee"'),routes.indexOf('router.get("/runs"')).includes("executeNigeriaDraftPayroll("));
});
test("Payroll workspace diagnoses ZLL000342 and requires explicit draft recalculation",()=>{
  const page=read("src/pages/payroll/PayrollWorkspace.jsx");
  assert.ok(page.includes("Employee Payroll Coverage & Missing-Record Diagnosis"));
  assert.ok(page.includes('useState("ZLL000342")'));
  assert.ok(page.includes("/api/payroll/coverage/employee?employeeNumber="));
  assert.ok(page.includes("Check Employee in Payroll"));
  assert.ok(page.includes("Calculate Draft Payroll"));
  assert.ok(page.includes("This run is already submitted or approved"));
});
