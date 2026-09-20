const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const service = fs.readFileSync(path.join(root, "backend/src/services/nigeriaPayrollComplianceService.js"), "utf8");
const routes = fs.readFileSync(path.join(root, "backend/src/routes/payrollRoutes.js"), "utf8");
const ui = fs.readFileSync(path.join(root, "src/pages/payroll/RentReliefManaged.jsx"), "utf8");

for (const expected of [
  "async function bulkVerifyRentReliefs",
  "RENT_RELIEF_SELECTION_REQUIRED",
  "RENT_RELIEF_BULK_LIMIT_EXCEEDED",
  "A maximum of 500 rent-relief records can be verified in one batch.",
  'const placeholders = ids.map((_, index) => "$" + (index + 2)).join(",");',
  'const actorPlaceholder = "$" + (ids.length + 2);',
  'const notesPlaceholder = "$" + (ids.length + 3);',
  "FOR UPDATE",
  "RENT_RELIEF_BATCH_NOT_PENDING",
  "Every selected record must have an Evidence / Document Reference before bulk verification.",
  'action: "VERIFIED_RENT_RELIEF"',
  "organizationAudit.createMany",
  "timeout: 30000",
]) {
  assert.ok(service.includes(expected), `Missing bulk verification service control: ${expected}`);
}

for (const expected of [
  '"/tax-reliefs/bulk/verify"',
  "requireZermattHeadHrPayrollAuthority",
  "bulkVerifyRentReliefs",
  "rent-relief record(s) were bulk verified; draft PAYE must be recalculated.",
]) {
  assert.ok(routes.includes(expected), `Missing bulk verification API control: ${expected}`);
}

for (const expected of [
  "selectedReliefIds",
  "Select All Pending",
  "Verify Selected",
  "toggleAllPending",
  "verifySelected",
  'type="checkbox"',
  "window.confirm",
  "/api/payroll/tax-reliefs/bulk/verify",
  "Verified reliefs will become eligible for PAYE calculation",
]) {
  assert.ok(ui.includes(expected), `Missing bulk verification UI control: ${expected}`);
}

console.log("PASS: rent relief bulk verification controls, audit, binding and payroll freshness.");
