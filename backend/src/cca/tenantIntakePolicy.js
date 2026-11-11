"use strict";

// CCA support intake: pure fail-closed tenant identity and routing policy.
// This is NOT a webhook, API, session verification or database integration.
const CHANNELS = new Set(["CHRIS_PORTAL", "WHATSAPP", "EMAIL"]);
const MAX_BODY = 10000;
const eligible = (v) => typeof v === "string" && v.trim().length > 0;

function resolveIntake({ channel, payload, identity } = {}) {
  const deny = (code) => ({ accepted: false, code });
  if (!CHANNELS.has(channel)) return deny("UNKNOWN_CHANNEL");
  if (!payload || !eligible(payload.description) ||
      payload.description.length > MAX_BODY) return deny("INVALID_REQUEST");
  if (!identity || identity.verified !== true ||
      !eligible(identity.tenantId) || !eligible(identity.subjectId) ||
      identity.channel !== channel) return deny("TENANT_IDENTITY_UNVERIFIED");
  if (identity.revoked === true || identity.tenantActive !== true) {
    return deny("TENANT_IDENTITY_INACTIVE");
  }
  // Portal auth is verified by tenant session service; external channels
  // require verified opt-in and a bound destination identity. Phone or sender
  // alone must NEVER assign tenant ownership.
  if (channel === "WHATSAPP" || channel === "EMAIL") {
    if (identity.consentConfirmed !== true ||
        !eligible(identity.bindingId) ||
        identity.externalSenderVerified !== true) {
      return deny("CHANNEL_BINDING_UNVERIFIED");
    }
  }
  if (!eligible(payload.idempotencyKey)) return deny("IDEMPOTENCY_REQUIRED");
  return {
    accepted: true,
    code: "READY_FOR_AUTHORIZED_TICKET_CREATION",
    tenantId: identity.tenantId,
    requesterSubjectId: identity.subjectId,
    channel,
    idempotencyKey: payload.idempotencyKey,
    description: payload.description.trim(),
  };
}

module.exports = { CHANNELS, resolveIntake };
