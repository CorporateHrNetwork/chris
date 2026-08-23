const assert = require("assert");
const fs = require("fs");
const path = require("path");

const service = fs.readFileSync(path.resolve(__dirname, "../src/services/employeeLeaveProfileService.js"), "utf8");
const panel = fs.readFileSync(path.resolve(__dirname, "../../src/components/leave/EmployeeLeaveProfilePanel.jsx"), "utf8");
const profile = fs.readFileSync(path.resolve(__dirname, "../../src/components/employees/EmployeeProfile.jsx"), "utf8");

for (const field of ["assignedPolicies", "entitlements", "balances", "utilizationHistory", "activeLeave", "nextUpcomingApprovedLeave", "exceptionWarnings"]) assert.ok(service.includes(field), `missing ${field}`);
assert.match(service, /getEntitlementRegister/);
assert.match(service, /committed: "Pending requests only/);
assert.match(profile, /Employee Leave Profile/);
assert.match(panel, /\/api\/leave\/employees\/\$\{encodeURIComponent\(employeeNumber\)\}\/profile/);

console.log("PASS: employee Leave Profile contract tests passed.");

