"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  PERMISSIONS, grantsForRoles, canAccessPlatform,
  canAccessTenantCase, requiresHumanApproval,
} = require("../src/cca/controlPlanePolicy");

test("ordinary tenant and fictional CorporateHr sessions are not platform sessions", () => {
  for (const slug of ["zermatt-liquor-limited", "corporatehr-network"]) {
    const tenantAuth = {
      organization: { slug }, permissions: ["support.internal.manage", "settings.view"],
      platformGrants: [PERMISSIONS.TICKETS_MANAGE],
    };
    assert.equal(canAccessPlatform(tenantAuth, PERMISSIONS.TICKETS_MANAGE), false);
  }
});

test("unknown role or permission gives no access", () => {
  assert.deepEqual(grantsForRoles(["NON_EXISTENT", "constructor", "__proto__"]), []);
  assert.equal(canAccessPlatform({ platformIdentityVerified: true, platformScope: "CCA", platformGrants: ["*"] }, PERMISSIONS.TICKETS_READ), false);
  assert.equal(canAccessPlatform({ platformIdentityVerified: true, platformScope: "CCA", platformGrants: [PERMISSIONS.TICKETS_READ] }, "cca.unknown"), false);
});

test("verified CCA identity is limited to its explicit grants", () => {
  const c = { platformIdentityVerified: true, platformScope: "CCA", platformGrants: grantsForRoles(["SERVICE_AGENT"]) };
  assert.equal(canAccessPlatform(c, PERMISSIONS.TICKETS_READ), true);
  assert.equal(canAccessPlatform(c, PERMISSIONS.BILLING_MANAGE), false);
  assert.equal(canAccessPlatform({ ...c, platformIdentityVerified: false }, PERMISSIONS.TICKETS_READ), false);
});

test("support access requires specific assigned tenant", () => {
  const c = {
    platformIdentityVerified: true, platformScope: "CCA",
    platformGrants: [PERMISSIONS.TICKETS_READ], tenantGrants: { "tenant-A": [PERMISSIONS.TICKETS_READ] },
  };
  assert.equal(canAccessTenantCase(c, PERMISSIONS.TICKETS_READ, "tenant-A"), true);
  assert.equal(canAccessTenantCase(c, PERMISSIONS.TICKETS_READ, "tenant-B"), false);
  assert.equal(canAccessTenantCase(c, PERMISSIONS.TICKETS_READ, ""), false);
});

test("unknown writes and all sensitive actions require explicit human approval", () => {
  for (const action of ["SUBSCRIPTION_RENEW", "TENANT_SUSPEND", "PRODUCTION_DEPLOY", "PAYROLL_CHANGE", "CUSTOM_WRITE", ""]) {
    assert.equal(requiresHumanApproval(action), true);
  }
  assert.equal(requiresHumanApproval("READ_TICKET_METADATA"), false);
});
