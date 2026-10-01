const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("current rent relief export covers all current employees and exposes recorded vs derived figures", () => {
  const root = path.resolve(__dirname, "..", "..");
  const route = fs.readFileSync(path.join(root,"backend/src/routes/payrollRoutes.js"),"utf8");
  const ui = fs.readFileSync(path.join(root,"src/pages/payroll/RentReliefManaged.jsx"),"utf8");

  assert.ok(route.includes('"/tax-reliefs/rent/export-current"'));
  assert.ok(route.includes("Current Recorded Rent (Gross × 11% × 56)"));
  assert.ok(route.includes("Recorded Annual Rent Basis"));
  assert.ok(route.includes("Recorded Eligible Rent Relief"));
  assert.ok(route.includes("NOT RECORDED"));
  assert.ok(route.includes("IN ('ACTIVE','PROBATION','LEAVE','SUSPENDED')"));
  assert.ok(route.includes("LEFT JOIN LATERAL"));
  assert.ok(route.includes("payroll_tax_reliefs"));
  assert.ok(ui.includes("Download Current Rent Relief"));
  assert.ok(ui.includes("export-current?taxYear="));
});
