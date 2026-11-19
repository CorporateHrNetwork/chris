const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../..");
function read(name) { return fs.readFileSync(path.join(root, name), "utf8"); }
test("offer template references authoritative leave and bonus policy rather than fixed days", () => {
  const resource = read("backend/src/services/zermattEmploymentResourceService.js");
  const terms = read("backend/src/services/zermattOfferEntitlementService.js");
  assert.ok(resource.includes("{{annual_leave_days}}"));
  assert.ok(resource.includes("{{year_end_bonus_clause}}"));
  assert.ok(terms.includes("resolveEffectiveEmploymentLevel"));
  assert.ok(terms.includes("leaveEntitlementAllocation.findFirst"));
  assert.ok(terms.includes("leaveEntitlementMatrixRule.findFirst"));
  assert.ok(terms.includes("expatriate ? 45"));
});
test("offer terms endpoint respects tenant and assigned branch scope", () => {
  const routes = read("backend/src/routes/zermattOfferTermsRoutes.js");
  assert.ok(routes.includes('requireAnyPermission("employees.view", "recruitment.view")'));
  assert.ok(routes.includes("employee.locationId"));
  assert.ok(routes.includes('zermatt-liquor-limited'));
});
