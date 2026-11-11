"use strict";

// CCA platform session validation contract (pure; NOT wired to CHRiS routes).
// IMPORTANT: this does not verify JWT signatures. verifiedToken MUST originate
// from a future independent cryptographic verifier using separate issuer,
// audience and key material; never from an HTTP request or decoded JWT alone.
const ISSUER = "crnetwork-cca";
const AUDIENCE = "crnetwork-cca-control-plane";
const TOKEN_TYPE = "CCA_ACCESS";

function validatePlatformSession({ verifiedToken, principal, currentTimeSeconds } = {}) {
  if (!verifiedToken || verifiedToken.signatureVerified !== true) {
    return { accepted: false, reason: "SIGNATURE_NOT_VERIFIED" };
  }
  const claims = verifiedToken.claims;
  if (!claims || typeof claims !== "object" ||
      claims.iss !== ISSUER || claims.aud !== AUDIENCE ||
      claims.tokenType !== TOKEN_TYPE || claims.scope !== "CCA") {
    return { accepted: false, reason: "WRONG_TOKEN_CONTEXT" };
  }
  const now = Number.isFinite(currentTimeSeconds)
    ? currentTimeSeconds : Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp) ||
      claims.iat > now || claims.exp <= now || claims.exp <= claims.iat) {
    return { accepted: false, reason: "INVALID_TOKEN_LIFETIME" };
  }
  if (typeof claims.sub !== "string" || !claims.sub.trim() ||
      typeof claims.sid !== "string" || !claims.sid.trim() ||
      typeof claims.jti !== "string" || !claims.jti.trim()) {
    return { accepted: false, reason: "MISSING_SESSION_IDENTITY" };
  }
  // The principal must be fetched from CCA's independent, trusted user store
  // AFTER signature verification. JWT claims alone must never grant roles.
  if (!principal || principal.id !== claims.sub || principal.active !== true ||
      !Number.isSafeInteger(principal.sessionVersion) ||
      claims.sessionVersion !== principal.sessionVersion) {
    return { accepted: false, reason: "PLATFORM_PRINCIPAL_UNAVAILABLE" };
  }
  // Confirm both factors from a trusted session record; never rely only on a
  // caller-supplied mfa=true claim or a mere tenant user password.
  if (!principal.session || principal.session.id !== claims.sid ||
      principal.session.revoked === true ||
      principal.session.mfaVerified !== true ||
      principal.session.tokenId !== claims.jti ||
      !Number.isSafeInteger(principal.session.expiresAtSeconds) ||
      principal.session.expiresAtSeconds <= now) {
    return { accepted: false, reason: "SESSION_NOT_VERIFIED" };
  }
  return {
    accepted: true,
    reason: "CCA_SESSION_VERIFIED",
    platformPrincipalId: principal.id,
    sessionId: claims.sid,
  };
}

module.exports = { ISSUER, AUDIENCE, TOKEN_TYPE, validatePlatformSession };
