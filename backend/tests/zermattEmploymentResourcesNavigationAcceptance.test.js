const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../..");
const read = p => fs.readFileSync(path.join(root, p), "utf8");

test("Zermatt Documents sidebar exposes dedicated Employment Resources navigation", () => {
  const sidebar = read("src/components/layout/Sidebar/Sidebar.jsx");
  assert.ok(sidebar.includes('path:"/documents/employment-resources",zermattOnly:true,resourceOnly:true'));
  assert.ok(sidebar.includes('group.id === "documents"'));
  assert.ok(sidebar.includes('child.resourceOnly && (hasPermission("employees.view") || hasPermission("recruitment.view"))'));
});
test("employment resources is mounted as a real route and not a planned workspace", () => {
  const app = read("src/App.jsx");
  assert.ok(app.includes('lazy(() => import("./pages/documents/ZermattEmploymentResources"))'));
  assert.ok(app.includes('path="/documents/employment-resources" element={<ProtectedLayout><ZermattEmploymentResources />'));
  const resource = read("src/pages/documents/ZermattEmploymentResources.jsx");
  assert.ok(resource.includes("<ZermattOfferLetterComposer />"));
  const api = read("backend/src/routes/zermattOperationsRoutes.js");
  assert.ok(api.includes('router.get("/employment-resources", requireAnyPermission("employees.view", "settings.view", "recruitment.view")'));
});
