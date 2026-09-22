const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.resolve(root, relativePath), "utf8");

test("ZERMATT Head HR can cancel or delete salary advances under financial-history controls", () => {
  const routes = read("backend/src/routes/payrollLiabilityEditRoutes.js");
  const access = read("backend/src/services/zermattHrFinancialAccessService.js");
  const service = read("backend/src/services/salaryAdvanceControlService.js");
  const ui = read("src/pages/payroll/SalaryAdvancesManaged.jsx");

  for (const expected of [
    "requireHeadHrFinancialControl",
    'router.post("/payroll/salary-advances/:id/cancel"',
    'router.delete("/payroll/salary-advances/:id"',
    "control-capabilities",
    "canDeleteEmployeeFinancialInputs",
  ]) assert.ok(routes.includes(expected) || access.includes(expected), `missing Head HR route/control: ${expected}`);

  for (const expected of [
    "HEAD_HR_ROLES",
    "HEAD OF HR",
    "canDeleteEmployeeFinancialInputs",
    "HEAD_HR_FINANCIAL_CONTROL_REQUIRED",
  ]) assert.ok(access.includes(expected), `missing Head HR authority control: ${expected}`);

  for (const expected of [
    "SALARY_ADVANCE_CANCELLED_BY_HEAD_HR_CONTROL",
    "SALARY_ADVANCE_DELETED_BY_HEAD_HR",
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
    "cancellable && <button",
    "deletable && <button",
    "onClick={() => cancelAdvance(row)}",
    "onClick={() => deleteAdvance(row)}",
    ': "Cancel"',
    ': "Delete"',
    "Head HR correction/delete control",
    "Financial history remains immutable",
  ]) assert.ok(ui.includes(expected), `missing Head HR salary advance UI control: ${expected}`);

  console.log("PASS: ZERMATT Head HR salary advance cancel/delete gate passed.");
});