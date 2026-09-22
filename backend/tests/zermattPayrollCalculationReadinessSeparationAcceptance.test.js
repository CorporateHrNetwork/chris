const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");
const readiness = fs.readFileSync(
  path.resolve(repoRoot, "backend/src/services/payrollReadinessService.js"),
  "utf8"
);
const routes = fs.readFileSync(
  path.resolve(repoRoot, "backend/src/routes/payrollRoutes.js"),
  "utf8"
);
const dashboard = fs.readFileSync(
  path.resolve(repoRoot, "src/pages/Payroll.jsx"),
  "utf8"
);

function requireText(source, values, label) {
  for (const value of values) {
    assert.ok(source.includes(value), `${label} must include: ${value}`);
  }
}

test("ZERMATT separates payroll calculation readiness from payment finalization readiness", () => {
  requireText(readiness, [
    "const calculationReady = employmentReady && compensationReady;",
    "const paymentFinalizationReady = calculationReady && paymentReady;",
    "readyForExecution: calculationReady",
    "summary.calculationReady === summary.currentEmployees",
    "paymentFinalizationEnabled",
    "PAYMENT_PROFILES_INCOMPLETE",
    "This does not block draft payroll calculation, but it must be resolved before payment finalization.",
    "paymentTransmissionEnabled: false",
  ], "Payroll readiness service");

  assert.ok(
    !readiness.includes("readyForExecution: employmentReady && paymentReady && compensationReady"),
    "Payment profile completeness must not remain part of draft payroll calculation readiness."
  );

  requireText(routes, [
    'router.post("/runs/draft"',
    "if (!readiness.executionEnabled)",
    "PAYROLL_EXECUTION_READINESS_INCOMPLETE",
  ], "Payroll draft route");

  requireText(dashboard, [
    'title="Calculation Ready"',
    "Incomplete payment profiles do not block draft payroll calculation, but must be resolved before payment finalization.",
    "Payroll calculation, statutory readiness, payment readiness and payment transmission are separate controls.",
  ], "Payroll dashboard");

  console.log("PASS: ZERMATT payroll calculation/payment-readiness separation gate passed.");
});
