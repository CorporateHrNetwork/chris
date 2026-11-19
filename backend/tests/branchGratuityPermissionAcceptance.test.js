const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Gratuity permission is independently grantable and not automatically assigned", () => {
  const sql = read("backend/prisma/migrations/20261119163000_branch_gratuity_view_permission/migration.sql");
  assert.ok(sql.includes("benefits.gratuity.view"));
  assert.ok(!sql.includes('"role_permissions"'), "migration must not silently assign role privileges");
});

test("Gratuity API filters register and exports by authorized employee locations", () => {
  const api = read("backend/src/routes/eosbRoutes.js");
  const service = read("backend/src/services/eosbService.js");
  assert.ok(api.includes('router.get("/accounts", requireGratuityView'));
  assert.ok(api.includes('router.get("/accounts/export.csv", requireGratuityView'));
  assert.ok(api.includes('router.get("/accounts/:employeeNumber", requireGratuityView'));
  assert.ok(api.includes("locationIds: gratuityLocationIds(req)"));
  assert.ok(api.includes('locationId: { in: locationIds }'));
  assert.ok(service.includes('locationId: { in: locationIds }'));
  assert.ok(api.includes('code: "EOSB_BRANCH_REQUIRED"'));
});

test("Branch Benefits menu and overview display only explicitly authorized Gratuity", () => {
  const nav = read("src/components/layout/Sidebar/Sidebar.jsx");
  const benefits = read("src/pages/Benefits.jsx");
  const accounts = read("src/pages/benefits/GratuityAccounts.jsx");
  assert.ok(nav.includes('path:"/benefits/gratuity",permission:"benefits.gratuity.view"'));
  assert.ok(benefits.includes('hasPermission("benefits.gratuity.view")'));
  assert.ok(accounts.includes('"chris:location-context-changed"'));
});
