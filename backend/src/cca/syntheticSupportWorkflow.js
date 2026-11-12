"use strict";

// Synthetic in-memory CCA service workflow. No network/DB/file access,
// credentials, background agents, tenant sessions or production actions.
const { ANALYSIS_AGENT, analyzeSupportRequest, draftSupportResponse } = require("./supportIntakeAnalysis");
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
  const statuses = new Set(["NEW", "TRIAGED", "ASSIGNED", "NEEDS_CLARIFICATION", "AWAITING_APPROVAL", "APPROVED", "AWAITING_CLIENT_VALIDATION", "CLOSED"]);
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
      event, actor, at: new Date().toISOString(), details: Object.freeze({ ...details })
    });
    eventLog.push(entry);
    ticket.version = entry.sequence;
    return entry;
  };
  const safeCase = (c) => c && ({
    id: c.id, tenantId: c.tenantId, requesterSubjectId: c.requesterSubjectId,
    status: c.status, description: c.description, assignee: c.assignee,
    recommendation: c.recommendation, resolution: c.resolution,
    analysis: c.analysis && { ...c.analysis }, draft: c.draft,
    version: c.version || 0, tenantReply: c.tenantReply
  });
  function prepareDraft(ticket) {
    if (ticket.status !== "ASSIGNED" || ticket.draft) return;
    const draft = draftSupportResponse({ ...ticket, description: ticket.tenantReply || ticket.description });
    if (!draft) return;
    ticket.draft = draft;
    record(ticket, "SUPPORT_DRAFT_PREPARED", ticket.assignee, { category: ticket.analysis.category });
  }
  function route(ticket, description = ticket.description) {
    const analysis = analyzeSupportRequest(description);
    ticket.analysis = analysis;
    ticket.assignee = analysis.agent;
    ticket.status = analysis.question ? "NEEDS_CLARIFICATION" : "ASSIGNED";
    record(ticket, "CASE_ANALYZED", ANALYSIS_AGENT, { category: analysis.category });
    record(ticket, "AGENT_ASSIGNED", ANALYSIS_AGENT, { agentId: analysis.agent });
  }
  for (const ticket of cases.values()) {
    if (ticket.status === "NEW" || ticket.status === "TRIAGED") route(ticket);
    // Repair replies already misrouted by the old application-login rule.
    if (ticket.status === "ASSIGNED" && !ticket.recommendation &&
        ticket.analysis?.category === "TECHNICAL" && ticket.tenantReply &&
        analyzeSupportRequest(ticket.description).category === "DATABASE_PROVISIONING" &&
        analyzeSupportRequest(ticket.tenantReply).category === "DATABASE_PROVISIONING") {
      ticket.draft = null;
      route(ticket, ticket.tenantReply);
    }
    prepareDraft(ticket);
  }

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
    route(ticket);
    prepareDraft(ticket);
    return { ok: true, replayed: false, case: safeCase(ticket) };
  }

  function act({ caseId, context, operation, recommendation, approval, resolution, reason }) {
    const ticket = cases.get(caseId);
    if (!ticket) return deny("CASE_NOT_FOUND");
    if (!isAuthorized(context, PERMISSIONS.TICKETS_MANAGE, ticket.tenantId))
      return deny("TENANT_ACCESS_DENIED");
    const actor = context.principalId;
    if (operation === "RECOMMEND" && ticket.status === "ASSIGNED" &&
        typeof recommendation === "string" && recommendation.trim()) {
      // Recommendation is a simulated text artifact, never an execution.
      ticket.recommendation = recommendation.trim();
      ticket.status = "AWAITING_APPROVAL";
      record(ticket, "RECOMMENDATION_DRAFTED", actor);
    } else if (["APPROVE", "RETURN"].includes(operation) && ticket.status === "AWAITING_APPROVAL") {
      if (!approval || approval.approverId === actor || !approval.context ||
          approval.context.principalId !== approval.approverId ||
          !isAuthorized(approval.context, PERMISSIONS.APPROVALS_GRANT, ticket.tenantId) ||
          typeof approval.reference !== "string" || !approval.reference.trim())
        return deny("INDEPENDENT_APPROVAL_REQUIRED");
      const details = { reference: approval.reference, initiatedBy: actor };
      if (operation === "RETURN") {
        if (typeof reason !== "string" || !reason.trim()) return deny("REVISION_REASON_REQUIRED");
        ticket.draft = ticket.recommendation;
        ticket.recommendation = null;
        ticket.status = "ASSIGNED";
        record(ticket, "RECOMMENDATION_RETURNED", approval.approverId, { ...details, reason: reason.trim() });
      } else {
        ticket.status = "APPROVED";
        record(ticket, "RECOMMENDATION_APPROVED", approval.approverId, details);
      }
    } else if (operation === "RESOLVE" && ticket.status === "APPROVED" &&
               typeof resolution === "string" && resolution.trim()) {
      ticket.resolution = resolution.trim();
      ticket.status = "AWAITING_CLIENT_VALIDATION";
      record(ticket, "RESOLUTION_SENT_TO_CLIENT", actor, { response: ticket.resolution });
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

  function clientReply({ caseId, verifiedTenantId, verifiedSubjectId, reply }) {
    const ticket = cases.get(caseId);
    if (!ticket || ticket.tenantId !== verifiedTenantId ||
        ticket.requesterSubjectId !== verifiedSubjectId) return deny("CASE_NOT_FOUND");
    if (!["NEEDS_CLARIFICATION", "AWAITING_CLIENT_VALIDATION"].includes(ticket.status) ||
        typeof reply !== "string" || !reply.trim()) return deny("INVALID_WORKFLOW_TRANSITION");
    ticket.tenantReply = reply.trim();
    ticket.draft = null;
    ticket.recommendation = null;
    ticket.resolution = null;
    record(ticket, "TENANT_REPLIED", verifiedSubjectId, { reply: ticket.tenantReply });
    route(ticket, ticket.tenantReply);
    prepareDraft(ticket);
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
  return Object.freeze({ submit, act, clientConfirm, clientReply, getCase, getEvents, exportSnapshot });
}
module.exports = { createSyntheticSupportWorkflow };
