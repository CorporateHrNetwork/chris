const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const source = fs.readFileSync(
  path.join(root, "src/pages/payroll/PayrollIntegratedManaged.jsx"),
  "utf8"
);

test("payroll readiness errors expose employee-specific blockers", () => {
  for (const expected of [
    "PAYROLL_READINESS_BLOCKER_LABELS",
    "EMPLOYMENT_TYPE_MISSING",
    "COST_CENTRE_MISSING",
    "AUTHORITATIVE_COMPENSATION_RATE_NOT_CONFIGURED",
    "effective salary rate is missing",
    "PAYROLL_EXECUTION_READINESS_INCOMPLETE",
    "error?.details?.employees",
    "payrollOperationErrorMessage",
  ]) {
    assert.ok(source.includes(expected), `Missing readiness UX control: ${expected}`);
  }
});

test("payment profile incompleteness is not presented as a draft calculation blocker", () => {
  assert.ok(source.includes('.filter((blocker) => blocker !== "PAYMENT_PROFILE_INCOMPLETE")'));
});

test("transient payroll operation errors auto-clear instead of remaining indefinitely", () => {
  assert.ok(source.includes('window.setTimeout(() => setError(""), 12000)'));
  assert.ok(source.includes('window.clearTimeout(timer)'));
});
