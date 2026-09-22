const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { detectLeaveMismatch, projectProtectedBalance } = require("../src/services/leaveExceptionSemantics");

const tanni = { id: "tanni", employeeNumber: "CHR000009", status: "LEAVE" };
assert.equal(detectLeaveMismatch(tanni, new Set()), true, "Tanni mismatch is detected without an ACTIVE request");
assert.equal(detectLeaveMismatch(tanni, new Set(["tanni"])), false, "an ACTIVE reconstructed lifecycle resolves the mismatch");
assert.equal(detectLeaveMismatch({ ...tanni, status: "ACTIVE" }, new Set()), false, "restoring ACTIVE resolves the mismatch");
assert.deepEqual(projectProtectedBalance({ openingBalance: 16, accrued: 0, carriedForward: 0, adjusted: 0, used: 7, entitlementAllocations: [{ allocatedEntitlement: 16 }] }, 0), { entitlement: 16, used: 7, committed: 0, available: 9 });

const service = fs.readFileSync(path.resolve(__dirname, "../src/services/leaveExceptionService.js"), "utf8");
const page = fs.readFileSync(path.resolve(__dirname, "../../src/pages/LeaveExceptions.jsx"), "utf8");
assert.match(service, /LEAVE_EXCEPTION_INVESTIGATION_NOTE/);
assert.match(service, /LEAVE_EXCEPTION_STATUS_RESTORED/);
assert.match(service, /administrativeReconstruction: true/);
assert.match(service, /LEAVE_EXCEPTION_HISTORY_RECONSTRUCTED/);
assert.match(service, /assertProtectedState/);
assert.match(service, /allowNewRequest: true/);
assert.match(service, /isolationLevel: "Serializable"/);
assert.doesNotMatch(service, /leaveBalance\.(create|update|delete)|leaveEntitlementAllocation\.(create|update|delete)/);
assert.match(page, /Review Exception/);
assert.match(page, /Keep Open/);
assert.match(page, /Restore Working Status/);
assert.match(page, /Reconstruct Historical Leave/);
assert.match(page, /},4500\)/);

console.log("PASS: Tanni Leave Exception detection and protected resolution contracts passed.");
