"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createCcaPostgresTenantReader } = require("../src/cca/postgresTenantReadAdapter");

const context = {
  platformIdentityVerified: true,
  platformScope: "CCA",
  platformGrants: ["cca.tickets.read"],
  tenantGrants: {"fictional-a": ["cca.tickets.read"]},
};

function poolFixture(rows = []) {
  const calls = [];
  let releases = 0;
  const client = {
    query: async (sql, args) => {
      calls.push({ sql, args });
      if (sql.startsWith("SELECT id, tenant_id")) return { rows };
      return { rows: [] };
    },
    release: () => { releases++; },
  };
  return { pool: { connect: async () => client }, calls, client, released: () => releases };
}

test("valid tenant can read bounded fictional rows in read-only transaction", async () => {
  const f = poolFixture([{ id: "fictional-1", tenant_id: "fictional-a", service_code: "MANAGED_POSTGRESQL", status: "REQUEST_ONLY" }]);
  const reader = createCcaPostgresTenantReader(f.pool);
  const out = await reader.listServiceRequests({ context, tenantId: "fictional-a", limit: 10 });
  assert.deepEqual(out, [{ id: "fictional-1", serviceCode: "MANAGED_POSTGRESQL", status: "REQUEST_ONLY" }]);
  assert.equal(f.calls[0].sql, "BEGIN READ ONLY");
  assert.deepEqual(f.calls[1], { sql: "SELECT set_config('cca.tenant_id', $1, true)", args: ["fictional-a"] });
  assert.deepEqual(f.calls[2].args, ["fictional-a", 10]);
  assert.equal(f.calls[3].sql, "COMMIT");
  assert.equal(f.released(), 1);
});

test("unknown tenant and forged CHRiS identity are rejected before DB connect", async () => {
  let connects = 0;
  const reader = createCcaPostgresTenantReader({connect: async () => {connects++; throw Error("unexpected connection");}});
  for (const c of [
    { context, tenantId: "fictional-b" },
    { context: { ...context, platformIdentityVerified: false }, tenantId: "fictional-a" },
    { context: { ...context, platformScope: "CHRIS" }, tenantId: "fictional-a" },
    { context: null, tenantId: "fictional-a" },
    { context, tenantId: "'; DROP TABLE fictional; --" },
  ]) {
    await assert.rejects(reader.listServiceRequests(c), { code: "CCA_TENANT_DATABASE_READ_DENIED" });
  }
  assert.equal(connects, 0);
});

test("database result cannot leak a second tenant; rolls back and releases connection", async () => {
  const f = poolFixture([{ id: "fictional-other", tenant_id: "fictional-b", service_code: "SSL_TLS_CERTIFICATE", status: "REQUEST_ONLY" }]);
  const reader = createCcaPostgresTenantReader(f.pool);
  await assert.rejects(reader.listServiceRequests({context,tenantId:"fictional-a"}), /CCA_DATABASE_TENANT_SCOPE_VIOLATION/);
  assert.equal(f.calls.at(-1).sql, "ROLLBACK");
  assert.equal(f.released(), 1);
});

test("database errors roll back and release the connection", async () => {
  const f = poolFixture();
  f.client.query = async (sql) => {
    f.calls.push({sql});
    if(sql.startsWith("SELECT id")) throw Error("fictional database unavailable");
    return {};
  };
  const reader = createCcaPostgresTenantReader(f.pool);
  await assert.rejects(reader.listServiceRequests({context,tenantId:"fictional-a"}), /fictional database unavailable/);
  assert.equal(f.calls.at(-1).sql, "ROLLBACK");
  assert.equal(f.released(), 1);
});

test("read-only limits and missing pool are denied", async () => {
  assert.throws(() => createCcaPostgresTenantReader(null), TypeError);
  const f = poolFixture();
  const reader = createCcaPostgresTenantReader(f.pool);
  for (const limit of [0, 101, -1, 1.1, "10", NaN]) {
    await assert.rejects(reader.listServiceRequests({context,tenantId:"fictional-a",limit}), {code:"CCA_INVALID_READ_LIMIT"});
  }
  assert.equal(f.calls.length, 0);
});
