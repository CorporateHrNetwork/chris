"use strict";

// Synthetic in-memory CCA service workflow. No network/DB/file access,
// credentials, background agents, tenant sessions or production actions.
const { resolveIntake } = require("./tenantIntakePolicy");
const { PERMISSIONS } = require("./controlPlanePolicy");
const { isAuthorized } = require("./platformDirectoryPolicy");

function createSyntheticSupportWorkflow() {
  const cases = new Map();
  const idempotency = new Map();
  const eventLog = [];
  let sequence = 0;
  const deny = (code) => ({ ok: false, code });
  const record = (ticket, event, actor, details = {}) => {
    const entry = Object.freeze({
      sequence: eventLog.length + 1, caseId: ticket.id, tenantId: ticket.tenantId,
      event, actor, details: Object.freeze({ ...details })
    });
    eventLog.push(entry);
    return entry;
  };
  const safeCase = (c) => c && ({
    id: c.id, tenantId: c.tenantId, requesterSubjectId: c.requesterSubjectId,
    status: c.status, description: c.description, assignee: c.assignee,
    recommendation: c.recommendation, resolution: c.resolution
  });
  function submit({ channel, payload, identity }) {
    const intake = resolveIntake({ channel, payload, identity });
    if (!intake.accepted) return deny(intake.code);
    const key = [intake.tenantId, channel, intake.idempotencyKey].join(":");
    if (idempotency.has(key)) {
      const existing = cases.get(idempotency.get(key));
      if (existing.description !== intake.description ||
          existing.requesterSubjectId !== intake.requesterSubjectId) return deny("IDEMPOTENCY_CONFLICT");
      return { ok: true, replayed: true, case: safeCase(existing) };
    }
    const ticket = {
      id: "CCA-DEMO-" + String(++sequence).padStart(4, "0"),
      tenantId: intake.tenantId, requesterSubjectId: intake.requesterSubjectId,
      description: intake.description, status: "NEW", assignee: null,
      recommendation: null, resolution: null, requesterValidated: false
    };
    cases.set(ticket.id, ticket);
    idempotency.set(key, ticket.id);
    record(ticket, "CASE_RECEIVED", intake.requesterSubjectId, { channel });
    return { ok: true, replayed: false, case: safeCase(ticket) };
  }

  function act({ caseId, context, operation, agentId, recommendation, approval, resolution }) {
    const ticket = cases.get(caseId);
    if (!ticket) return deny("CASE_NOT_FOUND");
    if (!isAuthorized(context, PERMISSIONS.TICKETS_MANAGE, ticket.tenantId))
      return deny("TENANT_ACCESS_DENIED");
    const actor = context.principalId;
    if (operation === "TRIAGE" && ticket.status === "NEW") {
      ticket.status = "TRIAGED";
      record(ticket, "CASE_TRIAGED", actor);
    } else if (operation === "ASSIGN" && ticket.status === "TRIAGED" &&
               typeof agentId === "string" && agentId.trim()) {
      ticket.assignee = agentId.trim();
      ticket.status = "ASSIGNED";
      record(ticket, "AGENT_ASSIGNED", actor, { agentId: ticket.assignee });
    } else if (operation === "RECOMMEND" && ticket.status === "ASSIGNED" &&
               typeof recommendation === "string" && recommendation.trim()) {
      // Recommendation is a simulated text artifact, never an execution.
      ticket.recommendation = recommendation.trim();
      ticket.status = "AWAITING_APPROVAL";
      record(ticket, "RECOMMENDATION_DRAFTED", actor);
    } else if (operation === "APPROVE" && ticket.status === "AWAITING_APPROVAL") {
      // Separate independently authenticated CCA platform approver.
      if (!approval || approval.approverId === actor || !approval.context ||
          approval.context.principalId !== approval.approverId ||
          !isAuthorized(approval.context, PERMISSIONS.APPROVALS_GRANT) ||
          !Array.isArray(approval.context.assignedTenantIds) ||
          !approval.context.assignedTenantIds.includes(ticket.tenantId) ||
          typeof approval.reference !== "string" || !approval.reference.trim())
        return deny("INDEPENDENT_APPROVAL_REQUIRED");
      ticket.status = "APPROVED";
      record(ticket, "RECOMMENDATION_APPROVED", approval.approverId, {
        reference: approval.reference
      });
    } else if (operation === "RESOLVE" && ticket.status === "APPROVED" &&
               typeof resolution === "string" && resolution.trim()) {
      ticket.resolution = resolution.trim();
      ticket.status = "AWAITING_CLIENT_VALIDATION";
      record(ticket, "RESOLUTION_SENT_TO_CLIENT", actor);
    } else return deny("INVALID_WORKFLOW_TRANSITION");
    return { ok: true, case: safeCase(ticket) };
  }

  function clientConfirm({ caseId, verifiedTenantId, verifiedSubjectId }) {
    const ticket = cases.get(caseId);
    if (!ticket || ticket.tenantId !== verifiedTenantId ||
        ticket.requesterSubjectId !== verifiedSubjectId)
      return deny("CASE_NOT_FOUND");
    if (ticket.status !== "AWAITING_CLIENT_VALIDATION")
      return deny("INVALID_WORKFLOW_TRANSITION");
    ticket.status = "CLOSED";
    ticket.requesterValidated = true;
    record(ticket, "CLIENT_CONFIRMED_CLOSURE", verifiedSubjectId);
    return { ok: true, case: safeCase(ticket) };
  }

  function getCase({ caseId, context }) {
    const ticket = cases.get(caseId);
    if (!ticket || !isAuthorized(context, PERMISSIONS.TICKETS_READ, ticket.tenantId))
      return deny("CASE_NOT_FOUND");
    return { ok: true, case: safeCase(ticket) };
  }
  function getEvents({ caseId, context }) {
    const ticket = cases.get(caseId);
    if (!ticket || !isAuthorized(context, PERMISSIONS.TICKETS_READ, ticket.tenantId))
      return deny("CASE_NOT_FOUND");
    return { ok: true, events: eventLog.filter(e => e.caseId === caseId).map(e => ({ ...e })) };
  }
  return Object.freeze({ submit, act, clientConfirm, getCase, getEvents });
}
module.exports = { createSyntheticSupportWorkflow };
