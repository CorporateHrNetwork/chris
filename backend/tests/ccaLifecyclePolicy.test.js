"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { STATES, evaluateTransition, recordsDeletionPermittedByLifecycleChange } = require("../src/cca/lifecyclePolicy");

const approval = { authorized: true, approverId: "operator-verified", reference: "approval-001" };
const evidence = { reason: "Contractually authorized renewal", idempotencyKey: "idem-001", entitlementVerified: true, noticeReviewed: true };

test("fail closed on invalid or unchanged lifecycle state", () => {
  assert.equal(evaluateTransition({ from: "UNKNOWN", to: STATES.ACTIVE }).allowed, false);
  assert.equal(evaluateTransition({ from: STATES.ACTIVE, to: STATES.ACTIVE, evidence, approval }).allowed, false);
  assert.equal(evaluateTransition({ from: STATES.PENDING, to: STATES.GRACE, evidence, approval }).allowed, false);
});

test("lifecycle changes require verified approval and traceable reason", () => {
  assert.equal(evaluateTransition({ from: STATES.ACTIVE, to: STATES.SUSPENDED, evidence }).code, "HUMAN_APPROVAL_REQUIRED");
  assert.equal(evaluateTransition({ from: STATES.ACTIVE, to: STATES.SUSPENDED, evidence, approval: { authorized: true } }).allowed, false);
  assert.equal(evaluateTransition({ from: STATES.ACTIVE, to: STATES.SUSPENDED, evidence: { ...evidence, reason: "" }, approval }).code, "REASON_REQUIRED");
  assert.equal(evaluateTransition({ from: STATES.ACTIVE, to: STATES.SUSPENDED, evidence: { ...evidence, idempotencyKey: "" }, approval }).code, "IDEMPOTENCY_KEY_REQUIRED");
});

test("activation requires separately verified entitlement", () => {
  const missing = { ...evidence, entitlementVerified: false };
  assert.equal(evaluateTransition({ from: STATES.SUSPENDED, to: STATES.ACTIVE, evidence: missing, approval }).code, "ENTITLEMENT_VERIFICATION_REQUIRED");
  assert.equal(evaluateTransition({ from: STATES.SUSPENDED, to: STATES.ACTIVE, evidence, approval }).allowed, true);
});

test("suspension requires notice review and cannot delete records", () => {
  const missing = { ...evidence, noticeReviewed: false };
  assert.equal(evaluateTransition({ from: STATES.GRACE, to: STATES.SUSPENDED, evidence: missing, approval }).code, "SUSPENSION_NOTICE_REVIEW_REQUIRED");
  assert.equal(evaluateTransition({ from: STATES.GRACE, to: STATES.SUSPENDED, evidence, approval }).allowed, true);
  assert.equal(recordsDeletionPermittedByLifecycleChange(), false);
});
