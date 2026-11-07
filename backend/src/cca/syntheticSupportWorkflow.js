"use strict";

// Synthetic in-memory CCA service workflow. No network/DB/file access,
// credentials, background agents, tenant sessions or production actions.
const { resolveIntake } = require("./tenantIntakePolicy");
const { PERMISSIONS } = require("./controlPlanePolicy");
const { isAuthorized } = require("./platformDirectoryPolicy");

function validateSnapshot(snapshot) {
  if (!snapshot || snapshot.version !== 1 ||
      !Number.isSafeInteger(snapshot.sequence) || snapshot.sequence < 0 ||
      !Array.isArray(snapshot.cases) || !Array.isArray(snapshot.idempotency) ||
      !Array.isArray(snapshot.events) ||
      snapshot.cases.length > 3000 || snapshot.events.length > 20000 ||
      snapshot.idempotency.length > 3000) throw new Error("CCA_INVALID_WORKFLOW_SNAPSHOT");
  const caseIds = new Set();
  const statuses = new Set(["NEW", "TRIAGED", "ASSIGNED", "AWAITING_APPROVAL", "APPROVED", "AWAITING_CLIENT_VALIDATION", "CLOSED"]);
  let greatestId = 0;
  for (const c of snapshot.cases) {
    if (!c || typeof c.id !== "string" || !/^CCA-DEMO-[0-9]{4,}$/.test(c.id) ||
        caseIds.has(c.id) || !["demo-cedar", "demo-atlas"].includes(c.tenantId) ||
        typeof c.requesterSubjectId !== "string" || !c.requesterSubjectId ||
        typeof c.description !== "string" || c.description.length > 10000 ||
        !statuses.has(c.status)) throw new Error("CCA_INVALID_WORKFLOW_CASE");
    caseIds.add(c.id);
    greatestId = Math.max(greatestId, Number(c.id.replace("CCA-DEMO-", "")));
  }
  if (snapshot.sequence < greatestId) throw new Error("CCA_INVALID_WORKFLOW_SEQUENCE");
  const keys = new Set();
  for (const entry of snapshot.idempotency) {
    if (!Array.isArray(entry) || entry.length !== 2 ||
        typeof entry[0] !== "string" || !entry[0].startsWith("demo-") ||
        keys.has(entry[0]) || !caseIds.has(entry[1])) throw new Error("CCA_INVALID_WORKFLOW_IDEMPOTENCY");
    keys.add(entry[0]);
  }
  for (let i = 0; i < snapshot.events.length; i++) {
    const ev = snapshot.events[i];
    if (!ev || ev.sequence !== i + 1 || !caseIds.has(ev.caseId) ||
        !["demo-cedar", "demo-atlas"].includes(ev.tenantId) ||
        typeof ev.event !== "string" || typeof ev.actor !== "string")
      throw new Error("CCA_INVALID_WORKFLOW_AUDIT");
  }
}
function createSyntheticSupportWorkflow(initialSnapshot) {
  if (initialSnapshot !== undefined) validateSnapshot(initialSnapshot);
  const cases = new Map();
  const idempotency = new Map();
  const eventLog = [];
  let sequence = 0;
  if (initialSnapshot) {
    for (const c of initialSnapshot.cases) cases.set(c.id, { ...c });
    for (const [key, id] of initialSnapshot.idempotency) idempotency.set(key, id);
    for (const ev of initialSnapshot.events) eventLog.push({ ...ev, details: { ...ev.details } });
    sequence = initialSnapshot.sequence;
  }
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
  function exportSnapshot() {
    return JSON.parse(JSON.stringify({
      version: 1, sequence,
      cases: [...cases.values()], idempotency: [...idempotency.entries()],
      events: eventLog
    }));
  }
  return Object.freeze({ submit, act, clientConfirm, getCase, getEvents, exportSnapshot });
}
module.exports = { createSyntheticSupportWorkflow };
