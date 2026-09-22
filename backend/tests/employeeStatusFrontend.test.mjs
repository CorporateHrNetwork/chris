import assert from "node:assert/strict";
import { formatEmployeeStatus, getEmployeeStatusMeta } from "../../src/utils/employeeStatus.js";

const expected = {
  ACTIVE: ["Active", "green"],
  PROBATION: ["Probation", "amber"],
  LEAVE: ["On Leave", "blue"],
  SUSPENDED: ["Suspended", "orange"],
  TERMINATED: ["Terminated", "red"],
  RESIGNED: ["Resigned", "red"],
  RETIRED: ["Retired", "red"],
  INACTIVE: ["Inactive", "red"],
};

for (const [status, [label, tone]] of Object.entries(expected)) {
  assert.equal(formatEmployeeStatus(status), label);
  assert.equal(getEmployeeStatusMeta(status).tone, tone);
}
assert.equal(getEmployeeStatusMeta(null).tone, "neutral");
assert.equal(formatEmployeeStatus(null), "Unspecified");
assert.equal(formatEmployeeStatus("custom_status"), "Custom Status");
console.log("PASS: CHRIS frontend employee-status semantics tests passed.");
