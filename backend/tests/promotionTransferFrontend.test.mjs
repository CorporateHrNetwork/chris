import assert from "node:assert/strict";
import {
  buildEmployeeProfileTarget,
  getEmployeeProfileAction,
  isEmployeeProfileActionActive,
} from "../../src/utils/employeeProfileRoute.js";

assert.equal(buildEmployeeProfileTarget("CHR000008", "promotion"), "/employees/CHR000008?action=promotion");
assert.equal(buildEmployeeProfileTarget("CHR000008", "transfer"), "/employees/CHR000008?action=transfer");
assert.equal(buildEmployeeProfileTarget("CHR000008"), "/employees/CHR000008");
assert.equal(buildEmployeeProfileTarget("CHR 8", "promotion"), "/employees/CHR%208?action=promotion");

assert.equal(getEmployeeProfileAction(new URLSearchParams("?action=promotion")), "promotion");
assert.equal(getEmployeeProfileAction(new URLSearchParams("?action=transfer")), "transfer");
assert.equal(getEmployeeProfileAction(new URLSearchParams()), null);
assert.equal(getEmployeeProfileAction(new URLSearchParams("?action=unknown")), null);

const promotionParams = new URLSearchParams("?action=promotion");
const transferParams = new URLSearchParams("?action=transfer");
const profileParams = new URLSearchParams();
assert.equal(isEmployeeProfileActionActive(promotionParams, "promotion"), true);
assert.equal(isEmployeeProfileActionActive(promotionParams, "transfer"), false);
assert.equal(isEmployeeProfileActionActive(transferParams, "transfer"), true);
assert.equal(isEmployeeProfileActionActive(transferParams, "promotion"), false);
assert.equal(isEmployeeProfileActionActive(profileParams, "promotion"), false);
assert.equal(isEmployeeProfileActionActive(profileParams, "transfer"), false);
console.log("PASS: Promotion and transfer navigation behavior passed.");
