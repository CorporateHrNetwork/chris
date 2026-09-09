const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
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

// Global transport: every apiRequest / download automatically carries the branch context.
includes(api, '"X-CHRiS-Location-Id": activeLocationId', "API transport must send the active location header globally.");
includes(api, 'localStorage.getItem("chris_active_location_id")', "Active branch must persist across navigation/reload.");
includes(api, 'window.dispatchEvent(new CustomEvent("chris:location-context-changed"', "Branch context changes must emit an application event.");

// Backend authorization: ALL_LOCATIONS users may select any active tenant location,
// while unauthorized location IDs fail closed.
includes(auth, 'user.locationScope === "ALL_LOCATIONS"', "ALL_LOCATIONS scope must remain the Super User branch authority.");
includes(auth, 'code: "LOCATION_SCOPE_FORBIDDEN"', "Unauthorized branch selection must fail closed.");
includes(auth, 'consolidatedOrganization', "Consolidated organization context must be explicit.");
includes(auth, 'Head Office is a real selectable OrganizationLocation', "Head Office must remain distinct from All Branches consolidated context.");

// Persistent Super User selector.
includes(selector, "ALL BRANCHES · Consolidated", "Selector must expose a consolidated All Branches option.");
includes(selector, 'error?.code === "LOCATION_SCOPE_FORBIDDEN"', "Selector must recover safely from a stale unauthorized stored branch.");
includes(selector, "data-chris-branch-context", "Selector must expose a stable branch-context UI marker.");
includes(topbar, 'import BranchContextSelector from "../../BranchContextSelector"', "Topbar must own the persistent selector.");
includes(topbar, "<BranchContextSelector compact />", "Topbar must render the branch selector on every protected page.");
assert.ok(!layout.includes("BranchContextSelector"), "Branch selector must not be duplicated inside individual page content.");

// Employee directory/profile: branch selection scopes browsing and direct URL access.
includes(employeeProfile, 'router.get(\n  "/",', "Governed employee directory route must run before the legacy organization-wide list.");
includes(employeeProfile, '? { locationId: req.auth.activeLocationId }', "Employee directory must filter to the active branch.");
includes(employeeProfile, 'code: "EMPLOYEE_OUTSIDE_ACTIVE_BRANCH"', "Direct employee profile/update access outside the active branch must be blocked.");

// Line Managers: target employee population is branch-scoped, but hierarchy resolution
// may still return a legitimate cross-location manager above that employee.
includes(lineManagers, '...(req.auth.activeLocationId\n        ? { locationId: req.auth.activeLocationId }', "Line Manager employee selector must honor active branch.");
includes(lineManagers, "activeLocationId = null", "Line Manager employee resolver must accept active branch context.");
includes(lineManagers, "locationContext: locationContext(req)", "Line Manager responses must report their location context.");

// Existing branch-aware operational surfaces must remain wired.
includes(analytics, 'mode: "ALL_BRANCHES_CONSOLIDATED"', "Workforce analytics must distinguish consolidated context from a branch.");
includes(analytics, '...(req.auth.activeLocationId ? { locationId: req.auth.activeLocationId } : {})', "Workforce analytics must honor active branch.");
includes(payrollEmployees, '...(req.auth.activeLocationId ? { locationId: req.auth.activeLocationId } : {})', "Payroll employee selection must honor active branch.");
includes(payrollEmployees, 'mode: "ALL_BRANCHES_CONSOLIDATED"', "Payroll employee selection must label consolidated context correctly.");
includes(zermattOps, '...(req.auth.activeLocationId ? { locationId: req.auth.activeLocationId } : {})', "ZERMATT employee options must honor active branch.");
includes(zermattOps, "assertEmployeeInActiveBranch", "ZERMATT employee-specific operations must enforce the active branch.");

console.log("PASS: Global Super User Branch Context acceptance checks.");
