"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { generateKeyPairSync, createSign } = require("node:crypto");
const { verifyPlatformToken, authenticatePlatformToken } = require("../src/cca/platformTokenVerifier");

const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
const now = 1800000000;
const claims = {
  iss: "crnetwork-cca", aud: "crnetwork-cca-control-plane",
  tokenType: "CCA_ACCESS", scope: "CCA", sub: "CCA-user-1",
  sid: "session-1", jti: "token-1", sessionVersion: 2,
  iat: now - 20, exp: now + 200,
};
const principal = {
  id: "CCA-user-1", active: true, sessionVersion: 2,
  session: { id: "session-1", tokenId: "token-1", revoked: false,
    mfaVerified: true, expiresAtSeconds: now + 200 },
};
function issue(payload = claims, header = { alg: "RS256", typ: "CCA+JWT" }, key = privateKey) {
  const data = Buffer.from(JSON.stringify(header)).toString("base64url") + "." +
    Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signer = createSign("RSA-SHA256");
  signer.update(data);
  signer.end();
  return data + "." + signer.sign(key).toString("base64url");
}

test("valid pinned-key token requires a verified independent principal", async () => {
  assert.equal(verifyPlatformToken(issue(), publicKey, now)?.signatureVerified, true);
  assert.deepEqual(await authenticatePlatformToken({
    token: issue(), publicKey, nowSeconds: now, loadPrincipal: async () => principal,
  }), { accepted: true, reason: "CCA_SESSION_VERIFIED",
    platformPrincipalId: "CCA-user-1", sessionId: "session-1" });
  assert.equal((await authenticatePlatformToken({
    token: issue(), publicKey, nowSeconds: now, loadPrincipal: async () => null,
  })).accepted, false);
});

test("reject tampering, foreign keys and tenant token contexts", () => {
  const signed = issue();
  assert.equal(verifyPlatformToken(signed, other.publicKey, now), null);
  assert.equal(verifyPlatformToken(issue({ ...claims, aud: "chris-client" }), publicKey, now), null);
  assert.equal(verifyPlatformToken(issue({ ...claims, tokenType: "ESS" }), publicKey, now), null);
  assert.equal(verifyPlatformToken(issue(claims, { alg: "RS256", typ: "CCA+JWT", jku: "https://evil.example/key" }), publicKey, now), null);
  const [h, p, s] = signed.split(".");
  const modified = Buffer.from(JSON.stringify({ ...claims, sub: "another" })).toString("base64url");
  assert.equal(verifyPlatformToken([h, modified, s].join("."), publicKey, now), null);
});

test("reject invalid expiration, oversized tokens and algorithm confusion", () => {
  assert.equal(verifyPlatformToken(issue({ ...claims, exp: now }), publicKey, now), null);
  assert.equal(verifyPlatformToken(issue({ ...claims, exp: now + 2000 }), publicKey, now), null);
  assert.equal(verifyPlatformToken(issue(claims, { alg: "none", typ: "CCA+JWT" }), publicKey, now), null);
  assert.equal(verifyPlatformToken("x".repeat(8193), publicKey, now), null);
  assert.equal(verifyPlatformToken("not-a-jwt", publicKey, now), null);
});

test("fail closed when platform directory is unavailable or MFA session revoked", async () => {
  assert.equal((await authenticatePlatformToken({
    token: issue(), publicKey, nowSeconds: now, loadPrincipal: async () => { throw new Error("database down"); },
  })).accepted, false);
  assert.equal((await authenticatePlatformToken({
    token: issue(), publicKey, nowSeconds: now,
    loadPrincipal: async () => ({ ...principal, session: { ...principal.session, revoked: true } }),
  })).accepted, false);
  assert.equal((await authenticatePlatformToken({
    token: issue(), publicKey, nowSeconds: now,
    loadPrincipal: async () => ({ ...principal, session: { ...principal.session, mfaVerified: false } }),
  })).accepted, false);
});
