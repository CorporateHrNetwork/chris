const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.resolve(root, relativePath), "utf8");

test("ZERMATT Super User can cancel or delete salary advances under financial-history controls", () => {
  const routes = read("backend/src/routes/payrollLiabilityEditRoutes.js");
  const service = read("backend/src/services/salaryAdvanceControlService.js");
  const ui = read("src/pages/payroll/SalaryAdvancesManaged.jsx");

  for (const expected of [
    'organizationSlug === "zermatt-liquor-limited"',
    "SUPERUSER",
    'router.post("/payroll/salary-advances/:id/cancel"',
    'router.delete("/payroll/salary-advances/:id"',
    "ZERMATT_SUPER_USER_REQUIRED",
    "control-capabilities",
  ]) assert.ok(routes.includes(expected), `missing Super User route/control: ${expected}`);

  for (const expected of [
    "SALARY_ADVANCE_CANCELLED_BY_SUPER_USER",
    "SALARY_ADVANCE_DELETED_BY_SUPER_USER",
    "SALARY_ADVANCE_FINANCIAL_HISTORY_DELETE_BLOCKED",
    'SET "status"=\'CANCELLED\'',
    'DELETE FROM "payroll_salary_advances"',
    "historicalRecoveryPreserved",
  ]) assert.ok(service.includes(expected), `missing salary advance control: ${expected}`);

  assert.ok(service.includes("recoveredAmount > 0"), "hard delete must be blocked once financial history exists");
  assert.ok(service.includes('String(existing.status) === "COMPLETED"'), "completed advances must not be hard deleted");

  for (const expected of [
    "canCancelDelete",
    "cancelAdvance",
    "deleteAdvance",
    ">Cancel</button>",
    ">Delete</button>",
    "Financial history remains immutable",
  ]) assert.ok(ui.includes(expected), `missing Super User salary advance UI control: ${expected}`);

  console.log("PASS: ZERMATT Super User salary advance cancel/delete gate passed.");
});
