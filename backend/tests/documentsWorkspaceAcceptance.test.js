const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { expiryState, DEFAULT_CATEGORIES } = require("../src/services/documentControlService");

const root = path.resolve(__dirname, "..", "..");
const read = (file) => fs.readFileSync(path.resolve(root, file), "utf8");

test("document expiry state distinguishes expired and upcoming records", () => {
  const now = new Date("2026-09-17T00:00:00Z");
  assert.equal(expiryState({ expiryDate: "2026-09-16T00:00:00Z" }, now), "EXPIRED");
  assert.equal(expiryState({ expiryDate: "2026-10-01T00:00:00Z" }, now), "DUE_30_DAYS");
  assert.equal(expiryState({ expiryDate: "2026-11-01T00:00:00Z" }, now), "DUE_90_DAYS");
  assert.equal(expiryState({ expiryDate: null }, now), "NO_EXPIRY");
  assert.ok(DEFAULT_CATEGORIES.includes("Operational SOP"));
});

test("Documents module exposes all requested connected child workspaces", () => {
  const workspace = read("src/pages/documents/DocumentsWorkspace.jsx");
  const dashboard = read("src/components/dashboard/ModuleDashboard.jsx");
  const app = read("backend/src/app.js");
  const routes = read("backend/src/routes/documentRoutes.js");

  for (const label of ["Employee Documents", "HR Documents", "Company Policies", "Templates", "Document Categories", "Expiry Tracking", "Document Requests"]) {
    assert.ok(workspace.includes(label), `${label} is missing from Documents workspace`);
  }
  assert.ok(workspace.includes("Employment Resources & SOPs"));
  assert.ok(dashboard.includes("<DocumentsWorkspace />"));
  assert.ok(app.includes('app.use("/api/documents", documentRoutes)'));
  assert.ok(routes.includes('router.get("/overview"'));
  assert.ok(routes.includes('router.post("/records"'));
  assert.ok(routes.includes('router.post("/requests"'));
  assert.ok(routes.includes('router.put("/requests/:requestId/status"'));
});

console.log("PASS: connected Documents module acceptance gate passed.");
