"use strict";

// CCA platform authorisation policy. This module has no database, route,
// token, or production side effects. Existing CHRiS tenant permissions MUST NOT
// be passed as CCA grants. Platform grants must come from independently
// verified platform membership/roles (to be implemented in a separate phase).
const PERMISSIONS = Object.freeze({
  TICKETS_READ: "cca.tickets.read",
  TICKETS_MANAGE: "cca.tickets.manage",
  AGENTS_READ: "cca.agents.read",
  AGENTS_EXECUTE: "cca.agents.execute",
  BILLING_READ: "cca.billing.read",
  BILLING_MANAGE: "cca.billing.manage",
  LIFECYCLE_READ: "cca.lifecycle.read",
  LIFECYCLE_MANAGE: "cca.lifecycle.manage",
  RELEASE_READ: "cca.releases.read",
  RELEASE_MANAGE: "cca.releases.manage",
  APPROVALS_GRANT: "cca.approvals.grant",
  AUDIT_READ: "cca.audit.read",
});
const ROLES = Object.freeze({
  SERVICE_AGENT: Object.freeze([PERMISSIONS.TICKETS_READ, PERMISSIONS.TICKETS_MANAGE]),
  AI_OPERATOR: Object.freeze([PERMISSIONS.TICKETS_READ, PERMISSIONS.AGENTS_READ, PERMISSIONS.AGENTS_EXECUTE]),
  BILLING_OFFICER: Object.freeze([PERMISSIONS.BILLING_READ, PERMISSIONS.BILLING_MANAGE, PERMISSIONS.LIFECYCLE_READ]),
  CLIENT_LIFECYCLE_MANAGER: Object.freeze([PERMISSIONS.LIFECYCLE_READ, PERMISSIONS.LIFECYCLE_MANAGE, PERMISSIONS.BILLING_READ]),
  RELEASE_MANAGER: Object.freeze([PERMISSIONS.RELEASE_READ, PERMISSIONS.RELEASE_MANAGE]),
  AUDITOR: Object.freeze([PERMISSIONS.TICKETS_READ, PERMISSIONS.BILLING_READ, PERMISSIONS.LIFECYCLE_READ, PERMISSIONS.RELEASE_READ, PERMISSIONS.AUDIT_READ]),
  PLATFORM_APPROVER: Object.freeze([PERMISSIONS.APPROVALS_GRANT, PERMISSIONS.AUDIT_READ]),
});
const SENSITIVE_ACTIONS = Object.freeze(new Set([
  "TENANT_SUSPEND", "TENANT_REACTIVATE", "SUBSCRIPTION_ACTIVATE",
  "SUBSCRIPTION_RENEW", "PRODUCTION_DEPLOY", "PRODUCTION_ROLLBACK",
  "TENANT_DATA_CHANGE", "ACCESS_PRIVILEGE_CHANGE", "PAYROLL_CHANGE",
]));

function grantsForRoles(roles) {
  if (!Array.isArray(roles)) return [];
  return [...new Set(roles.flatMap((role) => typeof role === "string" && Object.hasOwn(ROLES, role) ? ROLES[role] : []))];
}

// Fail closed. Passing a CHRiS org-scoped session (even corporatehr-network)
// does NOT make it a CCA session. A genuine separate platform identity is
// required before any future route may use this policy.
function canAccessPlatform(context, permission) {
  return Boolean(
    context && context.platformIdentityVerified === true &&
    context.platformScope === "CCA" &&
    Object.values(PERMISSIONS).includes(permission) &&
    Array.isArray(context.platformGrants) &&
    context.platformGrants.includes(permission)
  );
}

function canAccessTenantCase(context, permission, tenantId) {
  if (!canAccessPlatform(context, permission)) return false;
  if (typeof tenantId !== "string" || !tenantId.trim()) return false;
  const scoped = context.tenantGrants;
  return Boolean(scoped && Object.hasOwn(scoped, tenantId) &&
    Array.isArray(scoped[tenantId]) && scoped[tenantId].includes(permission));
}

function requiresHumanApproval(action) {
  // Unknown mutations default to approval-required; no implicit AI authority.
  if (typeof action !== "string" || !action.trim()) return true;
  return SENSITIVE_ACTIONS.has(action) || !action.startsWith("READ_");
}

module.exports = {
  PERMISSIONS, ROLES, SENSITIVE_ACTIONS, grantsForRoles,
  canAccessPlatform, canAccessTenantCase, requiresHumanApproval,
};
