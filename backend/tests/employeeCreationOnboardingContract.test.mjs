import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, "..", "..");
const read = (relativePath) =>
  fs
    .readFileSync(path.join(projectRoot, relativePath), "utf8")
    .replace(/\r\n/g, "\n");

const employeeRoutes = read("backend/src/routes/employeeRoutes.js");
const employeeCreationService = read(
  "backend/src/services/employeeCreationService.js"
);
const onboardingRoutes = read("backend/src/routes/onboardingRoutes.js");
const backendApp = read("backend/src/app.js");
const schema = read("backend/prisma/schema.prisma");
const addEmployee = read("src/components/employees/AddEmployee.jsx");
const employeesPage = read("src/pages/Employees.jsx");

function section(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `Missing contract marker: ${startMarker}`);
  assert.notEqual(end, -1, `Missing contract marker: ${endMarker}`);
  return source.slice(start, end);
}

const createEmployee = section(
  employeeRoutes,
  "CREATE EMPLOYEE",
  "DESIGNATION_LIFECYCLE_API"
);
const startOnboarding = section(
  onboardingRoutes,
  'router.post(\n  "/:employeeNumber",',
  "const uploadRoot"
);

// The public employee-create API and its safe error contract remain stable.
assert.match(createEmployee, /requirePermission\(\s*"employees\.create"\s*\)/);
assert.match(createEmployee, /createEmployee\(\{[\s\S]*organizationId:\s*req\.auth\.organizationId[\s\S]*actorUserId:\s*req\.auth\.userId[\s\S]*input:\s*req\.body/);
for (const code of [
  "EMPLOYEE_REQUIRED_FIELDS_MISSING",
  "INVALID_EMPLOYEE_GENDER",
  "INVALID_EMPLOYEE_NAME",
  "EMPLOYEE_EMAIL_ALREADY_EXISTS",
  "INVALID_EMPLOYEE_DEPARTMENT",
  "INVALID_EMPLOYEE_DESIGNATION",
  "EMPLOYMENT_LEVEL_MAPPING_REQUIRED",
  "INVALID_EMPLOYEE_LOCATION",
  "EMPLOYEE_NUMBER_SEQUENCE_EXHAUSTED",
]) {
  assert.match(employeeCreationService, new RegExp(code));
}
assert.match(createEmployee, /res\.status\(201\)\.json\([\s\S]*status:\s*"success"[\s\S]*data:\s*employee/);

// All organization-placement lookups are tenant scoped and active.
assert.match(employeeCreationService, /prisma\.department\.findFirst\([\s\S]*organizationId[\s\S]*isActive:\s*true/);
assert.match(employeeCreationService, /prisma\.designation\.findFirst\([\s\S]*organizationId[\s\S]*departmentId:\s*department\.id[\s\S]*isActive:\s*true/);
assert.match(employeeCreationService, /resolveEmploymentLevelFromDesignation\(\{[\s\S]*organizationId[\s\S]*designationId:\s*designation\.id/);
assert.match(employeeCreationService, /prisma\.organizationLocation\.findFirst\([\s\S]*organizationId[\s\S]*isActive:\s*true/);

// Employee number, Employee, Episode 1 and Leave provisioning are one unit.
const transaction = section(
  employeeCreationService,
  "return prisma.$transaction",
  "function createEmployee(args)"
);
assert.match(transaction, /tx\.organization\.update\([\s\S]*employeeNumberSequence:[\s\S]*increment:\s*1/);
assert.match(transaction, /const employeeNumber\s*=\s*`CHR\$\{String\(/);
assert.match(transaction, /tx\.employee\.create\(/);
assert.match(transaction, /tx\.employeeEmploymentEpisode\.create\([\s\S]*sequenceNumber:\s*1[\s\S]*startReason:\s*"Initial employment"/);
assert.match(transaction, /provisionNewEmployeeEntitlements\([\s\S]*employeeNumber:\s*employee\.employeeNumber[\s\S]*actorUserId[\s\S]*tx/);
assert.ok(
  transaction.indexOf("tx.employee.create") <
    transaction.indexOf("tx.employeeEmploymentEpisode.create") &&
    transaction.indexOf("tx.employeeEmploymentEpisode.create") <
      transaction.indexOf("provisionNewEmployeeEntitlements"),
  "Employee creation must precede Episode 1 and Leave provisioning."
);

// Onboarding remains a separate tenant-owned domain attached to an Employee.
assert.match(schema, /model Employee\s*\{[\s\S]*employmentEpisodes\s+EmployeeEmploymentEpisode\[\][\s\S]*onboardings\s+EmployeeOnboarding\[\]/);
assert.match(schema, /model EmployeeOnboarding\s*\{[\s\S]*organizationId\s+String[\s\S]*employeeId\s+String[\s\S]*templateId\s+String/);
assert.match(schema, /model EmployeeDocument\s*\{[\s\S]*employeeId\s+String[\s\S]*onboardingId\s+String\?/);
assert.doesNotMatch(employeeCreationService, /employeeOnboarding\.create/);

// Starting onboarding uses the existing employee, designation level and template.
assert.match(startOnboarding, /requirePermission\("employees\.update"\)/);
assert.match(startOnboarding, /prisma\.employee\.findFirst\([\s\S]*organizationId[\s\S]*employeeNumber:[\s\S]*req\.params\.employeeNumber/);
assert.match(startOnboarding, /resolveEmploymentLevelFromDesignation\([\s\S]*organizationId[\s\S]*designationId:\s*employee\.designationId/);
assert.match(startOnboarding, /prisma\.onboardingWorkflowTemplate\.findFirst\([\s\S]*organizationId[\s\S]*isActive:\s*true/);
assert.match(startOnboarding, /prisma\.employeeOnboarding\.findFirst\([\s\S]*organizationId[\s\S]*employeeId:[\s\S]*employee\.id[\s\S]*not:\s*"COMPLETED"/);
assert.match(startOnboarding, /tx\.employeeOnboarding\.create\([\s\S]*status:\s*"IN_PROGRESS"[\s\S]*completionPercent:\s*0/);
assert.match(startOnboarding, /prisma\.\$transaction\([\s\S]*createTasksFromTemplate/);

// Route ordering prevents /api/employees/onboarding from being swallowed by
// the general /api/employees router.
assert.ok(
  backendApp.indexOf('"/api/employees/onboarding"') <
    backendApp.indexOf('"/api/employees"'),
  "Mount onboarding routes before the general employee routes."
);

// Quick Add continues to consume the authoritative API and returned identity.
assert.match(addEmployee, /apiRequest\(\s*"\/api\/employees"[\s\S]*method:\s*"POST"/);
assert.match(addEmployee, /designation\.departmentId\s*===\s*formData\.departmentId/);
assert.match(addEmployee, /Number\.isInteger\(selectedDesignation\.careerLevel\)/);
assert.match(addEmployee, /onSave\(\s*result\.data\s*\)/);
assert.match(employeesPage, /Employee created successfully — \{createdEmployee\.employeeNumber\}/);
assert.match(employeesPage, /View Employee Profile/);
assert.match(employeesPage, /Continue Onboarding/);
assert.match(employeesPage, /setTimeout\([\s\S]*7500/);

console.log(
  "PASS: authoritative Employee creation and separated Onboarding contracts are protected."
);
