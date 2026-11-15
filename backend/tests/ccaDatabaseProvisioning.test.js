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

test("database approval requires a separate authorized Cedar identity", () => {
  const { derivePlatformContext } = require("../../backend/src/cca/platformDirectoryPolicy");
  const context = (id, roles, tenantId = "demo-cedar") => derivePlatformContext({
    sessionResult: { accepted: true, platformPrincipalId: id },
    principal: { id, active: true },
    assignments: roles.flatMap(role => ["PLATFORM", "TENANT"].map(scope => ({
      assignmentId: scope + role, principalId: id, active: true, role, scope, tenantId,
    }))),
  });
  const demo = createDemoState();
  const request = demo.submit("demo-cedar", "Please provision a PostgreSQL database.").case;
  const simulate = (ticket, operation, text) => demo.simulate("demo-cedar", "cca-staging-operator", {
    caseId: ticket.id, version: ticket.version, operation, text,
  });
  const drafted = simulate(request, "RECOMMEND", request.draft).case;
  const delivered = simulate(drafted, "APPROVE").case;
  const ready = simulate(delivered, "REPLY", "We need a dedicated PostgreSQL database for fictional staging.").case;
  const requester = context("cca-staging-operator", ["SERVICE_AGENT", "PLATFORM_APPROVER"]);
  const decide = (operation, ticket, actor) => demo.databaseDecision({
    caseId: ticket.id, version: ticket.version, operation, context: actor,
  });
  const pending = decide("REQUEST_DATABASE_APPROVAL", ready, requester).case;
  assert.equal(pending.status, "AWAITING_APPROVAL");
  assert.equal(simulate(pending, "APPROVE").ok, false);
  assert.equal(decide("APPROVE_DATABASE", pending, requester).code, "INDEPENDENT_APPROVAL_REQUIRED");
  assert.equal(decide("APPROVE_DATABASE", pending,
    context("cca-atlas-approver", ["PLATFORM_APPROVER"], "demo-atlas")).code, "DATABASE_APPROVAL_DENIED");
  const approver = context("cca-cedar-approver", ["PLATFORM_APPROVER"]);
  assert.equal(decide("APPROVE_DATABASE", ready, approver).code, "CASE_CHANGED");
  const approved = decide("APPROVE_DATABASE", pending, approver).case;
  assert.equal(approved.status, "APPROVED");
  assert.equal(approved.databaseApproval.approvedBy, "cca-cedar-approver");
  assert.equal(demo.audit(approved.id).events.at(-1).event, "DATABASE_PROVISIONING_APPROVED");
});
