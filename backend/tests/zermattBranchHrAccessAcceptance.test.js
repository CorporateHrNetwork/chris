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
const app = read(backendRoot, "src", "app.js");
const financialSupportRoutes = read(backendRoot, "src", "routes", "zermattFinancialSupportRoutes.js");
const loanOptionsRoutes = read(backendRoot, "src", "routes", "zermattHrLoanOptionRoutes.js");
const financialAccess = read(backendRoot, "src", "services", "zermattHrFinancialAccessService.js");
const attendanceRoutes = read(backendRoot, "src", "routes", "attendanceRoutes.js");
const payrollRoutes = read(backendRoot, "src", "routes", "payrollRoutes.js");
const workedDaysPanel = read(repoRoot, "src", "components", "payroll", "ManualWorkedDaysPanel.jsx");
const payrollUi = read(repoRoot, "src", "pages", "payroll", "PayrollIntegratedManaged.jsx");
const editUser = read(repoRoot, "src", "components", "settings", "EditUserForm.jsx");
const provisioner = read(backendRoot, "scripts", "provision-zermatt-branch-hr-access.cjs");
const stagingFixture = read(backendRoot, "scripts", "provision-synthetic-zermatt-staging.cjs");
const financialPermissionMigration = read(
  backendRoot,
  "prisma",
  "migrations",
  "20260915020500_zermatt_branch_hr_loan_input_access",
  "migration.sql"
);

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
expect(
  users,
  "access.locationIds.map((locationId) => ({ locationId }))",
  "Nested branch-user creation must let Prisma inherit organizationId from the parent User relation."
);
expect(users, "CHRIS_USER_ACCESS_UPDATED", "User role/location changes are not audited.");
expect(users, "ZERMATT_HEAD_OFFICE_NOT_ASSIGNABLE", "ZERMATT Head Office consolidated-context protection is missing.");

expect(editUser, "locationScope", "User access UI does not expose location scope.");
expect(editUser, "selectedLocationIds", "User access UI does not expose assigned locations.");
expect(editUser, '"ASSIGNED_LOCATIONS"', "Restricted-location option is missing from User access UI.");

for (const target of [
  ["ZLL000117", "Ann Favour Joseph", "ABJ"],
  ["ZLL000064", "Williams Angel", "PHC"],
  ["ZLL000223", "Augustina Obiajuru Anienwe", "LAG"],
]) {
  const [employeeNumber, canonicalName, branchCode] = target;
  expect(provisioner, `employeeNumber: "${employeeNumber}"`, `${employeeNumber} is missing from the controlled ZERMATT access plan.`);
  expect(provisioner, `canonicalName: "${canonicalName}"`, `${canonicalName} is missing from the verified ZERMATT access plan.`);
  expect(provisioner, `branchCode: "${branchCode}"`, `${branchCode} branch mapping is missing.`);
}
expect(provisioner, "employeeNumber: { in: ASSIGNMENTS.map", "Provisioner must resolve users by verified employee number rather than fuzzy name matching.");
expect(provisioner, 'employee.designation?.code,\n      "HRA-OFF"', "Provisioner must fail closed if a verified target is no longer an HR & Admin Officer.");
expect(provisioner, 'const ROLE_NAME = "HR & Admin Officer - Branch"', "Existing ZERMATT Branch HR role is not the provisioning authority.");
expect(provisioner, '"Branch HR & Admin Officer"', "Branch HR role alias compatibility is missing.");
expect(provisioner, "assertExistingRoleUsageIsSafe", "Shared role usage is not protected before permission changes.");
expect(provisioner, 'targetLocationScope: "ASSIGNED_LOCATIONS"', "Branch HR provisioning is not restricted to assigned locations.");
expect(provisioner, "ZERMATT_BRANCH_HR_ACCESS_PROVISIONED", "Branch HR provisioning audit is missing.");
expect(provisioner, 'const APPLY = process.argv.includes("--apply")', "Provisioner must default to preview and require --apply for writes.");
expect(provisioner, 'mode: APPLY ? "APPLY" : "PREVIEW_ONLY"', "Provisioner does not clearly report preview/apply mode.");

// Branch HR is deliberately not a payroll processor or an in-system loan approver/disburser.
for (const forbidden of [
  '"payroll.process"',
  '"payroll.manage"',
  '"loans.verify"',
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

// The dedicated permission migration grants loan-entry capability to current
// Branch HR role aliases without granting payroll processing/approval/disbursement.
for (const expected of [
  "HR & Admin Officer - Branch",
  "Branch HR & Admin Officer",
  "loans.apply",
]) {
  expect(financialPermissionMigration, expected, `Branch HR loan-input migration is missing ${expected}.`);
}
const executableFinancialPermissionMigration = financialPermissionMigration.replace(/--.*$/gm, "");
for (const forbidden of ["payroll.manage", "payroll.process", "loans.approve", "loans.disburse"]) {
  assert.ok(!executableFinancialPermissionMigration.includes(forbidden), `Branch HR financial-input migration must not grant ${forbidden}.`);
}

// Runtime authority is also role-aware, so future account/role reprovisioning
// cannot strand Branch HR on the employee picker solely because of legacy loans.apply wiring.
for (const expected of [
  "BRANCH_HR_ROLES",
  "HEAD_HR_ROLES",
  "canManageEmployeeFinancialInputs",
  "canManageLoans",
  "assertLocationWithinAccess",
]) {
  expect(financialAccess, expected, `HR financial access control is missing ${expected}.`);
}
expect(loanOptionsRoutes, 'router.get("/loans/employee-options"', "Dedicated HR loan employee-options route is missing.");
expect(loanOptionsRoutes, "canManageLoans(req)", "Loan employee picker must use the scoped HR maintenance authority.");
expect(loanOptionsRoutes, "listLoanEmployeeOptions", "Loan employee picker must retain tenant/location filtering.");

const loanOptionsMount = app.indexOf('app.use("/api", zermattHrLoanOptionRoutes);');
const branchScopeMount = app.indexOf('app.use("/api", activeBranchScopeRoutes);');
assert.ok(loanOptionsMount >= 0 && branchScopeMount > loanOptionsMount, "Role-safe HR loan employee-options route must precede the legacy branch workflow permission guard.");

expect(financialSupportRoutes, 'router.post("/loans/approved-disbursed", zermattOnly, requireLoanEditor', "Approved/disbursed loan recording must use scoped HR authority.");
expect(financialSupportRoutes, 'router.post("/loans/:id/top-up", zermattOnly, requireLoanEditor', "Approved loan top-up recording must use scoped HR authority.");
expect(financialSupportRoutes, "requireEmployeeFinancialInputEditor", "Salary-advance recording must use scoped HR financial-input authority.");
expect(financialSupportRoutes, "assertEmployeeNumberAccess", "New financial-support records must verify the employee is within the user's branch/location authority.");
expect(financialSupportRoutes, "assertLoanRecordAccess", "Loan top-up/status operations must verify loan branch ownership.");
expect(financialSupportRoutes, "requireHeadHrFinancialControl", "Destructive loan correction must remain Head-HR controlled.");

// Branch attendance corrections are operational inputs, not payroll approval authority.
// They must use the generic attendance service, remain branch-scoped, and invalidate draft payroll.
for (const expected of [
  '"/manual-payroll-inputs"',
  "assertEmployeeWithinAttendanceScope",
  "ATTENDANCE_ACTIVE_BRANCH_MISMATCH",
  "ATTENDANCE_LOCATION_ACCESS_DENIED",
  "markDraftRunsRecalculationRequired",
]) {
  expect(attendanceRoutes, expected, `Generic manual worked-days control is missing ${expected}.`);
}
expect(workedDaysPanel, '"/api/attendance/manual-payroll-inputs"', "Payroll UI must use the generic attendance worked-days endpoint.");
assert.ok(!workedDaysPanel.includes('"/api/zermatt/attendance/worked-days"'), "Payroll UI must not call the legacy ZERMATT-only worked-days endpoint.");
expect(workedDaysPanel, "Branch HR & Admin Officers", "Worked-days UI must explain branch HR attendance authority.");

// ZERMATT payroll execution and approval remain Head-of-HR controls.
// Branch HR retains attendance.manage/payroll.view without payroll.process/payroll.manage.
for (const expected of [
  "requireZermattHeadHrPayrollAuthority",
  "ZERMATT_HEAD_HR_PAYROLL_AUTHORITY_REQUIRED",
  'router.post("/runs/draft", requirePermission("payroll.process"), requireZermattHeadHrPayrollAuthority',
  'router.post("/runs/:id/submit", requirePermission("payroll.process"), requireZermattHeadHrPayrollAuthority',
  'router.post("/runs/:id/decision", requirePermission("payroll.manage"), requireZermattHeadHrPayrollAuthority',
]) {
  expect(payrollRoutes, expected, `ZERMATT Head-HR payroll authority is missing ${expected}.`);
}

// Approved payroll export must be an external-audit handoff, not a second in-system approval chain.
for (const expected of [
  '"/runs/:id/audit-pack.xlsx"',
  "PAYROLL_AUDIT_PACK_REQUIRES_APPROVAL",
  "Payroll Register",
  "Management Summary",
  "Branch Analysis",
  "External Handoff",
  "External Auditor Confirmation",
  "GM Approval",
  "Accounts & Finance Payout",
]) {
  expect(payrollRoutes, expected, `Payroll audit-pack contract is missing ${expected}.`);
}
expect(payrollUi, "Export Audit Pack", "Approved payroll UI must expose the audit-pack export.");
expect(payrollUi, "external auditor confirmation, GM approval and Accounts & Finance payout processing", "Payroll UI must describe the external handoff lifecycle.");

// Synthetic ZERMATT staging must remain isolated, explicit and free of embedded credentials.
for (const expected of [
  "CHRIS_ENABLE_SYNTHETIC_ZERMATT_FIXTURE",
  "SYNTHETIC STAGING ACCEPTANCE",
  'slug: SLUG',
  '"HEAD OFFICE"',
  '"ABUJA BRANCH"',
  '"PHC BRANCH"',
  '"LAGOS BRANCH"',
  '"Head of HR"',
  '"HR & Admin Officer - Branch"',
  '"STG-ZLL-SEP-2026"',
  '"ZLL-NG-PAYROLL"',
  '"ADMIN_ENTERED"',
  "Refusing to overwrite an existing non-synthetic",
]) {
  expect(stagingFixture, expected, `Synthetic ZERMATT staging fixture is missing ${expected}.`);
}
for (const secret of ["ChangeMe123!", "Password123", "Synthetic123"]) {
  assert.ok(!stagingFixture.includes(secret), "Synthetic staging fixture must not embed reusable passwords.");
}
expect(stagingFixture, "Passwords are supplied only through Render environment variables and are never printed.", "Fixture must keep staging passwords out of source and logs.");

const stagingHeadPermissionStart = stagingFixture.indexOf("const HEAD_PERMISSIONS = [");
const stagingHeadPermissionEnd = stagingFixture.indexOf("];", stagingHeadPermissionStart);
const stagingHeadPermissionBlock = stagingFixture.slice(stagingHeadPermissionStart, stagingHeadPermissionEnd + 2);
for (const required of [
  '"dashboard.view"',
  '"employees.view"',
  '"recruitment.view"',
  '"attendance.view"',
  '"leave.view"',
  '"payroll.view"',
  '"performance.view"',
  '"training.view"',
  '"reports.view"',
  '"settings.view"',
]) {
  assert.ok(stagingHeadPermissionBlock.includes(required), `Synthetic Head HR staging role must include ${required} so client-admin sidebar modules match real ZERMATT.`);
}
const stagingBranchPermissionStart = stagingFixture.indexOf("const BRANCH_PERMISSIONS = [");
const stagingBranchPermissionEnd = stagingFixture.indexOf("];", stagingBranchPermissionStart);
const stagingBranchPermissionBlock = stagingFixture.slice(stagingBranchPermissionStart, stagingBranchPermissionEnd + 2);
for (const forbidden of ['"settings.view"','"payroll.process"','"payroll.manage"']) {
  assert.ok(!stagingBranchPermissionBlock.includes(forbidden), `Synthetic Branch HR must remain least-privilege and must not gain ${forbidden}.`);
}



console.log("PASS: ZERMATT Branch HR & Admin access governance acceptance checks.");