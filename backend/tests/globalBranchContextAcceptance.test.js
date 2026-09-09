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
const auth = read("backend/src/middleware/authMiddleware.js");
const employeeProfile = read("backend/src/routes/employeeProfileGovernanceRoutes.js");
const lineManagers = read("backend/src/routes/lineManagerRoutes.js");
const analytics = read("backend/src/routes/analyticsRoutes.js");
const payrollEmployees = read("backend/src/routes/payrollEmployeeOptionRoutes.js");
const zermattOps = read("backend/src/routes/zermattOperationsRoutes.js");
const dashboard = read("src/pages/Dashboard.jsx");
const workforceKpis = read("src/components/dashboard/WorkforceKpis.jsx");
const leaveOperational = read("backend/src/services/leaveOperationalService.js");

// Global transport: every API request/download automatically carries the selected branch.
includes(api, '"X-CHRiS-Location-Id": activeLocationId', "API transport must send the active location header globally.");
includes(api, 'localStorage.getItem("chris_active_location_id")', "Active branch must persist across navigation/reload.");
includes(api, 'window.dispatchEvent(new CustomEvent("chris:location-context-changed"', "Branch context changes must emit an application event.");

// Backend authorization: ALL_LOCATIONS users may select any active tenant branch;
// invalid IDs fail closed. ZERMATT HEAD OFFICE normalizes to consolidated context.
includes(auth, 'user.locationScope === "ALL_LOCATIONS"', "ALL_LOCATIONS scope must remain the Super User branch authority.");
includes(auth, 'code: "LOCATION_SCOPE_FORBIDDEN"', "Unauthorized branch selection must fail closed.");
includes(auth, 'user.organization?.slug === "zermatt-liquor-limited"', "ZERMATT must have explicit Head Office semantics.");
includes(auth, 'String(requestedLocation?.type || "").toUpperCase() === "HEAD_OFFICE"', "Physical Head Office location must normalize to consolidated context.");
includes(auth, 'requestedLocationId = null', "Head Office must resolve to the consolidated company context.");

// Persistent Super User selector: exactly one Head Office consolidated context plus real branches.
includes(selector, '<option value="">HEAD OFFICE</option>', "Selector must expose Head Office as the consolidated option.");
includes(selector, 'String(location?.type || "").toUpperCase() === "BRANCH"', "Selector must list only actual branches after Head Office.");
assert.ok(!selector.includes("ALL BRANCHES · Consolidated"), "A separate All Branches option must not exist for ZERMATT.");
includes(selector, 'error?.code === "LOCATION_SCOPE_FORBIDDEN"', "Selector must recover safely from stale unauthorized branch storage.");
includes(selector, "data-chris-branch-context", "Selector must expose a stable branch-context UI marker.");
includes(topbar, 'import BranchContextSelector from "../../BranchContextSelector"', "Topbar must own the persistent selector.");
includes(topbar, "<BranchContextSelector compact />", "Topbar must render the branch selector on every protected page.");
assert.ok(!layout.includes("BranchContextSelector"), "Branch selector must not be duplicated inside page content.");

// Employee directory/profile: active branch controls browsing and employee-specific routes.
includes(employeeProfile, 'router.get(\n  "/",', "Governed employee directory route must run before the legacy organization-wide list.");
includes(employeeProfile, '? { locationId: req.auth.activeLocationId }', "Employee directory must filter to the active branch.");
includes(employeeProfile, 'router.use("/:employeeNumber"', "Every employee-specific subroute must inherit the active branch guard.");
includes(employeeProfile, 'code: "EMPLOYEE_OUTSIDE_ACTIVE_BRANCH"', "Direct employee access outside the selected branch must be blocked.");

// Line Managers: target employee population is branch-scoped; hierarchy may still resolve a valid cross-location manager.
includes(lineManagers, '...(req.auth.activeLocationId\n        ? { locationId: req.auth.activeLocationId }', "Line Manager employee selector must honor active branch.");
includes(lineManagers, "activeLocationId = null", "Line Manager resolver must accept active branch context.");
includes(lineManagers, "locationContext: locationContext(req)", "Line Manager responses must report location context.");

// Dashboard KPIs must be driven by branch-aware APIs.
includes(dashboard, 'apiRequest("/api/employees")', "Dashboard employee/demographic metrics must use the branch-scoped Employee Directory.");
includes(dashboard, 'apiRequest("/api/analytics/workforce")', "Dashboard attendance and leave metrics must use branch-scoped workforce analytics.");
includes(workforceKpis, 'apiRequest("/api/analytics/workforce")', "Top workforce KPI cards must use branch-scoped workforce analytics.");

// Existing operational surfaces that already support location scope must remain wired.
includes(analytics, '...(req.auth.activeLocationId ? { locationId: req.auth.activeLocationId } : {})', "Workforce analytics must honor active branch.");
includes(payrollEmployees, '...(req.auth.activeLocationId ? { locationId: req.auth.activeLocationId } : {})', "Payroll employee selection must honor active branch.");
includes(zermattOps, '...(req.auth.activeLocationId ? { locationId: req.auth.activeLocationId } : {})', "ZERMATT employee options must honor active branch.");
includes(zermattOps, "assertEmployeeInActiveBranch", "ZERMATT employee-specific operations must enforce active branch.");
includes(leaveOperational, "locationId = null", "Leave operational services must expose a location scope parameter.");
includes(leaveOperational, "requestLocationWhere(locationId)", "Leave operational request metrics must support branch scoping.");

console.log("PASS: Global Super User Branch Context acceptance checks.");
