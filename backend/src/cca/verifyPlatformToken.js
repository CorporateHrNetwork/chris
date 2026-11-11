"use strict";

// CCA-only cryptographic verification. Not wired to an HTTP endpoint.
// Keys must come from a trusted, CCA-exclusive key store. Never reuse
// CHRiS JWT_SECRET, and never take key material or 'verified' flags from users.
const crypto = require("node:crypto");

const B64URL = /^[A-Za-z0-9_-]+$/;
function parseSegment(segment, maxBytes) {
  if (typeof segment !== "string" || !B64URL.test(segment) || segment.length > maxBytes * 2) {
    throw new Error("INVALID_TOKEN_SEGMENT");
  }
  const buffer = Buffer.from(segment, "base64url");
  if (!buffer.length || buffer.length > maxBytes || buffer.toString("base64url") !== segment) {
    throw new Error("INVALID_TOKEN_ENCODING");
  }
  const parsed = JSON.parse(buffer.toString("utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("INVALID_TOKEN_JSON");
  }
  return parsed;
}

function verifyPlatformToken(token, { publicKey, keyId } = {}) {
  // Return no unverified claim data on failure.
  const denied = Object.freeze({ signatureVerified: false, claims: null });
  try {
    if (typeof token !== "string" || token.length > 8192 ||
        !publicKey || typeof keyId !== "string" || !keyId.trim()) return denied;
    const parts = token.split(".");
    if (parts.length !== 3) return denied;
    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const header = parseSegment(encodedHeader, 1024);
    if (header.alg !== "RS256" || header.typ !== "JWT" ||
        header.kid !== keyId || header.crit !== undefined ||
        header.jku !== undefined || header.jwk !== undefined ||
        header.x5u !== undefined || header.x5c !== undefined) return denied;
    const claims = parseSegment(encodedPayload, 4096);
    if (!B64URL.test(encodedSignature) || encodedSignature.length > 1024) return denied;
    const signature = Buffer.from(encodedSignature, "base64url");
    if (!signature.length || signature.toString("base64url") !== encodedSignature) return denied;
    const verified = crypto.verify(
      "RSA-SHA256",
      Buffer.from(encodedHeader + "." + encodedPayload, "ascii"),
      { key: publicKey, padding: crypto.constants.RSA_PKCS1_PADDING },
      signature
    );
    return verified ? { signatureVerified: true, claims } : denied;
  } catch {
    return denied;
  }
}

module.exports = { verifyPlatformToken };
