const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");
const scriptPath = path.resolve(
  repoRoot,
  "backend/scripts/simulate-zermatt-september-2026-payroll.cjs"
);
const script = fs.readFileSync(scriptPath, "utf8");

function requireText(values) {
  for (const value of values) {
    assert.ok(script.includes(value), `Simulation script must include: ${value}`);
  }
}

test("ZERMATT first payroll simulation remains draft-only and verifies all Release-1 controls", () => {
  requireText([
    'const ORGANIZATION_SLUG = "zermatt-liquor-limited"',
    'const PERIOD_START = "2026-09-01"',
    'const PERIOD_END = "2026-09-30"',
    'const SIMULATION_PERIOD_CODE = "SIM-SEP-2026"',
    'const EXPECTED_EMPLOYEES = 312',
    'getPayrollReadiness',
    'readiness.executionEnabled',
    'readiness.statutoryCalculationEnabled',
    'executeNigeriaDraftPayroll',
    'persisted.run.status !== "DRAFT"',
    'paymentFinalizationEnabled',
    'paymentExceptions',
    'FROM "payroll_salary_advances"',
    'FROM "payroll_loans"',
    '"advanceRecovery"',
    '"loanRecovery"',
    'loanOrAdvanceBalancesChanged: false',
    'Simulation safety violation: a Loan or Salary Advance outstanding balance changed during DRAFT calculation.',
    'row.employmentType === "Part-time" ? standardDays !== 16 : standardDays !== 26',
    'statutory.payeTax',
    'statutory.employeePension',
    'statutory.employerPension',
    'partTime.length === 38',
    'attendanceSourceCounts',
    'deductionTotalsMatch',
    'negativeNetEmployees',
    'liabilitiesUnchangedAtDraft: true',
    'overallPassed',
  ]);

  assert.equal(
    script.includes("submitPayrollRun("),
    false,
    "Simulation must never submit a payroll run."
  );
  assert.equal(
    script.includes("decidePayrollRun("),
    false,
    "Simulation must never approve or reject a payroll run."
  );
  assert.equal(
    script.includes("paymentTransmissionEnabled: true"),
    false,
    "Simulation must never enable payment transmission."
  );
  assert.equal(
    script.includes("UPDATE \"payroll_salary_advances\""),
    false,
    "Simulation must not update Salary Advance balances."
  );
  assert.equal(
    script.includes("UPDATE \"payroll_loans\""),
    false,
    "Simulation must not update Loan balances."
  );

  console.log("PASS: ZERMATT first controlled payroll simulation gate passed.");
});
