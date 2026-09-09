const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const backendRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(backendRoot, "..");

function read(...parts) {
  return fs.readFileSync(path.join(...parts), "utf8").replace(/\r\n/g, "\n");
}
function expect(source, fragment, message) {
  assert.ok(source.includes(fragment), message || `Expected source to contain: ${fragment}`);
}

const schema = read(backendRoot, "prisma", "schema.prisma");
const auth = read(backendRoot, "src", "middleware", "authMiddleware.js");
const users = read(backendRoot, "src", "routes", "userRoutes.js");
const editUser = read(repoRoot, "src", "components", "settings", "EditUserForm.jsx");
const provisioner = read(backendRoot, "scripts", "provision-zermatt-branch-hr-access.cjs");

expect(schema, "locationScope UserLocationScope", "User location-scope authority is missing.");
expect(schema, "userLocations       UserLocation[]", "User-to-location relation is missing.");
expect(schema, "model UserLocation", "Tenant-safe UserLocation model is missing.");
expect(auth, 'user.locationScope === "ASSIGNED_LOCATIONS"', "Authentication does not enforce assigned-location scope.");
expect(auth, 'code: "LOCATION_SCOPE_FORBIDDEN"', "Unauthorized branch guard is missing.");

expect(users, "locationScope: true", "User Management does not return location scope.");
expect(users, "assignedLocations:", "User Management does not return assigned locations.");
expect(users, "validateLocationAccess", "User Management does not validate location assignments.");
expect(
  users,
  'req.body.locationScope : "ASSIGNED_LOCATIONS"',
  "New employee users are not safely branch-restricted by default."
);
expect(users, "userLocation.deleteMany", "User location replacements are not controlled.");
expect(users, "userLocation.createMany", "User location assignments are not persisted.");
expect(users, "CHRIS_USER_ACCESS_UPDATED", "User role/location changes are not audited.");
expect(users, "ZERMATT_HEAD_OFFICE_NOT_ASSIGNABLE", "ZERMATT Head Office consolidated-context protection is missing.");

expect(editUser, "locationScope", "User access UI does not expose location scope.");
expect(editUser, "selectedLocationIds", "User access UI does not expose assigned locations.");
expect(editUser, '"ASSIGNED_LOCATIONS"', "Restricted-location option is missing from User access UI.");

for (const name of ["Ann Favour Joseph", "Angel Williams", "Augustina Anienwe"]) {
  expect(provisioner, name, `${name} is missing from the controlled ZERMATT access plan.`);
}
for (const code of ["ABJ", "PHC", "LAG"]) {
  expect(provisioner, `branchCode: "${code}"`, `${code} branch mapping is missing.`);
}
expect(provisioner, 'const ROLE_NAME = "HR & Admin Officer - Branch"', "Existing ZERMATT Branch HR role is not the provisioning authority.");
expect(provisioner, '"Branch HR & Admin Officer"', "Branch HR role alias compatibility is missing.");
expect(provisioner, "assertExistingRoleUsageIsSafe", "Shared role usage is not protected before permission changes.");
expect(provisioner, 'targetLocationScope: "ASSIGNED_LOCATIONS"', "Branch HR provisioning is not restricted to assigned locations.");
expect(provisioner, "ZERMATT_BRANCH_HR_ACCESS_PROVISIONED", "Branch HR provisioning audit is missing.");
expect(provisioner, 'const APPLY = process.argv.includes("--apply")', "Provisioner must default to preview and require --apply for writes.");
expect(provisioner, 'mode: APPLY ? "APPLY" : "PREVIEW_ONLY"', "Provisioner does not clearly report preview/apply mode.");

for (const forbidden of [
  '"payroll.process"',
  '"payroll.manage"',
  '"loans.approve"',
  '"loans.disburse"',
  '"users.manage"',
  '"roles.manage"',
  '"settings.manage"',
]) {
  const roleBlockStart = provisioner.indexOf("const ROLE_PERMISSION_KEYS = [");
  const roleBlockEnd = provisioner.indexOf("];", roleBlockStart);
  const roleBlock = provisioner.slice(roleBlockStart, roleBlockEnd + 2);
  assert.ok(!roleBlock.includes(forbidden), `Least-privilege Branch HR role must not include ${forbidden}.`);
}

console.log("PASS: ZERMATT Branch HR & Admin access governance acceptance checks.");
