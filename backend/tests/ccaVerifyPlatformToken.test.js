"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { verifyPlatformToken } = require("../src/cca/verifyPlatformToken");
const { ISSUER, AUDIENCE, TOKEN_TYPE, validatePlatformSession } = require("../src/cca/platformSessionPolicy");

const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const other = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const keyId = "cca-key-1";
const now = 1800000000;
const claims = {
  iss: ISSUER, aud: AUDIENCE, tokenType: TOKEN_TYPE, scope: "CCA",
  sub: "cca-operator-1", sid: "cca-session-1", jti: "cca-token-1",
  iat: now - 60, exp: now + 300, sessionVersion: 1,
};
function signed(header = { alg: "RS256", typ: "JWT", kid: keyId }, payload = claims, key = privateKey) {
  const data = [header, payload].map(x => Buffer.from(JSON.stringify(x)).toString("base64url")).join(".");
  return data + "." + crypto.sign("RSA-SHA256", Buffer.from(data), key).toString("base64url");
}
const opts = { publicKey, keyId };

test("CCA RS256 verifier accepts a correctly signed JWT from its trusted key", () => {
  const verifiedToken = verifyPlatformToken(signed(), opts);
  assert.equal(verifiedToken.signatureVerified, true);
  const principal = {
    id: claims.sub, active: true, sessionVersion: 1,
    session: { id: claims.sid, tokenId: claims.jti, mfaVerified: true,
      revoked: false, expiresAtSeconds: now + 300 },
  };
  assert.equal(validatePlatformSession({ verifiedToken, principal, currentTimeSeconds: now }).accepted, true);
});

test("rejects unsigned tokens, algorithm confusion and malicious key headers", () => {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  assert.equal(verifyPlatformToken(Buffer.from('{"alg":"none"}').toString("base64url") + "." + payload + ".", opts).signatureVerified, false);
  for (const extra of [
    { alg: "HS256", typ: "JWT", kid: keyId },
    { alg: "RS256", typ: "JWT", kid: "untrusted-key" },
    { alg: "RS256", typ: "JWT", kid: keyId, jku: "https://attacker.example/keys" },
    { alg: "RS256", typ: "JWT", kid: keyId, crit: ["unexpected"] },
  ]) assert.equal(verifyPlatformToken(signed(extra), opts).signatureVerified, false);
});

test("rejects wrong signing keys and changed claims", () => {
  assert.equal(verifyPlatformToken(signed(undefined, claims, other.privateKey), opts).signatureVerified, false);
  const token = signed();
  const [header, ,sig] = token.split(".");
  const modified = Buffer.from(JSON.stringify({ ...claims, sub: "someone-else" })).toString("base64url");
  assert.equal(verifyPlatformToken([header, modified, sig].join("."), opts).signatureVerified, false);
});

test("rejects malformed and oversized tokens without exposing claims", () => {
  for (const token of ["", "a.b", "!.a.b", "a.b.c.d", "x".repeat(9000)]) {
    assert.deepEqual(verifyPlatformToken(token, opts), { signatureVerified: false, claims: null });
  }
  assert.equal(verifyPlatformToken(signed(), { publicKey: other.publicKey, keyId }).signatureVerified, false);
});

test("signed ordinary-tenant claim shape still cannot be a CCA session", () => {
  const verifiedToken = verifyPlatformToken(signed(undefined, {
    userId: "tenant-user", organizationId: "org-zermatt", iat: now - 10, exp: now + 100,
  }), opts);
  assert.equal(verifiedToken.signatureVerified, true);
  assert.equal(validatePlatformSession({ verifiedToken, principal: {}, currentTimeSeconds: now }).accepted, false);
});
