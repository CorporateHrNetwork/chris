const crypto = require("crypto");

const STATUSES = ["WATCH","DRAFT","REVIEWED","APPROVED","ACTIVE","SUPERSEDED","RETIRED","REJECTED"];
const TRANSITIONS = {
  WATCH: ["DRAFT", "RETIRED"],
  DRAFT: ["REVIEWED", "REJECTED", "RETIRED"],
  REVIEWED: ["APPROVED", "REJECTED", "DRAFT"],
  APPROVED: ["ACTIVE", "RETIRED"],
  ACTIVE: ["SUPERSEDED", "RETIRED"],
  SUPERSEDED: [],
  RETIRED: [],
  REJECTED: ["DRAFT"],
};

function complianceError(message, statusCode = 400, code = "COMPLIANCE_RULE_ERROR", details) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  error.details = details;
  return error;
}
function text(value) { return String(value ?? "").trim(); }
function optional(value) { return text(value) || null; }
function parseDate(value, label) {
  const date = value instanceof Date ? value : new Date(value);
  if (!value || Number.isNaN(date.getTime())) throw complianceError(`${label} is invalid.`, 400, "INVALID_EFFECTIVE_DATE");
  return date;
}
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.keys(value).sort().reduce((out, key) => {
    out[key] = canonicalize(value[key]);
    return out;
  }, {});
  return value;
}
function hashPayload(value) {
  return crypto.createHash("sha256").update(JSON.stringify(canonicalize(value ?? null))).digest("hex");
}
async function assertTenantUser(tx, organizationId, userId, label) {
  if (!userId) throw complianceError(`${label} is required.`, 400, "COMPLIANCE_ACTOR_REQUIRED");
  const user = await tx.user.findFirst({ where: { id: userId, organizationId, isActive: true }, select: { id: true } });
  if (!user) throw complianceError(`${label} is not an active user in this organization.`, 403, "CROSS_TENANT_COMPLIANCE_ACTOR");
}
async function event(tx, rule, eventType, actorUserId, notes, metadata) {
  return tx.complianceRuleEvent.create({ data: {
    organizationId: rule.organizationId, complianceRuleId: rule.id, eventType,
    actorUserId: actorUserId || null, notes: optional(notes), metadata: metadata || undefined,
  } });
}
async function resolveEffectiveRule(prisma, input) {
  const ruleKey = text(input.ruleKey);
  if (!ruleKey || !input.organizationId) throw complianceError("Organization and rule key are required.");
  const effectiveAt = parseDate(input.effectiveAt || new Date(), "Effective date");
  const rules = await prisma.complianceRule.findMany({
    where: {
      organizationId: input.organizationId, ruleKey, jurisdiction: text(input.jurisdiction) || "NG",
      status: "ACTIVE", effectiveFrom: { lte: effectiveAt },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveAt } }],
    },
    orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }], take: 2,
  });
  if (!rules.length) throw complianceError("No effective compliance rule was found for this date.", 404, "COMPLIANCE_RULE_NOT_FOUND");
  if (rules.length > 1) throw complianceError("Overlapping active compliance rules require resolution.", 409, "OVERLAPPING_ACTIVE_RULES");
  return rules[0];
}
async function publishComplianceRule(prisma, input) {
  const ruleKey = text(input.ruleKey);
  if (!ruleKey) throw complianceError("Rule key is required.");
  const effectiveFrom = parseDate(input.effectiveFrom, "Effective from");
  const effectiveTo = input.effectiveTo ? parseDate(input.effectiveTo, "Effective to") : null;
  if (effectiveTo && effectiveTo < effectiveFrom) throw complianceError("Effective-to date cannot precede effective-from date.", 409, "INVALID_RULE_PERIOD");
  const initialStatus = text(input.status || "DRAFT").toUpperCase();
  if (!["WATCH", "DRAFT"].includes(initialStatus)) {
    throw complianceError("New rules must begin in WATCH or DRAFT.", 409, "UNSAFE_INITIAL_RULE_STATUS");
  }
  return prisma.$transaction(async (tx) => {
    await assertTenantUser(tx, input.organizationId, input.actorUserId, "Creating user");
    const jurisdiction = text(input.jurisdiction) || "NG";
    const latest = await tx.complianceRule.findFirst({
      where: { organizationId: input.organizationId, ruleKey, jurisdiction },
      orderBy: { version: "desc" },
    });
    const payload = input.payload && typeof input.payload === "object" ? input.payload : {};
    const record = await tx.complianceRule.create({ data: {
      organizationId: input.organizationId, ruleKey, name: text(input.name) || ruleKey,
      category: text(input.category) || "STATUTORY", jurisdiction, version: (latest?.version || 0) + 1,
      status: initialStatus, effectiveFrom, effectiveTo, legalAuthority: optional(input.legalAuthority),
      sourceReference: optional(input.sourceReference), payload, payloadHash: hashPayload(payload),
      createdByUserId: input.actorUserId,
    } });
    await event(tx, record, "RULE_CREATED", input.actorUserId, input.notes, { version: record.version, payloadHash: record.payloadHash });
    return record;
  }, { isolationLevel: "Serializable" });
}
async function transitionComplianceRule(prisma, input) {
  const target = text(input.targetStatus).toUpperCase();
  if (!STATUSES.includes(target)) throw complianceError("Invalid compliance rule status.", 400, "INVALID_RULE_STATUS");
  return prisma.$transaction(async (tx) => {
    await assertTenantUser(tx, input.organizationId, input.actorUserId, "Acting user");
    const rule = await tx.complianceRule.findFirst({ where: { id: input.ruleId, organizationId: input.organizationId } });
    if (!rule) throw complianceError("Compliance rule not found.", 404, "COMPLIANCE_RULE_NOT_FOUND");
    if (!(TRANSITIONS[rule.status] || []).includes(target)) {
      throw complianceError(`Rule cannot move from ${rule.status} to ${target}.`, 409, "INVALID_RULE_TRANSITION");
    }
    if (["REVIEWED","APPROVED","ACTIVE","REJECTED","RETIRED"].includes(target) && !optional(input.notes)) {
      throw complianceError("Transition notes are required.", 400, "RULE_TRANSITION_NOTES_REQUIRED");
    }
    if (target === "ACTIVE") {
      if (!rule.legalAuthority || !rule.sourceReference || !rule.approvedByUserId) {
        throw complianceError("Legal authority, source reference and independent approval are required before activation.", 409, "RULE_ACTIVATION_EVIDENCE_INCOMPLETE");
      }
      if (rule.approvedByUserId === input.actorUserId || rule.createdByUserId === input.actorUserId) {
        throw complianceError("Activation requires separation of creator, approver and activator.", 409, "RULE_MAKER_CHECKER_REQUIRED");
      }
      const overlap = await tx.complianceRule.findFirst({ where: {
        organizationId: rule.organizationId, ruleKey: rule.ruleKey, jurisdiction: rule.jurisdiction, status: "ACTIVE", id: { not: rule.id },
        effectiveFrom: { lte: rule.effectiveTo || new Date("9999-12-31T00:00:00.000Z") },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: rule.effectiveFrom } }],
      } });
      if (overlap) {
        if (rule.effectiveFrom <= overlap.effectiveFrom) {
          throw complianceError("The new rule must start after the currently active rule. Retire or correct the conflicting version first.", 409, "INVALID_RULE_SUPERSESSION_DATE");
        }
        await tx.complianceRule.update({ where: { id: overlap.id }, data: {
          status: "SUPERSEDED", effectiveTo: new Date(rule.effectiveFrom.getTime() - 1),
        } });
        await event(tx, overlap, "RULE_SUPERSEDED", input.actorUserId, input.notes, { supersededByRuleId: rule.id });
      }
    }
    const data = { status: target };
    if (target === "REVIEWED") Object.assign(data, { reviewedByUserId: input.actorUserId, reviewedAt: new Date() });
    if (target === "APPROVED") {
      if (rule.createdByUserId === input.actorUserId) throw complianceError("Rule creator cannot approve the same rule.", 409, "RULE_MAKER_CHECKER_REQUIRED");
      Object.assign(data, { approvedByUserId: input.actorUserId, approvedAt: new Date() });
    }
    if (target === "ACTIVE") data.activatedAt = new Date();
    const updated = await tx.complianceRule.update({ where: { id: rule.id }, data });
    await event(tx, updated, `RULE_${target}`, input.actorUserId, input.notes, { previousStatus: rule.status, newStatus: target });
    return updated;
  }, { isolationLevel: "Serializable" });
}

module.exports = { resolveEffectiveRule, publishComplianceRule, transitionComplianceRule, hashPayload, canonicalize };
