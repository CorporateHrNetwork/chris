"use strict";

// Standalone CCA RS256 verification. No CHRiS tenant secret, route or DB access.
// Only the platform infrastructure may supply a pinned CCA public key.
const { createVerify } = require("node:crypto");
const { ISSUER, AUDIENCE, TOKEN_TYPE, validatePlatformSession } = require("./platformSessionPolicy");

const MAX_TOKEN_LENGTH = 8192;
const MAX_SEGMENT_LENGTH = 4096;
const B64URL = /^[A-Za-z0-9_-]+$/;

function decodeSegment(value) {
  if (!value || value.length > MAX_SEGMENT_LENGTH || !B64URL.test(value)) return null;
  const buffer = Buffer.from(value, "base64url");
  if (!buffer.length || buffer.toString("base64url") !== value) return null;
  try {
    const result = JSON.parse(buffer.toString("utf8"));
    if (!result || typeof result !== "object" || Array.isArray(result)) return null;
    return result;
  } catch {
    return null;
  }
}

function verifyPlatformToken(token, publicKey, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (typeof token !== "string" || token.length > MAX_TOKEN_LENGTH ||
      !publicKey || !Number.isSafeInteger(nowSeconds)) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeSegment(encodedHeader);
  const claims = decodeSegment(encodedPayload);
  if (!header || !claims || !encodedSignature ||
      encodedSignature.length > MAX_SEGMENT_LENGTH ||
      !B64URL.test(encodedSignature)) return null;

  // Explicitly forbid alternate algorithms, untrusted key URLs and key ids.
  if (header.alg !== "RS256" || header.typ !== "CCA+JWT" ||
      Object.keys(header).some((key) => !["alg", "typ"].includes(key))) return null;
  if (claims.iss !== ISSUER || claims.aud !== AUDIENCE ||
      claims.tokenType !== TOKEN_TYPE || claims.scope !== "CCA") return null;
  if (!Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp) ||
      claims.iat > nowSeconds || claims.exp <= nowSeconds ||
      claims.exp <= claims.iat || claims.exp - claims.iat > 900) return null;

  try {
    const signature = Buffer.from(encodedSignature, "base64url");
    if (!signature.length || signature.toString("base64url") !== encodedSignature) return null;
    const verifier = createVerify("RSA-SHA256");
    verifier.update(encodedHeader + "." + encodedPayload, "ascii");
    verifier.end();
    if (!verifier.verify(publicKey, signature)) return null;
    // All grants still require an independently loaded CCA principal/session.
    return Object.freeze({ signatureVerified: true, claims: Object.freeze(claims) });
  } catch {
    return null;
  }
}

async function authenticatePlatformToken({ token, publicKey, loadPrincipal, nowSeconds } = {}) {
  const now = Number.isSafeInteger(nowSeconds) ? nowSeconds : Math.floor(Date.now() / 1000);
  const verifiedToken = verifyPlatformToken(token, publicKey, now);
  if (!verifiedToken || typeof loadPrincipal !== "function") {
    return { accepted: false, reason: "CCA_TOKEN_REJECTED" };
  }
  try {
    const principal = await loadPrincipal(verifiedToken.claims.sub);
    return validatePlatformSession({ verifiedToken, principal, currentTimeSeconds: now });
  } catch {
    // Hide whether a principal exists; no fallback to tenant login.
    return { accepted: false, reason: "PLATFORM_DIRECTORY_UNAVAILABLE" };
  }
}

module.exports = { verifyPlatformToken, authenticatePlatformToken };
