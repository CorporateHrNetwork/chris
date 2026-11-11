"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { createLocalIdentityLab, otpAt } = require("../../tools/cca-local-demo/localIdentityLab");
const { PERMISSIONS } = require("../src/cca/controlPlanePolicy");
const secret = Buffer.from("12345678901234567890", "ascii");
const fixed = 1800000030;
function labWithUsers(now = fixed) {
  const lab = createLocalIdentityLab({ clock: () => now });
  lab.enroll({ id: "cca-demo-support", password: "StrongExamplePassword!934", secret,
    role: "SERVICE_AGENT", tenantIds: ["demo-cedar"] });
  lab.enroll({ id: "cca-demo-approver", password: "AnotherLongPassword!931", secret: crypto.randomBytes(20),
    role: "PLATFORM_APPROVER", tenantIds: ["demo-cedar"] });
  return lab;
}
function signIn(lab, id = "cca-demo-support", password = "StrongExamplePassword!934", totpSecret = secret) {
  const first = lab.loginPassword({ id, password });
  assert.equal(first.ok, true);
  const result = lab.loginOtp({ challenge: first.challenge, code: otpAt(totpSecret, Math.floor(fixed / 30)) });
  assert.equal(result.ok, true);
  return result.token;
}
test("RFC 6238 six-digit TOTP deterministic vectors with SHA-1 truncation", () => {
  // 59 seconds: RFC 6238 SHA-1 vector has 8-digit value 94287082 => 287082 for six digits.
  assert.equal(otpAt(secret, 1), "287082");
});
test("requires separate password and one-time-code factors, rejects challenge replay", () => {
  const lab = labWithUsers();
  assert.equal(lab.loginPassword({ id: "cca-demo-support", password: "incorrect" }).ok, false);
  const passwordStage = lab.loginPassword({ id: "cca-demo-support", password: "StrongExamplePassword!934" });
  assert.equal(passwordStage.ok, true);
  assert.equal(lab.resolveSession(passwordStage.challenge).accepted, false);
  const invalid = lab.loginOtp({ challenge: passwordStage.challenge, code: "000000" });
  assert.equal(invalid.ok, false);
  assert.equal(lab.loginOtp({ challenge: passwordStage.challenge, code: otpAt(secret, Math.floor(fixed/30)) }).ok, false);
  const token = signIn(lab);
  assert.equal(lab.resolveSession(token, PERMISSIONS.TICKETS_READ, "demo-cedar").accepted, true);
  assert.equal(lab.loginOtp({ challenge: token, code: otpAt(secret, Math.floor(fixed/30)) }).ok, false);
});
test("enforces role and tenant separation after MFA", () => {
  const lab = labWithUsers();
  const support = signIn(lab);
  assert.equal(lab.resolveSession(support, PERMISSIONS.TICKETS_MANAGE, "demo-cedar").accepted, true);
  assert.equal(lab.resolveSession(support, PERMISSIONS.TICKETS_MANAGE, "demo-atlas").accepted, false);
  assert.equal(lab.resolveSession(support, PERMISSIONS.APPROVALS_GRANT, "demo-cedar").accepted, false);
  assert.equal(lab.resolveSession(support, PERMISSIONS.BILLING_MANAGE).accepted, false);
  assert.equal(lab.resolveSession("a-random-tenant-jwt").accepted, false);
});
test("revocation and disable invalidate live session immediately", () => {
  const lab = labWithUsers();
  const token = signIn(lab);
  assert.equal(lab.revoke(token), true);
  assert.equal(lab.resolveSession(token).accepted, false);
  // A previously used one-time code cannot be re-used by another password challenge.
  const next = lab.loginPassword({ id: "cca-demo-support", password: "StrongExamplePassword!934" });
  assert.equal(lab.loginOtp({ challenge: next.challenge, code: otpAt(secret, Math.floor(fixed/30)) }).ok, false);
  assert.equal(lab.disable("cca-demo-support"), true);
  assert.equal(lab.loginPassword({ id: "cca-demo-support", password: "StrongExamplePassword!934" }).ok, false);
});
test("rate limits repeated incorrect passwords and never grants access", () => {
  let now = fixed;
  const lab = createLocalIdentityLab({ clock: () => now });
  lab.enroll({ id: "cca-demo-agent", password: "LongSecurePassphrase#445", secret,
    role: "SERVICE_AGENT", tenantIds: ["demo-cedar"] });
  for (let i=0; i<5; i++) assert.equal(lab.loginPassword({ id:"cca-demo-agent", password:"bad" }).ok, false);
  assert.equal(lab.loginPassword({ id:"cca-demo-agent", password:"LongSecurePassphrase#445" }).ok, false);
  now += 301;
  assert.equal(lab.loginPassword({ id:"cca-demo-agent", password:"LongSecurePassphrase#445" }).ok, true);
});
test("expired one-time challenge and session fail closed", () => {
  let now = fixed;
  const lab = createLocalIdentityLab({ clock: () => now });
  lab.enroll({ id: "cca-demo-operator", password: "LongSecurePassphrase#445", secret,
    role: "SERVICE_AGENT", tenantIds: ["demo-cedar"] });
  const challenge = lab.loginPassword({ id:"cca-demo-operator", password:"LongSecurePassphrase#445" }).challenge;
  now += 122;
  assert.equal(lab.loginOtp({ challenge, code: otpAt(secret, Math.floor(now/30)) }).ok, false);
  const stage = lab.loginPassword({ id:"cca-demo-operator", password:"LongSecurePassphrase#445" });
  const session = lab.loginOtp({ challenge: stage.challenge, code: otpAt(secret, Math.floor(now/30)) });
  assert.equal(session.ok, true);
  now += 901;
  assert.equal(lab.resolveSession(session.token).accepted, false);
});
test("credentials and factor secrets are not exposed by authorization result", () => {
  const lab = labWithUsers();
  const token = signIn(lab);
  const ctx = lab.resolveSession(token);
  assert.equal(ctx.accepted, true);
  for (const name of ["secret", "password", "hashed", "token", "salt"]) assert.equal(name in ctx, false);
  assert.equal(ctx.platformScope, "CCA");
});
