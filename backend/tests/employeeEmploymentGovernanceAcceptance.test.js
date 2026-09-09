const assert = require("assert");
const fs = require("fs");
const path = require("path");

const backendRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(backendRoot, "..");

function read(...parts) {
  return fs
    .readFileSync(path.join(...parts), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

function expect(source, fragment, message) {
  assert(source.includes(fragment), message || `Expected source to contain: ${fragment}`);
}

const schema = read(backendRoot, "prisma", "schema.prisma");
const migration = read(
  backendRoot,
  "prisma",
  "migrations",
  "20260909001500_add_employee_employment_level_assignments",
  "migration.sql"
);
const service = read(
  backendRoot,
  "src",
  "services",
  "employeeEmploymentLevelAssignmentService.js"
);
const liveService = read(
  backendRoot,
  "src",
  "services",
  "zermattEmployeeLevelLiveService.js"
);
const assignmentRoutes = read(
  backendRoot,
  "src",
  "routes",
  "employeeEmploymentAssignmentRoutes.js"
);
const careerRoutes = read(
  backendRoot,
  "src",
  "routes",
  "employeeCareerCatalogRoutes.js"
);
const governedProfileRoutes = read(
  backendRoot,
  "src",
  "routes",
  "employeeProfileGovernanceRoutes.js"
);
const appSource = read(backendRoot, "src", "app.js");
const zermattLeave = read(
  backendRoot,
  "src",
  "services",
  "zermattLeaveEntitlementService.js"
);
const lineManagers = read(repoRoot, "src", "pages", "LineManagers.jsx");
const governancePanel = read(
  repoRoot,
  "src",
  "components",
  "employees",
  "EmployeeEmploymentGovernancePanel.jsx"
);
const profileBoundary = read(
  repoRoot,
  "src",
  "components",
  "employees",
  "EmployeeProfileErrorBoundary.jsx"
);
const employeeProfile = read(
  repoRoot,
  "src",
  "components",
  "employees",
  "EmployeeProfile.jsx"
);

// Schema and migration: tenant-safe, effective-dated individual Employment Levels.
expect(schema, "model EmployeeEmploymentLevelAssignment", "Employee Employment Level assignment model missing.");
expect(schema, "employmentLevelAssignments  EmployeeEmploymentLevelAssignment[]", "Employee relation to Employment Level assignments missing.");
expect(schema, "employeeAssignments EmployeeEmploymentLevelAssignment[]", "Employment Level reverse relation missing.");
expect(migration, 'CREATE TABLE "employee_employment_level_assignments"', "Employment Level migration table missing.");
expect(migration, 'CREATE UNIQUE INDEX "employee_employment_level_assignments_one_current_per_employee"', "One-current-level guard missing.");
expect(migration, 'WHERE "effectiveTo" IS NULL', "Current-assignment partial unique predicate missing.");
expect(migration, 'FOREIGN KEY ("organizationId", "employeeId") REFERENCES "employees"("organizationId", "id")', "Tenant-safe employee foreign key missing.");
expect(migration, 'FOREIGN KEY ("organizationId", "levelNumber") REFERENCES "organization_employment_levels"("organizationId", "levelNumber")', "Tenant-safe level foreign key missing.");

// Resolver authority: individual override first, designation default second.
expect(service, 'source: "EMPLOYEE_OVERRIDE"', "Employee override authority missing.");
expect(service, 'source: "DESIGNATION_DEFAULT"', "Designation-default fallback missing.");
expect(service, "EMPLOYMENT_LEVEL_REASON_REQUIRED", "Reason control missing.");
expect(service, "FUTURE_EFFECTIVE_DATE", "Future-effective-date guard missing.");
expect(service, "organizationAudit.create", "Employment Level organization audit missing.");
expect(service, 'action: "EMPLOYEE_EMPLOYMENT_LEVEL_OVERRIDE_REMOVED"', "Override removal audit action missing.");
expect(service, "data: { effectiveTo }", "Closing an Employment Level override must preserve the original assignment evidence.");
expect(service, "originalReason: current.reason", "Override-removal audit must retain the original assignment reason.");
expect(service, "originallyPerformedByUserId: current.performedByUserId", "Override-removal audit must retain the original assigning actor.");
expect(service, "applyEmploymentLevelOverride", "Transaction-level Employment Level activation function missing.");
expect(service, "applyRemoveEmploymentLevelOverride", "Transaction-level default restoration function missing.");

// API controls: branch-safe reads and atomic live writes.
expect(assignmentRoutes, '"/employment-level/:employeeNumber"', "Employee Employment Level endpoint missing.");
expect(assignmentRoutes, 'requirePermission("employees.view")', "Employment Level read permission missing.");
expect(assignmentRoutes, 'requirePermission("employees.update")', "Employment Level write permission missing.");
expect(assignmentRoutes, "assertEmployeeInActiveBranch", "Employment Level workflow is not protected by active branch context.");
expect(assignmentRoutes, "prisma.$transaction", "Live Employment Level activation must be atomic.");
expect(assignmentRoutes, "applyEmploymentLevelOverride", "Atomic Employment Level save route missing.");
expect(assignmentRoutes, "applyRemoveEmploymentLevelOverride", "Atomic designation-default restoration route missing.");
expect(assignmentRoutes, "synchronizeZermattEmployeeLevelLive", "ZERMATT live activation synchronizer missing from route.");
expect(assignmentRoutes, "liveActivation", "Employment Level API does not expose live activation result.");

// ZERMATT live activation synchronizes current-year Annual Leave in the same transaction.
expect(liveService, "resolveEffectiveEmploymentLevel", "Live activation does not resolve the authoritative employee level.");
expect(liveService, "isZermattV2InternalLevel", "Live activation is not constrained to ZERMATT V2 levels.");
expect(liveService, "resolveZermattV2Level", "Live activation cannot resolve the public ZERMATT level/leave entitlement.");
expect(liveService, "leaveBalance.upsert", "Live activation does not update the current-year Annual Leave balance.");
expect(liveService, "leaveEntitlementAllocation.create", "Live activation does not append leave allocation evidence.");
expect(liveService, "ANNUAL_ENTITLEMENT_BELOW_USED", "Live activation lacks the used-leave safety guard.");
expect(liveService, 'action: "ZERMATT_EMPLOYEE_EMPLOYMENT_LEVEL_LIVE_ACTIVATED"', "Live activation audit action missing.");

// Controlled searchable catalogues for Designation and Employment Level.
expect(careerRoutes, '"/career/designations"', "Controlled designation catalogue endpoint missing.");
expect(careerRoutes, '"/career/employment-levels"', "Controlled Employment Level catalogue endpoint missing.");

// Governed profile: effective employee level is shown without mutating the designation default.
expect(governedProfileRoutes, "resolveEffectiveEmploymentLevel", "Governed employee profile is not using the effective-level resolver.");
expect(governedProfileRoutes, "defaultEmploymentLevel: designationDefault", "Designation default is not preserved separately on the governed profile.");
expect(governedProfileRoutes, "employmentLevel: effectiveEmploymentLevel", "Employee profile is not exposing the effective Employment Level through its established display field.");
expect(governedProfileRoutes, "effectiveEmploymentLevel: effectiveSummary", "Explicit effective Employment Level profile metadata missing.");
expect(governedProfileRoutes, "STRUCTURE_CHANGE_REQUIRES_CONTROLLED_JOB_CHANGE", "Legacy free-text Department/Designation structural-change guard missing.");
expect(employeeProfile, "employee.designation?.employmentLevel?.name", "Employee Profile no longer consumes its established Employment Level display field.");

const governedMount = appSource.indexOf('app.use("/api/employees", employeeProfileGovernanceRoutes);');
const legacyEmployeeMount = appSource.indexOf('app.use("/api/employees", employeeRoutes);');
assert(governedMount >= 0, "Governed employee profile router is not mounted.");
assert(legacyEmployeeMount >= 0, "Legacy employee router mount missing.");
assert(governedMount < legacyEmployeeMount, "Governed employee profile router must run before the legacy employee router.");

// ZERMATT leave provisioning continues to consume the effective employee level.
expect(zermattLeave, "resolveEffectiveEmploymentLevel", "ZERMATT leave is not wired to the effective employee level resolver.");
expect(zermattLeave, "effectiveLevel.levelNumber", "ZERMATT leave does not consume the resolved effective level.");

// Line Manager workflow preserves hierarchy and explicit audited overrides.
expect(lineManagers, "hierarchyOverride", "Line Manager hierarchy override control missing.");
expect(lineManagers, "hierarchyOverrideReason", "Line Manager hierarchy override reason missing.");
expect(lineManagers, "hierarchyCandidates", "Hierarchy-approved manager candidates missing.");
expect(lineManagers, "requiresManualSelection", "Ambiguous hierarchy manual-selection control missing.");
expect(lineManagers, "useSearchParams", "Line Manager workflow does not support employee deep linking.");
expect(lineManagers, 'searchParams.get("employeeNumber")', "Line Manager workflow does not read the employee profile deep link.");

// Reusable individual employee governance UI uses controlled searchable selectors.
expect(governancePanel, "SearchableRegistrySelect", "Searchable registry selector missing from employee governance panel.");
expect(governancePanel, "Save Designation", "Controlled Designation workflow missing.");
expect(governancePanel, "Save Level Override", "Employee-specific Employment Level workflow missing.");
expect(governancePanel, "Use Designation Default", "Designation-default restoration control missing.");
expect(governancePanel, "/api/employee-assignments/employment-level/", "Employee Employment Level API wiring missing from governance panel.");

// The live Employee Profile route must actually mount the governance controls and refresh after changes.
expect(profileBoundary, 'import EmployeeEmploymentGovernancePanel from "./EmployeeEmploymentGovernancePanel"', "Employee governance panel is not imported by the live Employee Profile boundary.");
expect(profileBoundary, "<EmployeeEmploymentGovernancePanel", "Employee governance panel is not mounted on the live Employee Profile route.");
expect(profileBoundary, "employeeNumber={employeeNumber}", "Live Employee Profile is not passing the authoritative employee number into governance controls.");
expect(profileBoundary, "onChanged={() => setProfileVersion", "Employee Profile does not refresh after a governance change.");
expect(profileBoundary, "Manage Line Manager", "Employee Profile does not expose the hierarchy-aware Line Manager workflow.");
expect(profileBoundary, "/employees/line-managers?employeeNumber=", "Employee Profile Line Manager action does not preserve employee context.");

console.log("PASS: Employee Employment Governance acceptance checks.");
