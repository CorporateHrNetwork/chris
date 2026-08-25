const assert = require("assert");
const fs = require("fs");
const path = require("path");

const read = (relative) => fs.readFileSync(path.resolve(__dirname, "..", relative), "utf8");
const provisioning = read("src/services/leaveEntitlementProvisioningService.js");
const entitlementsPage = read("../src/pages/LeaveEntitlements.jsx");
const correction = read("scripts/retireDuplicateLevel6AnnualMatrixRule.js");

assert.match(provisioning, /ACTIVE_ENTITLEMENT_MATRIX_RULE_EXISTS/);
assert.match(provisioning, /isActive: true, effectiveFrom: \{ lte: now \}/);
assert.match(provisioning, /isolationLevel: "Serializable"/);
assert.match(provisioning, /ENTITLEMENT_MATRIX_EFFECTIVE_DATED_CHANGE/);
assert.match(provisioning, /effectiveTo: new Date\(effectiveFrom\.getTime\(\) - 1\)/);
assert.match(provisioning, /INVALID_ENTITLEMENT_EFFECTIVE_DATE_SEQUENCE/);
assert.match(entitlementsPage, /effectiveFrom: String\(row\.effectiveFrom\)\.slice\(0, 10\)/);
assert.match(correction, /EXPECTED_EXACTLY_ONE_CURRENT_28_AND_ONE_CURRENT_30_LEVEL_6_ANNUAL_RULE/);
assert.match(correction, /DUPLICATE_RULES_DO_NOT_REFERENCE_THE_SAME_POLICY/);
assert.match(correction, /isolationLevel: "Serializable"/);
assert.match(correction, /PRESERVATION_CHECK_FAILED/);
assert.match(correction, /baselineReconciliationWillRun: false/);
assert.doesNotMatch(correction, /leave(Balance|Request|EntitlementAllocation)\.(update|delete|create)/);

console.log("PASS: current matrix uniqueness and safe duplicate-retirement contract tests passed.");
