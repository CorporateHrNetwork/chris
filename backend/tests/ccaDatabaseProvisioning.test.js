"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createDemoState } = require("../../tools/cca-local-demo/server");

test("CCA routes fictional database requests to Database Services", () => {
  const demo = createDemoState();
  const result = demo.submit("demo-cedar", "Please provision a PostgreSQL database for our staging application.");
  assert.equal(result.ok, true);
  const ticket = demo.state("demo-cedar").cases.find(item => item.id === result.case.id);
  assert.equal(ticket.status, "ASSIGNED");
  assert.equal(ticket.analysis.category, "DATABASE_PROVISIONING");
  assert.equal(ticket.assignee, "Database Services Agent");
  assert.match(ticket.draft, /operator can review/);
  assert.equal(demo.state("demo-atlas").cases.some(item => item.id === ticket.id), false);
});

test("Cedar's provisioning details stay with Database Services and repair existing cases", () => {
  const demo = createDemoState();
  const original = demo.submit("demo-cedar", "Please provision a PostgreSQL database for our staging application.").case;
  const act = (ticket, operation, text) => demo.simulate("demo-cedar", "cca-staging-operator", {
    caseId: ticket.id, version: ticket.version, operation, text,
  });
  const reviewed = act(original, "RECOMMEND", original.draft);
  assert.equal(reviewed.ok, true);
  const delivered = act(reviewed.case, "APPROVE");
  assert.equal(delivered.ok, true);
  const reply = "Please address database provisioning first. The application is Cedar Demo Inventory, the environment is fictional staging, and expected storage is 1 GB. We need a dedicated PostgreSQL database and a separate application login for fictional test data.";
  const reopened = act(delivered.case, "REPLY", reply);
  assert.equal(reopened.ok, true);
  assert.equal(reopened.case.id, original.id);
  assert.equal(reopened.case.assignee, "Database Services Agent");

  const snapshot = demo.exportSnapshot();
  const stored = snapshot.workflow.cases.find(ticket => ticket.id === original.id);
  stored.analysis = { category: "TECHNICAL", agent: "Technical Support Agent" };
  stored.assignee = "Technical Support Agent";
  stored.draft = "Old technical support draft.";
  const restored = createDemoState(snapshot);
  const repaired = restored.state("demo-cedar").cases.find(ticket => ticket.id === original.id);
  assert.equal(repaired.assignee, "Database Services Agent");
  assert.equal(repaired.tenantReply, reply);
  assert.ok(repaired.version > stored.version);
  assert.equal(createDemoState(restored.exportSnapshot()).exportSnapshot().workflow.events.length,
    restored.exportSnapshot().workflow.events.length);
});
