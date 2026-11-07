"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createDurableDemoState } = require("../../tools/cca-local-demo/server");
const { createLocalSnapshotStore } = require("../../tools/cca-local-demo/localSnapshotStore");

function temp() { return fs.mkdtempSync(path.join(os.tmpdir(), "cca-fictional-test-")); }
function clean(dir) { fs.rmSync(dir, { recursive: true, force: true }); }

test("fictional cases and audit survive a fresh demo process", () => {
  const dir = temp();
  try {
    const demo = createDurableDemoState({ dataDir: dir });
    const created = demo.submit("demo-cedar", "Persist my synthetic test ticket");
    assert.equal(created.ok, true);
    const id = created.case.id;
    assert.equal(demo.operate({ caseId: id, operation: "TRIAGE" }).ok, true);
    const restored = createDurableDemoState({ dataDir: dir });
    const found = restored.state().cases.find(c => c.id === id);
    assert.equal(found.status, "TRIAGED");
    assert.equal(restored.audit(id).events.length, 2);
    assert.equal(restored.state().cases.length, 3);
    assert.equal(restored.submit("zermatt-liquor-limited", "Must reject").ok, false);
  } finally { clean(dir); }
});

test("backup is checked and can be explicitly restored after corruption", () => {
  const dir = temp();
  try {
    const demo = createDurableDemoState({ dataDir: dir });
    demo.submit("demo-atlas", "One extra fictional case");
    const store = createLocalSnapshotStore({ dataDir: dir });
    assert.equal(store.inspectBackup().available, true);
    fs.writeFileSync(store.primary, '{"bad":true}', "utf8");
    assert.throws(() => createDurableDemoState({ dataDir: dir }));
    assert.equal(fs.readFileSync(store.primary, "utf8"), '{"bad":true}');
    const oldState = store.restoreBackup();
    assert.equal(oldState.workflow.cases.length, 2);
    const repaired = createDurableDemoState({ dataDir: dir });
    assert.equal(repaired.state().cases.length, 2);
    assert.equal(fs.readdirSync(dir).some(f => f.startsWith("state.before-restore-")), true);
  } finally { clean(dir); }
});

test("tampered or mismatched snapshot records cannot silently pass", () => {
  const dir = temp();
  try {
    const store = createLocalSnapshotStore({ dataDir: dir });
    const demo = createDurableDemoState({ dataDir: dir });
    const parsed = JSON.parse(fs.readFileSync(store.primary, "utf8"));
    parsed.payload.snapshot.workflow.cases[0].tenantId = "zermatt-liquor-limited";
    fs.writeFileSync(store.primary, JSON.stringify(parsed), "utf8");
    assert.throws(() => createDurableDemoState({ dataDir: dir }), /CCA_SNAPSHOT_CHECKSUM_MISMATCH/);
    assert.equal(demo.state().cases.length, 2);
  } finally { clean(dir); }
});

test("existing malformed primary cannot be overwritten by an unrelated save", () => {
  const dir = temp();
  try {
    const store = createLocalSnapshotStore({ dataDir: dir });
    const demo = createDurableDemoState({ dataDir: dir });
    fs.writeFileSync(store.primary, "BROKEN", "utf8");
    assert.throws(() => store.save(demo.exportSnapshot?.() || { workflow: { cases: [] }, index: [] }));
    assert.equal(fs.readFileSync(store.primary, "utf8"), "BROKEN");
  } finally { clean(dir); }
});
