"use strict";

// Pure CCA tenant lifecycle policy. No DB, HTTP, payment or deployment actions.
// A transition decision is not execution authorisation.
const STATES = Object.freeze({
  PENDING: "PENDING",
  ACTIVE: "ACTIVE",
  RENEWAL_DUE: "RENEWAL_DUE",
  GRACE: "GRACE",
  SUSPENDED: "SUSPENDED",
  DEACTIVATED: "DEACTIVATED",
});

const TRANSITIONS = Object.freeze({
  PENDING: Object.freeze(["ACTIVE"]),
  ACTIVE: Object.freeze(["RENEWAL_DUE", "SUSPENDED", "DEACTIVATED"]),
  RENEWAL_DUE: Object.freeze(["ACTIVE", "GRACE", "SUSPENDED"]),
  GRACE: Object.freeze(["ACTIVE", "SUSPENDED"]),
  SUSPENDED: Object.freeze(["ACTIVE", "DEACTIVATED"]),
  DEACTIVATED: Object.freeze(["ACTIVE"]),
});

const ALL_STATES = new Set(Object.values(STATES));

function evaluateTransition({ from, to, evidence, approval } = {}) {
  if (!ALL_STATES.has(from) || !ALL_STATES.has(to)) {
    return { allowed: false, code: "INVALID_LIFECYCLE_STATE" };
  }
  if (from === to || !TRANSITIONS[from].includes(to)) {
    return { allowed: false, code: "INVALID_LIFECYCLE_TRANSITION" };
  }
  // Every lifecycle mutation, including renewal/reactivation, requires an
  // independent, recorded approval. An AI recommendation does not qualify.
  if (!approval || approval.authorized !== true ||
      typeof approval.approverId !== "string" || !approval.approverId.trim() ||
      typeof approval.reference !== "string" || !approval.reference.trim()) {
    return { allowed: false, code: "HUMAN_APPROVAL_REQUIRED" };
  }
  if (typeof evidence?.reason !== "string" || !evidence.reason.trim()) {
    return { allowed: false, code: "REASON_REQUIRED" };
  }
  if (typeof evidence?.idempotencyKey !== "string" || !evidence.idempotencyKey.trim()) {
    return { allowed: false, code: "IDEMPOTENCY_KEY_REQUIRED" };
  }
  if (to === STATES.ACTIVE && evidence?.entitlementVerified !== true) {
    return { allowed: false, code: "ENTITLEMENT_VERIFICATION_REQUIRED" };
  }
  if ([STATES.SUSPENDED, STATES.DEACTIVATED].includes(to) &&
      evidence?.noticeReviewed !== true) {
    return { allowed: false, code: "SUSPENSION_NOTICE_REVIEW_REQUIRED" };
  }
  return { allowed: true, code: "ELIGIBLE_FOR_SEPARATE_AUTHORIZED_EXECUTION" };
}

function recordsDeletionPermittedByLifecycleChange() {
  // Suspension/deactivation NEVER implies a destructive delete.
  return false;
}

module.exports = { STATES, TRANSITIONS, evaluateTransition, recordsDeletionPermittedByLifecycleChange };
