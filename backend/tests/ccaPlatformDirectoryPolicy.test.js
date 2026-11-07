"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { derivePlatformContext, isAuthorized } = require("../src/cca/platformDirectoryPolicy");
const { PERMISSIONS } = require("../src/cca/controlPlanePolicy");

const principal = { id: "cca-p1", active: true };
const sessionResult = { accepted: true, platformPrincipalId: "cca-p1", sessionId: "session-1" };
const base = { sessionResult, principal };
const a = { assignmentId: "a1", principalId: "cca-p1", active: true, scope: "PLATFORM", role: "SERVICE_AGENT" };
const b = { assignmentId: "a2", principalId: "cca-p1", active: true, scope: "TENANT", role: "SERVICE_AGENT", tenantId: "tenant-A" };

test("platform role plus assigned tenant restricts support cases", () => {
  const context = derivePlatformContext({ ...base, assignments: [a, b] });
  assert.equal(context.accepted, true);
  assert.equal(isAuthorized(context, PERMISSIONS.TICKETS_READ, "tenant-A"), true);
  assert.equal(isAuthorized(context, PERMISSIONS.TICKETS_READ, "tenant-B"), false);
  assert.equal(isAuthorized(context, PERMISSIONS.BILLING_MANAGE), false);
  assert.equal(context.platformGrants.includes("*"), false);
});

test("tenant role alone cannot create platform privileges", () => {
  const context = derivePlatformContext({ ...base, assignments: [b] });
  assert.equal(context.accepted, false);
  assert.equal(isAuthorized(context, PERMISSIONS.TICKETS_READ, "tenant-A"), false);
});

test("rejects forged or revoked platform session and directory user", () => {
  for (const params of [
    { ...base, sessionResult: { ...sessionResult, accepted: false }, assignments: [a, b] },
    { ...base, sessionResult: { ...sessionResult, platformPrincipalId: "other" }, assignments: [a, b] },
    { ...base, principal: { ...principal, active: false }, assignments: [a, b] },
    { ...base, assignments: null },
  ]) assert.equal(derivePlatformContext(params).accepted, false);
});

test("inactive, foreign, or unknown role assignments grant nothing", () => {
  const assignments = [
    { ...a, active: false },
    { ...a, principalId: "someone-else" },
    { ...a, role: "SUPERUSER" },
    { ...b, role: "SUPERUSER" },
  ];
  assert.equal(derivePlatformContext({ ...base, assignments }).accepted, false);
});

test("separation of duties: billing and service roles do not imply approval privilege", () => {
  const billing = { ...a, role: "BILLING_OFFICER" };
  const context = derivePlatformContext({ ...base, assignments: [billing] });
  assert.equal(isAuthorized(context, PERMISSIONS.BILLING_READ), true);
  assert.equal(isAuthorized(context, PERMISSIONS.TICKETS_MANAGE), false);
  assert.equal(isAuthorized(context, PERMISSIONS.APPROVALS_GRANT), false);
});
