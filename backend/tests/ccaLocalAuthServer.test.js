"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createLocalIdentityLab, otpAt } = require("../../tools/cca-local-demo/localIdentityLab");
const { createAuthServer, createDemoAuth, HOST, ACCOUNT } = require("../../tools/cca-local-demo/localAuthServer");
const secret = Buffer.from("12345678901234567890");
const now = 1800000030;
function fixture() {
  const lab = createLocalIdentityLab({ clock: () => now });
  const auth = createDemoAuth({ lab, password: "Stage4B-Long-Demo-Password!42", secret });
  return { lab, auth };
}
async function withServer(callback) {
  const { auth } = fixture();
  const server = createAuthServer(auth);
  await new Promise(resolve => server.listen(0, HOST, resolve));
  const root = "http://" + HOST + ":" + server.address().port;
  try { await callback(root); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
const post = async (root, route, data, options = {}) =>
  fetch(root + route, { method: "POST", headers: {
    Origin: root, "Content-Type": "application/json", ...(options.headers || {})
  }, body: JSON.stringify(data) });

test("local admin MFA requires password then current one-time code before data access", async () => {
  await withServer(async root => {
    const page = await fetch(root);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Fictional local prototype only/);
    assert.equal((await fetch(root + "/admin-login.js")).status, 200);
    assert.equal((await fetch(root + "/api/whoami")).status, 401);
    assert.equal((await fetch(root + "/api/fictional-cases")).status, 401);
    assert.equal((await post(root, "/api/password", { account: ACCOUNT, password: "wrong" })).status, 401);
    const first = await post(root, "/api/password",
      { account: ACCOUNT, password: "Stage4B-Long-Demo-Password!42" });
    assert.equal(first.status, 200);
    const stage = await first.json();
    assert.ok(stage.challenge);
    assert.equal((await fetch(root + "/api/whoami")).status, 401);
    const otp = otpAt(secret, Math.floor(now / 30));
    const second = await post(root, "/api/mfa", { challenge: stage.challenge, code: otp });
    assert.equal(second.status, 200);
    const cookie = second.headers.get("set-cookie");
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
    const authorized = await fetch(root + "/api/whoami", { headers: { Cookie: cookie.split(";")[0] } });
    assert.equal(authorized.status, 200);
    const info = await authorized.json();
    assert.deepEqual(info.assignedTenants, ["demo-cedar"]);
    const cases = await fetch(root + "/api/fictional-cases", { headers: { Cookie: cookie.split(";")[0] } });
    assert.equal(cases.status, 200);
    const payload = await cases.json();
    assert.equal(payload.cases.length, 1);
    assert.equal(payload.cases[0].tenantId, "demo-cedar");
    assert.equal((await post(root, "/api/mfa", { challenge: stage.challenge, code: otp })).status, 401);
    const logout = await post(root, "/api/logout", {}, { headers: { Cookie: cookie.split(";")[0] } });
    assert.equal(logout.status, 200);
    assert.equal((await fetch(root + "/api/whoami", { headers: { Cookie: cookie.split(";")[0] } })).status, 401);
  });
});
test("blocks cross-origin authentication, unsupported content types and unknown routes", async () => {
  await withServer(async root => {
    const badOrigin = await fetch(root + "/api/password", { method: "POST",
      headers: { Origin: "https://attacker.invalid", "Content-Type": "application/json" },
      body: "{}" });
    assert.equal(badOrigin.status, 403);
    const noOrigin = await fetch(root + "/api/password", { method: "POST",
      headers: { "Content-Type": "application/json" }, body: "{}" });
    assert.equal(noOrigin.status, 403);
    const badType = await fetch(root + "/api/password", { method: "POST",
      headers: { Origin: root, "Content-Type": "text/plain" }, body: "{}" });
    assert.equal(badType.status, 415);
    assert.equal((await fetch(root + "/api/production-accounts")).status, 404);
    assert.equal((await fetch(root + "/api/fictional-cases")).status, 401);
  });
});
test("sign-in has no attached CHRiS production account, password or tenant data", () => {
  const { lab, auth } = fixture();
  const first = lab.loginPassword({ id: auth.account, password: "Stage4B-Long-Demo-Password!42" });
  const second = lab.loginOtp({ challenge: first.challenge, code: otpAt(secret, Math.floor(now/30)) });
  assert.equal(second.ok, true);
  const identity = lab.resolveSession(second.token);
  assert.equal(identity.platformScope, "CCA");
  assert.deepEqual(identity.assignedTenantIds, ["demo-cedar"]);
  for(const forbidden of ["password","secret","salt","hashed","token"]) assert.equal(forbidden in identity, false);
});
