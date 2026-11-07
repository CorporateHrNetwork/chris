"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createServer, createDemoState, HOST } = require("../../tools/cca-local-demo/server");

test("fictional dashboard state contains no real tenant or production data", () => {
  const state = createDemoState().state();
  assert.equal(state.demonstration, true);
  assert.equal(state.cases.length, 2);
  assert.equal(state.tenants.every(t => t.id.startsWith("demo-")), true);
  assert.equal(JSON.stringify(state).includes("zermatt-liquor-limited"), false);
});
test("local demo walks through the full safe synthetic workflow", () => {
  const demo = createDemoState();
  const created = demo.submit("demo-cedar", "Fictional benefits question");
  assert.equal(created.ok, true);
  const id = created.case.id;
  assert.equal(demo.operate({ caseId: id, operation: "TRIAGE" }).case.status, "TRIAGED");
  assert.equal(demo.operate({ caseId: id, operation: "ASSIGN", agentId: "Mock Agent" }).case.status, "ASSIGNED");
  assert.equal(demo.operate({ caseId: id, operation: "RECOMMEND", recommendation: "Review mock records only" }).case.status, "AWAITING_APPROVAL");
  assert.equal(demo.operate({ caseId: id, operation: "APPROVE" }).case.status, "APPROVED");
  assert.equal(demo.operate({ caseId: id, operation: "RESOLVE", resolution: "Fictional guidance provided" }).case.status, "AWAITING_CLIENT_VALIDATION");
  assert.equal(demo.operate({ caseId: id, operation: "CONFIRM" }).case.status, "CLOSED");
  assert.equal(demo.audit(id).events.length, 7);
});
test("unknown organizations and cases cannot be acted on", () => {
  const demo = createDemoState();
  assert.equal(demo.submit("zermatt-liquor-limited", "Do not create a case").ok, false);
  assert.equal(demo.operate({ caseId: "NONEXISTENT", operation: "TRIAGE" }).ok, false);
  assert.equal(demo.audit("NONEXISTENT").ok, false);
});
test("loopback server serves UI and rejects foreign host and origin", async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, HOST, resolve));
  const base = "http://" + HOST + ":" + server.address().port;
  try {
    const page = await fetch(base);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Local-only fictional simulation/);
    const controlCentre = await fetch(base + "/control-centre");
    assert.equal(controlCentre.status, 200);
    const controlHtml = await controlCentre.text();
    assert.match(controlHtml, /Central Agency Control Centre/);
    assert.match(controlHtml, /Offline fictional preview/);
    assert.match(controlHtml, /AI Agent Studio/);
    const controlScript = await fetch(base + "/control-centre.js");
    assert.equal(controlScript.status, 200);
    assert.match(await controlScript.text(), /Static fictional data/);
    const unapprovedRoute = await fetch(base + "/control-centre/private");
    assert.equal(unapprovedRoute.status, 404);
    const state = await (await fetch(base + "/api/state")).json();
    assert.equal(state.demonstration, true);
    const foreignHostStatus = await new Promise((resolve, reject) => {
      const req = http.get({ hostname: HOST, port: server.address().port,
        path: "/api/state", headers: { Host: "example.org" } }, response => {
        response.resume();
        response.on("end", () => resolve(response.statusCode));
      });
      req.on("error", reject);
    });
    assert.equal(foreignHostStatus, 403);
    const foreignOrigin = await fetch(base + "/api/submit", {
      method: "POST", headers: { Origin: "https://attacker.example", "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId: "demo-cedar", description: "test" })
    });
    assert.equal(foreignOrigin.status, 403);
    const missingOrigin = await fetch(base + "/api/submit", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId: "demo-cedar", description: "test" })
    });
    assert.equal(missingOrigin.status, 403);
    const valid = await fetch(base + "/api/submit", {
      method: "POST", headers: { Origin: base, "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId: "demo-cedar", description: "Fictional case" })
    });
    assert.equal(valid.status, 200);
    assert.equal((await valid.json()).ok, true);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
