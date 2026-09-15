const crypto = require("crypto");

function complianceError(message, statusCode = 400, code = "COMPLIANCE_RULE_ERROR") {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function normalizeOptional(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function parseDate(value, label) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw complianceError(`${label} is invalid.`, 400, "INVALID_EFFECTIVE_DATE");
  }
  return date;
}

function hashPayload(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex");
}

async function resolveEffectiveRule(prisma, input) {
  const effectiveAt = parseDate(input.effectiveAt || new Date(), "Effective date");
  const rule = await prisma.complianceRule.findFirst({
    where: {
      organizationId: input.organizationId,
      ruleKey: String(input.ruleKey || "").trim(),
      jurisdiction: input.jurisdiction || "NG",
      status: "ACTIVE",
      effectiveFrom: { lte: effectiveAt },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveAt } }],
    },
    orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }],
  });
  if (!rule) {
    throw complianceError("No effective compliance rule was found for this date.", 404, "COMPLIANCE_RULE_NOT_FOUND");
  }
  return rule;
}

async function publishComplianceRule(prisma, input) {
  const ruleKey = String(input.ruleKey || "").trim();
  if (!ruleKey) throw complianceError("Rule key is required.");
  const effectiveFrom = parseDate(input.effectiveFrom, "Effective from");
  const effectiveTo = input.effectiveTo ? parseDate(input.effectiveTo, "Effective to") : null;
  if (effectiveTo && effectiveTo < effectiveFrom) {
    throw complianceError("Effective-to date cannot precede effective-from date.", 409, "INVALID_RULE_PERIOD");
  }

  return prisma.$transaction(async (tx) => {
    const latest = await tx.complianceRule.findFirst({
      where: { organizationId: input.organizationId, ruleKey, jurisdiction: input.jurisdiction || "NG" },
      orderBy: { version: "desc" },
    });
    const version = (latest?.version || 0) + 1;
    const payload = input.payload || {};
    const record = await tx.complianceRule.create({
      data: {
        organizationId: input.organizationId,
        ruleKey,
        name: String(input.name || ruleKey).trim(),
        category: String(input.category || "STATUTORY").trim(),
        jurisdiction: input.jurisdiction || "NG",
        version,
        status: input.status || "ACTIVE",
        effectiveFrom,
        effectiveTo,
        legalAuthority: normalizeOptional(input.legalAuthority),
        sourceReference: normalizeOptional(input.sourceReference),
        payload,
        payloadHash: hashPayload(payload),
        createdByUserId: input.actorUserId || null,
      },
    });
    await tx.complianceRuleEvent.create({
      data: {
        organizationId: input.organizationId,
        complianceRuleId: record.id,
        eventType: "RULE_PUBLISHED",
        actorUserId: input.actorUserId || null,
        notes: normalizeOptional(input.notes),
        metadata: { version, payloadHash: record.payloadHash },
      },
    });
    return record;
  });
}

module.exports = { resolveEffectiveRule, publishComplianceRule, hashPayload };
