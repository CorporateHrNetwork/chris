const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const routes = fs.readFileSync(path.join(root, "backend/src/routes/payrollRoutes.js"), "utf8");
const ui = fs.readFileSync(path.join(root, "src/pages/payroll/RentReliefManaged.jsx"), "utf8");

for (const expected of [
  '"/tax-reliefs/rent/template"',
  '"/tax-reliefs/rent/bulk/preview"',
  '"/tax-reliefs/rent/bulk/import"',
  'upload.single("file")',
  '"Employee Number*"',
  '"Annual Rent Paid (₦)*"',
  '"Evidence / Document Reference*"',
  '"Verification Notes"',
  '"PENDING_VERIFICATION"',
  '"A VERIFIED rent-relief record already exists and cannot be overwritten."',
]) {
  assert.ok(routes.includes(expected), `Missing rent-relief bulk control: ${expected}`);
}

assert.ok(
  routes.includes('String(req.body?.decision || "").trim().toUpperCase() === "VERIFY"'),
  "Only verification should trigger rent-relief payroll freshness."
);
assert.ok(
  routes.includes("Verified rent relief for"),
  "Verification must mark affected draft payroll for recalculation."
);

for (const expected of [
  "Bulk Rent Relief Upload",
  "Download Template",
  "Validate / Preview",
  "Confirm Import",
  "/api/payroll/tax-reliefs/rent/bulk/preview",
  "/api/payroll/tax-reliefs/rent/bulk/import",
  "PENDING_VERIFICATION",
]) {
  assert.ok(ui.includes(expected), `Missing rent-relief upload UI control: ${expected}`);
}

console.log("PASS: PAYE rent relief bulk upload, preview, pending verification and payroll freshness controls.");
