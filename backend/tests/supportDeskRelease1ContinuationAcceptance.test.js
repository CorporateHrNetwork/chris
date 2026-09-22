const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.resolve(root, relativePath), "utf8");

test("platform Support Desk permissions are provisioned only through Corporate Resources Network controls", () => {
  const migration = read("backend/prisma/migrations/20260915141000_provision_platform_support_access/migration.sql");
  const auth = read("backend/src/middleware/authMiddleware.js");
  const roles = read("backend/src/routes/roleRoutes.js");

  for (const permission of [
    "support.internal.view",
    "support.internal.manage",
    "support.engineering.escalate",
  ]) {
    assert.ok(migration.includes(permission), `missing platform Support permission: ${permission}`);
  }
  assert.ok(migration.includes("corporatehr-network"));
  assert.ok(migration.includes("CHRiS Platform Support"));
  assert.ok(migration.includes("Administrator"));
  assert.equal(migration.includes("zermatt-liquor-limited"), false, "client tenant must not receive platform Support grants");

  assert.ok(auth.includes('PLATFORM_ORGANIZATION_SLUG = "corporatehr-network"'));
  assert.ok(auth.includes("PLATFORM_PERMISSION_FORBIDDEN"));
  assert.ok(auth.includes('"support.internal."'));
  assert.ok(auth.includes('"support.engineering."'));

  assert.ok(roles.includes("TENANT_RESTRICTED_PERMISSION_PREFIXES"));
  assert.ok(roles.includes('"support.internal."'));
  assert.ok(roles.includes('"support.engineering."'));
});

test("client Support workspace exposes conversation, validation, reopen and cancellation controls", () => {
  const ui = read("src/pages/MySupportRequests.jsx");

  for (const expected of [
    "View Case",
    "/messages",
    "/validate",
    "/reopen",
    "Confirm Resolution",
    "Reopen Case",
    "Cancel",
    "CASE CONVERSATION",
  ]) {
    assert.ok(ui.includes(expected), `client Support workspace control missing: ${expected}`);
  }
});

test("internal Support workspace handles cross-client case communication and engineering escalation", () => {
  const ui = read("src/pages/SupportDesk.jsx");

  for (const expected of [
    "Open Case",
    "Client-visible response",
    "Internal note only",
    "resolutionSummary",
    "Save Resolution Summary",
    "Escalate to Engineering",
    "/api/support-desk/internal/tickets/",
  ]) {
    assert.ok(ui.includes(expected), `internal Support workspace control missing: ${expected}`);
  }
});

test("closed/cancelled client cases cannot receive stale direct-API messages", () => {
  const guard = read("backend/src/routes/supportDeskClientLifecycleGuardRoutes.js");
  const app = read("backend/src/app.js");

  assert.ok(guard.includes('["CANCELLED", "CLOSED", "RESOLVED"]'));
  assert.ok(guard.includes("SUPPORT_CASE_MESSAGE_BLOCKED"));
  assert.ok(guard.includes("ticket.requesterUserId !== req.auth.userId"));

  const cancellationMount = app.indexOf('app.use("/api/support-desk", supportDeskCancellationRoutes)');
  const guardMount = app.indexOf('app.use("/api/support-desk", supportDeskClientLifecycleGuardRoutes)');
  const mainMount = app.indexOf('app.use("/api/support-desk", supportDeskRoutes)');
  assert.ok(cancellationMount >= 0 && guardMount > cancellationMount && mainMount > guardMount,
    "Support lifecycle guards must be mounted before the main Support Desk writer");
});

console.log("PASS: Support Desk Release 1 continuation acceptance gate passed.");
