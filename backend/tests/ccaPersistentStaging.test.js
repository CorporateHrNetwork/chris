"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { openStaging, ACCOUNT } = require("../../tools/cca-local-demo/runStaging");
const { otpAt } = require("../../tools/cca-local-demo/localIdentityLab");

const master = Buffer.alloc(32, 28);
const secret = Buffer.from("12345678901234567890");
const password = "Local synthetic staging test only";
const now = 1800000030;

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cca-staging-host-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const folder of ["host-security", "state"]) fs.mkdirSync(path.join(directory, folder));
  const options = { directory, master, clock: () => now };
  const setup = openStaging({ ...options, initialize: true });
  try { setup.enroll(password, secret); }
  finally { setup.release(); }
  return options;
}

async function withServer(options, callback) {
  const { server, release } = openStaging(options);
  try {
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const origin = "http://127.0.0.1:" + server.address().port;
    const post = (route, body, headers = {}) => fetch(origin + "/api/" + route, {
      method: "POST", headers: { Origin: origin, "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    await callback(post, origin);
  } finally {
    await new Promise(resolve => server.close(resolve));
    release();
  }
}

test("staging persists both socket budgets through restart and disregards spoofed source headers", async t => {
  const options = fixture(t);
  await withServer(options, async post => {
    for (let i = 0; i < 10; i++) {
      assert.equal((await post("password", { account: "unknown", password },
        { "X-Forwarded-For": "192.0.2." + i })).status, 401);
      assert.equal((await post("mfa", { challenge: "bogus", code: "000000" })).status, 401);
    }
  });
  await withServer(options, async post => {
    for (const route of ["password", "mfa"]) {
      const response = await post(route, {});
      assert.equal(response.status, 429);
      assert.equal(response.headers.get("retry-after"), "300");
    }
  });
});

test("staging rejects wrong key, second writer and valid audit suffix rollback", async t => {
  const options = fixture(t);
  const ledger = path.join(options.directory, "state", "auth-audit.log");
  const earlier = fs.readFileSync(ledger);
  assert.throws(() => openStaging({ ...options, master: Buffer.alloc(32, 29) }), /CHECKPOINT_MISMATCH/);
  let cookie;
  await withServer(options, async (post, origin) => {
    assert.throws(() => openStaging(options), { code: "EEXIST" });
    assert.match(await (await fetch(origin)).text(), /CCA Staging Sign-in/);
    const first = await post("password", { account: ACCOUNT, password });
    const second = await post("mfa", { challenge: (await first.json()).challenge,
      code: otpAt(secret, Math.floor(now / 30)) });
    assert.equal(second.status, 200);
    cookie = second.headers.get("set-cookie").split(";")[0];
    assert.match(cookie, /^cca_staging_sid=/);
    const headers = { Cookie: cookie };
    assert.deepEqual((await (await fetch(origin + "/api/access", { headers })).json()).modules, ["support"]);
    assert.equal((await fetch(origin + "/api/workspace?module=billing", { headers })).status, 403);
  });
  await withServer(options, async (_post, origin) => {
    assert.equal((await fetch(origin + "/api/access", { headers: { Cookie: cookie } })).status, 401);
    fs.writeFileSync(ledger, earlier);
    assert.equal((await fetch(origin + "/api/access")).status, 503);
  });
  assert.throws(() => openStaging(options), /CHECKPOINT_MISMATCH/);
});

test("staging refuses a missing checkpoint and interrupted vault recovery", async t => {
  const options = fixture(t);
  const checkpoint = path.join(options.directory, "host-security", "state-checkpoint.json");
  const original = fs.readFileSync(checkpoint);
  fs.rmSync(checkpoint);
  assert.throws(() => openStaging(options), /CHECKPOINT_MISMATCH/);
  fs.writeFileSync(checkpoint, original);
  fs.writeFileSync(path.join(options.directory, "state", "cca-recovery-review-required"), "review pending");
  assert.throws(() => openStaging(options), /CHECKPOINT_MISMATCH/);
});
