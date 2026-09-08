const assert = require("assert");
const fs = require("fs");
const path = require("path");

const backendRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(backendRoot, "..");

function read(...parts) {
  return fs.readFileSync(path.join(...parts), "utf8");
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

// API controls: reads require employees.view; writes require employees.update.
expect(assignmentRoutes, '"/employment-level/:employeeNumber"', "Employee Employment Level endpoint missing.");
expect(assignmentRoutes, 'requirePermission("employees.view")', "Employment Level read permission missing.");
expect(assignmentRoutes, 'requirePermission("employees.update")', "Employment Level write permission missing.");
expect(assignmentRoutes, "setEmploymentLevelOverride", "Employment Level save route missing.");
expect(assignmentRoutes, "removeEmploymentLevelOverride", "Employment Level restore-default route missing.");

// Controlled searchable catalogues for Designation and Employment Level.
expect(careerRoutes, '"/career/designations"', "Controlled designation catalogue endpoint missing.");
expect(careerRoutes, '"/career/employment-levels"', "Controlled Employment Level catalogue endpoint missing.");

// ZERMATT leave must consume the effective employee level.
expect(zermattLeave, "resolveEffectiveEmploymentLevel", "ZERMATT leave is not wired to the effective employee level resolver.");
expect(zermattLeave, "effectiveLevel.levelNumber", "ZERMATT leave does not consume the resolved effective level.");

// Line Manager workflow preserves hierarchy and explicit audited overrides.
expect(lineManagers, "hierarchyOverride", "Line Manager hierarchy override control missing.");
expect(lineManagers, "hierarchyOverrideReason", "Line Manager hierarchy override reason missing.");
expect(lineManagers, "hierarchyCandidates", "Hierarchy-approved manager candidates missing.");
expect(lineManagers, "requiresManualSelection", "Ambiguous hierarchy manual-selection control missing.");

// Reusable individual employee governance UI uses controlled searchable selectors.
expect(governancePanel, "SearchableRegistrySelect", "Searchable registry selector missing from employee governance panel.");
expect(governancePanel, "Save Designation", "Controlled Designation workflow missing.");
expect(governancePanel, "Save Level Override", "Employee-specific Employment Level workflow missing.");
expect(governancePanel, "Use Designation Default", "Designation-default restoration control missing.");
expect(governancePanel, "/api/employee-assignments/employment-level/", "Employee Employment Level API wiring missing from governance panel.");

console.log("PASS: Employee Employment Governance acceptance checks.");
