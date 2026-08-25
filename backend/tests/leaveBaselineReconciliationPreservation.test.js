const assert = require("assert");

process.env.DATABASE_URL ||= "postgresql://test:test@localhost:5432/test";
const { assertPreserved } = require("../src/services/baselineLeaveEntitlementReconciliationService");

function state(usedBalances) {
  return {
    hashes: {
      requests: "requests", employees: "employees", pending: "pending",
      optionalPolicies: "optionalPolicies", adjustments: "adjustments", matrixRules: "matrixRules",
    },
    usedBalances,
  };
}

const existingNonZero = {
  id: "balance-existing", employeeId: "employee-a", leaveTypeId: "annual",
  used: 6, accrued: 0, carriedForward: 0, adjusted: 0,
};

assert.doesNotThrow(() => assertPreserved(
  state([existingNonZero]),
  state([{ ...existingNonZero }]),
), "REBASE must preserve a pre-existing non-zero used value");

assert.doesNotThrow(() => assertPreserved(
  state([existingNonZero]),
  state([
    { ...existingNonZero },
    { id: "balance-new", employeeId: "employee-b", leaveTypeId: "annual", used: 0, accrued: 0, carriedForward: 0, adjusted: 0 },
  ]),
), "a newly created zero-used balance must not fail preservation");

assert.throws(() => assertPreserved(
  state([existingNonZero]),
  state([{ ...existingNonZero, used: 0 }]),
), /PRESERVATION_CHECK_FAILED: usedBalances/, "an existing used value may not be reset");

assert.throws(() => assertPreserved(
  state([existingNonZero]),
  state([]),
), /PRESERVATION_CHECK_FAILED: usedBalances/, "an existing balance may not disappear");

assert.throws(() => assertPreserved(
  state([existingNonZero]),
  state([
    { ...existingNonZero },
    { id: "balance-new", employeeId: "employee-b", leaveTypeId: "annual", used: 1, accrued: 0, carriedForward: 0, adjusted: 0 },
  ]),
), /PRESERVATION_CHECK_FAILED: usedBalances/, "a newly created balance must start with zero used");

console.log("PASS: baseline reconciliation balance preservation tests passed.");
