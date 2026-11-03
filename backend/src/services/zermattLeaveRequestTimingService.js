"use strict";

// Tenant-scoped exception approved for Zermatt: application timing must not
// block a request solely because the requested start date is in the past
// or is fewer than seven days away. All other policy checks remain in force.
const ZERMATT_SLUG = "zermatt-liquor-limited";

function resolveTimingRules(policy, organizationSlug) {
  const requestRules = policy?.requestRules && typeof policy.requestRules === "object" && !Array.isArray(policy.requestRules)
    ? policy.requestRules : {};
  if (organizationSlug === ZERMATT_SLUG) {
    return { backdatedRequestsAllowed: true, minimumNotice: 0 };
  }
  return {
    backdatedRequestsAllowed: requestRules.backdatedRequestsAllowed === true,
    minimumNotice: Number(requestRules.minimumNotice ?? policy?.noticeDays ?? 0),
    emergencyRequestsAllowed: requestRules.emergencyRequestsAllowed === true,
  };
}

async function resolveTimingRulesForTenant(tx, organizationId, policy) {
  const organization = await tx.organization.findUnique({
    where: { id: organizationId },
    select: { slug: true },
  });
  if (!organization) throw new Error("ORGANIZATION_NOT_FOUND");
  return resolveTimingRules(policy, organization.slug);
}

module.exports = { resolveTimingRules, resolveTimingRulesForTenant };
