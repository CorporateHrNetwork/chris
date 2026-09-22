const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");

function read(relativePath) {
  return fs
    .readFileSync(path.join(root, relativePath), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

function includes(source, value, message) {
  assert.ok(source.includes(value), message || `Expected source to include: ${value}`);
}

const api = read("src/services/api.js");
const selector = read("src/components/BranchContextSelector.jsx");
const topbar = read("src/components/layout/Topbar/Topbar.jsx");
const layout = read("src/layouts/MainLayout.jsx");
const dashboard = read("src/pages/Dashboard.jsx");
const workforceKpis = read("src/components/dashboard/WorkforceKpis.jsx");
const auth = read("backend/src/middleware/authMiddleware.js");
const app = read("backend/src/app.js");
const branchScope = read("backend/src/routes/activeBranchScopeRoutes.js");
const employeeProfile = read("backend/src/routes/employeeProfileGovernanceRoutes.js");
const lineManagers = read("backend/src/routes/lineManagerRoutes.js");
const analytics = read("backend/src/routes/analyticsRoutes.js");
const workforceAnalytics = read("backend/src/services/workforceAnalyticsService.js");
const payrollEmployees = read("backend/src/routes/payrollEmployeeOptionRoutes.js");
const payrollReadiness = read("backend/src/services/payrollReadinessService.js");
const leaveOperational = read("backend/src/services/leaveOperationalService.js");
const zermattOps = read("backend/src/routes/zermattOperationsRoutes.js");

// Global transport: every API request/download automatically carries branch context.
includes(api, '"X-CHRiS-Location-Id": activeLocationId', "API transport must send the active location header globally.");
includes(api, 'localStorage.getItem("chris_active_location_id")', "Selected branch must persist across navigation/reload.");
includes(api, 'window.dispatchEvent(new CustomEvent("chris:location-context-changed"', "Branch changes must emit an application event.");

// ZERMATT business semantics: HEAD OFFICE is the consolidated company view;
// only actual BRANCH rows appear as alternative contexts.
includes(selector, '<option value="">HEAD OFFICE</option>', "HEAD OFFICE must be the consolidated selector option.");
includes(selector, 'String(location?.type || "").toUpperCase() === "BRANCH"', "Only actual branch rows may appear below Head Office.");
assert.ok(!selector.includes("ALL BRANCHES"), "The selector must not expose a separate All Branches option.");
includes(selector, "Consolidated organization-wide view", "Head Office must be labelled as the consolidated organization view.");
includes(topbar, 'import BranchContextSelector from "../../BranchContextSelector"', "Topbar must own the persistent selector.");
includes(topbar, "<BranchContextSelector compact />", "Topbar must render the selector on every protected page.");
assert.ok(!layout.includes("BranchContextSelector"), "Branch selector must not be duplicated inside page content.");

// Backend authorization: ALL_LOCATIONS permits Super User switching; invalid
// IDs fail closed; the physical ZERMATT HEAD_OFFICE row normalizes to consolidated.
includes(auth, 'user.locationScope === "ALL_LOCATIONS"', "ALL_LOCATIONS scope must remain the Super User branch authority.");
includes(auth, 'code: "LOCATION_SCOPE_FORBIDDEN"', "Unauthorized branch IDs must fail closed.");
includes(auth, 'user.organization?.slug === "zermatt-liquor-limited"', "ZERMATT Head Office normalization must be tenant-specific.");
includes(auth, 'String(requestedLocation?.type || "").toUpperCase() === "HEAD_OFFICE"', "Physical Head Office row must normalize to consolidated context.");
includes(auth, "requestedLocationId = null", "Physical Head Office header must become consolidated context.");

// Active branch scope is cross-module and must execute before business routers.
includes(app, 'const activeBranchScopeRoutes = require("./routes/activeBranchScopeRoutes")', "Global active branch router must be registered.");
includes(app, 'app.use("/api", activeBranchScopeRoutes)', "Global active branch router must be mounted.");
assert.ok(
  app.indexOf('app.use("/api", activeBranchScopeRoutes)') <
    app.indexOf('app.use("/api/employees/onboarding", onboardingRoutes)'),
  "Active branch scope must run before employee/module routers."
);

// Employee directory/profile and Line Manager target population remain branch scoped.
includes(employeeProfile, '? { locationId: req.auth.activeLocationId }', "Employee Directory must filter to active branch.");
includes(employeeProfile, 'router.use("/:employeeNumber"', "Employee-specific subroutes must inherit active branch security.");
includes(employeeProfile, 'code: "EMPLOYEE_OUTSIDE_ACTIVE_BRANCH"', "Cross-branch direct employee access must fail closed.");
includes(lineManagers, "activeLocationId = null", "Line Manager resolver must accept active branch context.");
includes(lineManagers, "locationContext: locationContext(req)", "Line Manager responses must report location context.");

// Dashboard metrics must all come from branch-aware data sources.
includes(dashboard, 'apiRequest("/api/employees")', "Dashboard employee/demographic metrics must use branch-scoped Employee Directory.");
includes(dashboard, 'apiRequest("/api/analytics/workforce")', "Dashboard attendance/leave metrics must use branch-scoped workforce analytics.");
includes(dashboard, "result?.data?.attendance?.recordsToday", "Dashboard attendance KPI must come from scoped analytics.");
includes(dashboard, "result?.data?.leave?.pendingRequests", "Dashboard pending leave KPI must come from scoped analytics.");
includes(workforceKpis, 'apiRequest("/api/analytics/workforce")', "Workforce status cards must use branch-scoped analytics.");
includes(workforceAnalytics, "const allEmployeeWhere", "Historical identity/status counts must use scoped employee where clauses.");
includes(workforceAnalytics, "...relationScope", "Employee-linked analytics must inherit branch scope.");
includes(analytics, 'mode: "HEAD_OFFICE_CONSOLIDATED"', "No-location analytics context must be Head Office consolidated.");

// Branch-sensitive operational modules are centrally scoped.
for (const route of [
  "/leave/overview",
  "/leave/requests",
  "/attendance/report",
  "/payroll/readiness",
  "/payroll/salary-advances",
  "/payroll/runs",
  "/payroll/payslips",
  "/loans/summary",
  "/loans/recoveries",
  "/employee-reports/workforce",
  "/exits/register",
]) {
  includes(branchScope, route, `Active branch router must cover ${route}.`);
}
includes(branchScope, "HEAD_OFFICE_REQUIRED_FOR_ORGANIZATION_CONTROL", "Organization-wide payroll/provisioning controls must fail closed from branch context.");
includes(branchScope, "LOAN_OUTSIDE_ACTIVE_BRANCH", "Loan workflow must enforce selected branch ownership.");
includes(branchScope, "LEAVE_REQUEST_OUTSIDE_ACTIVE_BRANCH", "Leave workflow must enforce selected branch ownership.");

// Foundational services support direct branch filtering.
includes(payrollReadiness, "locationId = null", "Payroll readiness service must accept branch context.");
includes(payrollReadiness, "...(locationId ? { locationId } : {})", "Payroll readiness employees must be branch filtered.");
includes(leaveOperational, "locationId = null", "Leave operational services must accept branch context.");
includes(leaveOperational, "requestLocationWhere(locationId)", "Leave request aggregates must use employee branch ownership.");
includes(payrollEmployees, 'mode: "HEAD_OFFICE_CONSOLIDATED"', "Payroll employee selection must label Head Office correctly.");
includes(zermattOps, '...(req.auth.activeLocationId ? { locationId: req.auth.activeLocationId } : {})', "ZERMATT employee options must honor active branch.");
includes(zermattOps, "assertEmployeeInActiveBranch", "ZERMATT employee-specific operations must enforce active branch.");

console.log("PASS: Global Super User Branch Context acceptance checks.");
