"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ISSUER, AUDIENCE, TOKEN_TYPE, validatePlatformSession,
} = require("../src/cca/platformSessionPolicy");

const now = 1800000000;
const claims = {
  iss: ISSUER, aud: AUDIENCE, tokenType: TOKEN_TYPE, scope: "CCA",
  sub: "platform-operator-1", sid: "session-1", jti: "token-1",
  iat: now - 100, exp: now + 300, sessionVersion: 3,
};
const principal = {
  id: "platform-operator-1", active: true, sessionVersion: 3,
  session: { id: "session-1", tokenId: "token-1", mfaVerified: true,
    revoked: false, expiresAtSeconds: now + 300 },
};
function check(overrides = {}) {
  return validatePlatformSession({
    verifiedToken: { signatureVerified: true, claims },
    principal, currentTimeSeconds: now, ...overrides,
  });
}

test("reject any unverified signature or decoded tenant JWT", () => {
  assert.equal(validatePlatformSession({ principal, currentTimeSeconds: now }).accepted, false);
  assert.equal(check({ verifiedToken: { signatureVerified: false, claims } }).reason, "SIGNATURE_NOT_VERIFIED");
  assert.equal(check({ verifiedToken: { signatureVerified: true,
    claims: { ...claims, iss: "chris", aud: "chris-tenant", tokenType: "ACCESS" } } }).reason, "WRONG_TOKEN_CONTEXT");
});

test("reject wrong context even with cryptographic verification", () => {
  for (const bad of [{ aud: "chris" }, { iss: "another" }, { tokenType: "ESS" }, { scope: "TENANT" }]) {
    assert.equal(check({ verifiedToken: { signatureVerified: true, claims: { ...claims, ...bad } } }).accepted, false);
  }
});

test("reject expired or future-dated access tokens", () => {
  assert.equal(check({ verifiedToken: { signatureVerified: true,
    claims: { ...claims, exp: now } } }).reason, "INVALID_TOKEN_LIFETIME");
  assert.equal(check({ verifiedToken: { signatureVerified: true,
    claims: { ...claims, iat: now + 2 } } }).reason, "INVALID_TOKEN_LIFETIME");
});

test("reject revoked, unverified MFA, missing or mismatched sessions", () => {
  assert.equal(check({ principal: { ...principal, session: { ...principal.session, revoked: true } } }).accepted, false);
  assert.equal(check({ principal: { ...principal, session: { ...principal.session, mfaVerified: false } } }).accepted, false);
  assert.equal(check({ principal: { ...principal, sessionVersion: 4 } }).accepted, false);
  assert.equal(check({ principal: { ...principal, session: { ...principal.session, id: "other" } } }).accepted, false);
  assert.equal(check({ principal: null }).accepted, false);
});

test("allow a verified CCA session, without handing out grants or tenant data", () => {
  assert.deepEqual(check(), { accepted: true, reason: "CCA_SESSION_VERIFIED",
    platformPrincipalId: "platform-operator-1", sessionId: "session-1" });
});
