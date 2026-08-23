const assert = require("assert");
const fs = require("fs");
const path = require("path");

const provisioning = fs.readFileSync(
  path.resolve(
    __dirname,
    "../src/services/leaveEntitlementProvisioningService.js"
  ),
  "utf8"
);
const operational = fs.readFileSync(
  path.resolve(
    __dirname,
    "../src/services/leaveOperationalService.js"
  ),
  "utf8"
);
const adjustments = fs.readFileSync(
  path.resolve(
    __dirname,
    "../src/services/leaveEntitlementAdjustmentService.js"
  ),
  "utf8"
);
const routes = fs.readFileSync(
  path.resolve(__dirname, "../src/routes/leaveRoutes.js"),
  "utf8"
);
const page = fs.readFileSync(
  path.resolve(
    __dirname,
    "../../src/pages/LeaveEntitlements.jsx"
  ),
  "utf8"
);
const policies = fs.readFileSync(
  path.resolve(
    __dirname,
    "../../src/pages/LeavePolicies.jsx"
  ),
  "utf8"
);

assert.match(provisioning, /status: "ACTIVE",\s*isActive: true/);
assert.match(provisioning, /prisma\.\$transaction/);
assert.match(provisioning, /isolationLevel: "Serializable"/);
assert.match(provisioning, /leaveBalance\.upsert/);
assert.match(provisioning, /update: \{\}/);
assert.match(provisioning, /leavePolicyAudit\.create/);
assert.match(provisioning, /ENTITLEMENT_PROVISIONING/);
assert.match(provisioning, /POLICY_CONFLICT/);
assert.match(provisioning, /MULTIPLE_POLICIES_FOR_LEAVE_TYPE/);
assert.match(operational, /status:"ACTIVE",isActive:true/);
assert.match(
  operational,
  /provisioningStatus:projection\.hasEntitlement\?"PROVISIONED":"NOT_PROVISIONED"/
);
assert.match(adjustments, /ENTITLEMENT_NOT_PROVISIONED/);
assert.doesNotMatch(
  adjustments,
  /if \(!balance\) \{[\s\S]*leaveBalance\.create/
);
assert.match(routes, /entitlements\/provisioning-preview/);
assert.match(routes, /entitlements\/provision/);
assert.match(
  routes,
  /requirePermission\("leave\.manage"\)/
);
assert.match(page, /Provision Entitlements/);
assert.match(page, /Confirm Provisioning/);
assert.match(page, /Existing balances and usage are preserved/);
assert.match(page, /policyIds/);
assert.match(page, /employeeNumbers/);
assert.match(policies, /Custom Policy/);
assert.match(policies, /Clone & Customize/);
assert.match(policies, /Use Policy/);

console.log(
  "PASS: controlled entitlement provisioning tests passed."
);
