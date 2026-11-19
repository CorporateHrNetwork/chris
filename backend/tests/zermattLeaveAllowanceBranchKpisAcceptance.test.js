const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const route = fs.readFileSync(path.join(root, "backend/src/routes/zermattLeaveAllowanceRoutes.js"), "utf8");
const page = fs.readFileSync(path.join(root, "src/pages/benefits/ZermattLeaveAllowance.jsx"), "utf8");
const register = fs.readFileSync(path.join(root, "backend/src/services/zermattLeaveAllowanceRegisterService.js"), "utf8");

test("branch Leave Allowance KPIs are computed from the same authorized rows as the table", () => {
  assert.ok(route.includes('const rows = (data.rows || []).filter((row) => visibleInCurrentHrScope(req, row.locationId));'));
  assert.ok(route.includes('const employeesWithCurrentPayroll = rows.filter((row) => Boolean(row.payrollPeriod)).length;'));
  assert.ok(route.includes('const dueRows = rows.filter((row) => row.dueThisMonth);'));
  assert.ok(route.includes('const approvedPayments = rows.flatMap((row) => row.paymentHistory || []);'));
  assert.ok(route.includes('payableRows.reduce((sum, row) => sum + Number(row.projectedLeaveAllowance || 0)'));
  assert.ok(route.includes('employeesWithCurrentPayroll,'));
  assert.ok(route.includes('employeesDueThisMonth: dueRows.length,'));
  assert.ok(route.includes('totalApprovedPayments: approvedPayments.length,'));
  assert.ok(!route.includes('...data.summary,'), "organization-wide totals must not be spread into branch response");
  assert.ok(register.includes('payrollPeriod: salary?.code || null'));
  assert.ok(register.includes('projectedLeaveAllowance:'));
});

test("branch switch reloads the Leave Allowance register instead of showing stale Lagos metrics", () => {
  assert.ok(page.includes('chris:location-context-changed'));
  assert.ok(page.includes('getActiveLocationId()'));
  assert.ok(page.includes('}, [locationId]);'));
  assert.ok(page.includes('summary.amountPayableThisMonth'));
});
