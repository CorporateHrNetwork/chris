"use strict";

// Pure platform identity-to-permission mapping; disconnected from routes/DB.
// Inputs MUST be loaded by a trusted server-side CCA directory after signed
// session validation. Never accept roles or tenant IDs from token/request body.
const { grantsForRoles, canAccessPlatform, canAccessTenantCase } = require("./controlPlanePolicy");

function nonempty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function derivePlatformContext({ sessionResult, principal, assignments } = {}) {
  const denied = Object.freeze({ accepted: false, reason: "PLATFORM_DIRECTORY_DENIED" });
  if (!sessionResult || sessionResult.accepted !== true ||
      !nonempty(sessionResult.platformPrincipalId) ||
      !principal || principal.active !== true ||
      principal.id !== sessionResult.platformPrincipalId ||
      !Array.isArray(assignments)) return denied;
  const roles = [];
  const tenantGrants = Object.create(null);
  for (const item of assignments) {
    // Reject malformed/inactive rows; do not silently grant across roles.
    if (!item || item.active !== true || item.principalId !== principal.id ||
        !nonempty(item.role) || !nonempty(item.assignmentId)) continue;
    // CCA directory uses explicit role names; unknown role generates no grants.
    const roleGrants = grantsForRoles([item.role]);
    if (!roleGrants.length) continue;
    // Assignments must be constrained to the platform and its allowed scope.
    if (item.scope === "PLATFORM") {
      roles.push(item.role);
    } else if (item.scope === "TENANT" && nonempty(item.tenantId)) {
      const previous = tenantGrants[item.tenantId] || [];
      tenantGrants[item.tenantId] = Object.freeze([...new Set([...previous, ...roleGrants])]);
    }
  }
  const platformGrants = grantsForRoles(roles);
  if (!platformGrants.length) return denied;
  return Object.freeze({
    accepted: true,
    platformIdentityVerified: true,
    platformScope: "CCA",
    principalId: principal.id,
    sessionId: sessionResult.sessionId,
    platformGrants: Object.freeze(platformGrants),
    assignedTenantIds: Object.freeze(Object.keys(tenantGrants)),
    tenantGrants: Object.freeze(tenantGrants),
  });
}

function isAuthorized(context, permission, tenantId) {
  if (!context || context.accepted !== true) return false;
  return tenantId === undefined
    ? canAccessPlatform(context, permission)
    : canAccessTenantCase(context, permission, tenantId);
}

module.exports = { derivePlatformContext, isAuthorized };
