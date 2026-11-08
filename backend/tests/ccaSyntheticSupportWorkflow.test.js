"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createSyntheticSupportWorkflow } = require("../src/cca/syntheticSupportWorkflow");
const { derivePlatformContext } = require("../src/cca/platformDirectoryPolicy");

const principal = (id) => ({ id, active: true });
function context(id, role, tenantId) {
  return derivePlatformContext({
    principal: principal(id),
    sessionResult: { accepted: true, platformPrincipalId: id, sessionId: "sid-" + id },
    assignments: [
      { assignmentId: "p-" + id, principalId: id, active: true, scope: "PLATFORM", role },
      { assignmentId: "t-" + id, principalId: id, active: true, scope: "TENANT", role, tenantId }
    ]
  });
}
const agent = context("support-A", "SERVICE_AGENT", "tenant-A");
const otherAgent = context("support-B", "SERVICE_AGENT", "tenant-B");
const approver = context("approver-A", "PLATFORM_APPROVER", "tenant-A");
const sample = (idempotencyKey = "request-1") => ({
  channel: "CHRIS_PORTAL", payload: { description: "Synthetic attendance report problem", idempotencyKey },
  identity: { verified: true, channel: "CHRIS_PORTAL", tenantId: "tenant-A",
    subjectId: "client-A", tenantActive: true }
});
test("end-to-end synthetic support case requires independent approval and client closure", () => {
  const flow = createSyntheticSupportWorkflow();
  const receipt = flow.submit(sample());
  assert.equal(receipt.ok, true);
  const id = receipt.case.id;
  assert.equal(receipt.case.status, "ASSIGNED");
  assert.equal(receipt.case.assignee, "HR Support Agent");
  assert.deepEqual(flow.getEvents({ caseId: id, context: agent }).events.map(e => e.event),
    ["CASE_RECEIVED", "CASE_ANALYZED", "AGENT_ASSIGNED", "SUPPORT_DRAFT_PREPARED"]);
  assert.equal(flow.act({ caseId: id, context: agent, operation: "RECOMMEND", recommendation: "Review the synthetic branch filter" }).case.status, "AWAITING_APPROVAL");
  assert.equal(flow.act({ caseId: id, context: agent, operation: "RESOLVE", resolution: "Change completed" }).code, "INVALID_WORKFLOW_TRANSITION");
  assert.equal(flow.act({ caseId: id, context: agent, operation: "APPROVE", approval: { approverId: "support-A", context: agent, reference: "bad" } }).code, "INDEPENDENT_APPROVAL_REQUIRED");
  assert.equal(flow.act({ caseId: id, context: agent, operation: "APPROVE", approval: { approverId: "approver-A", context: approver, reference: "mock-approval-001" } }).case.status, "APPROVED");
  assert.equal(flow.act({ caseId: id, context: agent, operation: "RESOLVE", resolution: "Synthetic guidance issued for client validation" }).case.status, "AWAITING_CLIENT_VALIDATION");
  assert.equal(flow.clientConfirm({ caseId: id, verifiedTenantId: "tenant-A", verifiedSubjectId: "client-A" }).case.status, "CLOSED");
  assert.equal(flow.getEvents({ caseId: id, context: agent }).events.length, 8);
});
test("cross-tenant staff cannot read, modify or approve another tenant's case", () => {
  const flow = createSyntheticSupportWorkflow();
  const id = flow.submit(sample()).case.id;
  assert.equal(flow.getCase({ caseId: id, context: otherAgent }).ok, false);
  assert.equal(flow.act({ caseId: id, context: otherAgent, operation: "TRIAGE" }).ok, false);
  assert.equal(flow.getEvents({ caseId: id, context: otherAgent }).ok, false);
  assert.equal(flow.clientConfirm({ caseId: id, verifiedTenantId: "tenant-B", verifiedSubjectId: "client-A" }).ok, false);
  assert.equal(flow.clientConfirm({ caseId: id, verifiedTenantId: "tenant-A", verifiedSubjectId: "stranger" }).ok, false);
});
test("idempotency is tenant-scoped and detects conflicting retransmissions", () => {
  const flow = createSyntheticSupportWorkflow();
  const first = flow.submit(sample("same-message"));
  assert.equal(flow.submit(sample("same-message")).replayed, true);
  assert.equal(flow.submit({ ...sample("same-message"), payload: {
    ...sample("same-message").payload, description: "Different body"
  }}).code, "IDEMPOTENCY_CONFLICT");
  const other = sample("same-message");
  other.identity.tenantId = "tenant-B";
  assert.notEqual(flow.submit(other).case.id, first.case.id);
});
test("forbidden transitions cannot bypass automatic assignment or approval", () => {
  const flow = createSyntheticSupportWorkflow();
  const id = flow.submit(sample()).case.id;
  assert.equal(flow.act({ caseId: id, context: agent, operation: "ASSIGN", agentId: "mock" }).ok, false);
  assert.equal(flow.act({ caseId: id, context: agent, operation: "RESOLVE", resolution: "premature" }).ok, false);
  assert.equal(flow.clientConfirm({ caseId: id, verifiedTenantId: "tenant-A", verifiedSubjectId: "client-A" }).ok, false);
});
