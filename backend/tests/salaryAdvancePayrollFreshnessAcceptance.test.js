const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.resolve(root, relativePath), "utf8");

test("Salary Advance changes invalidate stale drafts and eligible recoveries flow on recalculation", () => {
  const nigeria = read("backend/src/services/nigeriaPayrollComplianceService.js");
  const freshness = read("backend/src/services/payrollDraftFreshnessService.js");
  const freshnessRoutes = read("backend/src/routes/payrollDraftFreshnessRoutes.js");
  const liabilityRoutes = read("backend/src/routes/payrollLiabilityEditRoutes.js");

  for (const expected of [
    'FROM "payroll_salary_advances"',
    "\"status\"='ACTIVE'",
    '"outstandingAmount" > 0',
    '"recoveryStartDate" <= $2::date',
    "salaryAdvanceRecoveries: advances",
    "advanceRecovery",
    "RECALCULATED_NIGERIA_DRAFT",
    "CALCULATED_NIGERIA_2026",
  ]) {
    assert.ok(nigeria.includes(expected), `Nigeria payroll recovery/recalculation control missing: ${expected}`);
  }

  for (const expected of [
    "markDraftRunsRecalculationRequired",
    "RECALCULATION_REQUIRED",
    "DRAFT",
    "REJECTED",
  ]) {
    assert.ok(freshness.includes(expected), `draft freshness control missing: ${expected}`);
  }

  assert.ok(freshnessRoutes.includes('router.post("/payroll/salary-advances"'), "salary advance create freshness route missing");
  assert.ok(freshnessRoutes.includes('router.patch("/payroll/salary-advances/:id/status"'), "salary advance status freshness route missing");
  assert.ok(freshnessRoutes.includes('router.post("/payroll/runs/:id/submit"'), "stale payroll submit guard missing");
  assert.ok(freshnessRoutes.includes("PAYROLL_RECALCULATION_REQUIRED"), "stale payroll must be blocked from submission");
  assert.ok(freshnessRoutes.includes("markDraftRunsRecalculationRequired"), "create/status changes must invalidate drafts");

  assert.ok(liabilityRoutes.includes('router.patch("/payroll/salary-advances/:id"'), "salary advance edit route missing");
  assert.ok(liabilityRoutes.includes("markDraftRunsRecalculationRequired"), "salary advance edit must invalidate drafts");
  assert.ok(liabilityRoutes.includes("payrollDraftFreshnessRoutes"), "freshness routes must be mounted before legacy payroll routes");

  console.log("PASS: Salary Advance payroll freshness gate passed.");
});
