const assert = require("assert");
const fs = require("fs");
const path = require("path");

const service = fs.readFileSync(path.resolve(__dirname, "../src/services/employeeLeaveProfileService.js"), "utf8");
const panel = fs.readFileSync(path.resolve(__dirname, "../../src/components/leave/EmployeeLeaveProfilePanel.jsx"), "utf8");
const profile = fs.readFileSync(path.resolve(__dirname, "../../src/components/employees/EmployeeProfile.jsx"), "utf8");
const profileRoute = fs.readFileSync(path.resolve(__dirname, "../../src/utils/employeeProfileRoute.js"), "utf8");

for (const field of ["assignedPolicies", "entitlements", "balances", "utilizationHistory", "activeLeave", "nextUpcomingApprovedLeave", "exceptionWarnings"]) assert.ok(service.includes(field), `missing ${field}`);
assert.match(service, /getEntitlementRegister/);
assert.match(service, /committed: "Pending requests only/);
assert.match(service, /department: \{ select:/);
assert.match(service, /designation: \{ select:/);
assert.match(service, /location: \{ select:/);
assert.match(service, /carryover: row\.carryover/);
assert.match(service, /maximumRequestable: row\.maximumRequestable/);
assert.match(service, /utilizationHistory: requests/);
assert.match(service, /Leave data requires review:/);
assert.match(profile, /Leave Profile/);
assert.match(profile, /activateProfileAction\("leave"\)/);
assert.match(profile, /leaveProfileOpen \? " • Active"/);
assert.match(profileRoute, /"leave"/);
assert.match(panel, /\/api\/leave\/employees\/\$\{encodeURIComponent\(employeeNumber/);
for (const field of ["Carryover", "Adjustments", "Used", "Committed", "Available", "Maximum Requestable", "Utilization History", "Active Leave", "Next Upcoming Approved Leave"]) assert.ok(panel.includes(field), `profile panel missing ${field}`);
assert.match(panel, /reviewedAt/);
assert.match(panel, /commencedAt/);
assert.match(panel, /returnedAt/);
assert.match(panel, /hasPermission\("leave\.manage"\)/);

console.log("PASS: employee Leave Profile contract tests passed.");

