const crypto = require("crypto");
const {
  SUPPORT_STATUSES,
  supportAgent,
  triageAgent,
  engineeringLiaisonAgent,
  resolutionAgent,
  knowledgeAgent,
} = require("./supportDeskAgents");

const ENTITY_TICKET = "SupportTicket";
const ENTITY_MESSAGE = "SupportMessage";
const ENTITY_KNOWLEDGE = "SupportKnowledge";

function normalize(value) {
  return String(value || "").trim();
}

function organizationCode(organization) {
  if (organization?.code) return String(organization.code).trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  const slug = normalize(organization?.slug);
  const initials = slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return initials || "CLIENT";
}

function generateTicketNumber(organization) {
  const code = organizationCode(organization);
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `CHR-SD-${code}-${day}-${suffix}`;
}

async function audit(prisma, data) {
  return prisma.organizationAudit.create({
    data: {
      organizationId: data.organizationId,
      actorUserId: data.actorUserId || null,
      entityType: data.entityType,
      entityId: data.entityId,
      action: data.action,
      previousValue: data.previousValue || undefined,
      newValue: data.newValue || undefined,
      reason: data.reason || null,
    },
  });
}

function ticketFromCreatedEvent(event) {
  return {
    ...(event.newValue || {}),
    ticketNumber: event.entityId,
    createdAt: event.createdAt,
    updatedAt: event.createdAt,
  };
}

function applyTicketEvent(ticket, event) {
  if (!ticket) return ticket;
  const next = event.newValue || {};
  return {
    ...ticket,
    ...next,
    ticketNumber: event.entityId,
    updatedAt: event.createdAt,
  };
}

async function getTicket(prisma, { organizationId, ticketNumber }) {
  const events = await prisma.organizationAudit.findMany({
    where: {
      organizationId,
      entityType: ENTITY_TICKET,
      entityId: ticketNumber,
    },
    orderBy: { createdAt: "asc" },
  });
  if (!events.length) return null;
  let ticket = ticketFromCreatedEvent(events[0]);
  for (const event of events.slice(1)) ticket = applyTicketEvent(ticket, event);
  return ticket;
}

async function listTickets(prisma, { organizationId, limit = 100 }) {
  const events = await prisma.organizationAudit.findMany({
    where: { organizationId, entityType: ENTITY_TICKET },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(Number(limit) || 100, 1), 1000),
  });

  const tickets = new Map();
  for (const event of events.reverse()) {
    if (!tickets.has(event.entityId)) {
      tickets.set(event.entityId, ticketFromCreatedEvent(event));
    } else {
      tickets.set(event.entityId, applyTicketEvent(tickets.get(event.entityId), event));
    }
  }
  return [...tickets.values()].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

async function getMessages(prisma, { organizationId, ticketNumber }) {
  const rows = await prisma.organizationAudit.findMany({
    where: {
      organizationId,
      entityType: ENTITY_MESSAGE,
      entityId: ticketNumber,
    },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    ...(row.newValue || {}),
    createdAt: row.createdAt,
  }));
}

async function createTicket(prisma, input) {
  const organization = input.organization || await prisma.organization.findUnique({ where: { id: input.organizationId } });
  if (!organization) throw new Error("SUPPORT_ORGANIZATION_NOT_FOUND");

  const ticketNumber = generateTicketNumber(organization);
  const description = normalize(input.description || input.message);
  const support = supportAgent({ message: description, contactName: input.contactName });
  const triage = triageAgent({
    ...input,
    message: description,
  });

  const ticket = {
    ticketNumber,
    organizationId: organization.id,
    organizationName: organization.name,
    organizationSlug: organization.slug,
    channel: input.channel || "CHRIS",
    contactName: normalize(input.contactName) || null,
    contactPhone: normalize(input.contactPhone) || null,
    contactEmail: normalize(input.contactEmail) || null,
    subject: normalize(input.subject) || description.slice(0, 120) || "Support request",
    description,
    category: triage.category,
    severity: triage.severity,
    module: triage.module,
    branch: normalize(input.branch) || null,
    expectedBehaviour: normalize(input.expectedBehaviour) || null,
    actualBehaviour: normalize(input.actualBehaviour) || null,
    businessImpact: normalize(input.businessImpact) || null,
    reproductionSteps: normalize(input.reproductionSteps) || null,
    evidenceReference: normalize(input.evidenceReference) || null,
    acceptanceCriteria: normalize(input.acceptanceCriteria) || null,
    missingInformation: triage.missingInformation,
    needsEngineering: triage.needsEngineering,
    status: triage.status,
    sourceMessageId: normalize(input.sourceMessageId) || null,
    assignedEngineer: null,
    githubIssueNumber: null,
    githubIssueUrl: null,
    resolutionSummary: null,
    clientValidatedAt: null,
    closedAt: null,
  };

  await audit(prisma, {
    organizationId: organization.id,
    actorUserId: input.actorUserId,
    entityType: ENTITY_TICKET,
    entityId: ticketNumber,
    action: "SUPPORT_TICKET_CREATED",
    newValue: ticket,
    reason: `Created from ${ticket.channel}`,
  });

  if (description) {
    await addMessage(prisma, {
      organizationId: organization.id,
      ticketNumber,
      direction: "INBOUND",
      channel: ticket.channel,
      sender: input.contactName || input.contactPhone || "Client",
      body: description,
      sourceMessageId: input.sourceMessageId,
      actorUserId: input.actorUserId,
    });
  }

  return { ticket, clientResponse: support.response };
}

async function addMessage(prisma, input) {
  return audit(prisma, {
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    entityType: ENTITY_MESSAGE,
    entityId: input.ticketNumber,
    action: "SUPPORT_MESSAGE_RECORDED",
    newValue: {
      direction: input.direction || "INBOUND",
      channel: input.channel || "CHRIS",
      sender: normalize(input.sender) || null,
      body: normalize(input.body),
      sourceMessageId: normalize(input.sourceMessageId) || null,
    },
  });
}

async function updateTicket(prisma, input) {
  const current = await getTicket(prisma, input);
  if (!current) throw new Error("SUPPORT_TICKET_NOT_FOUND");
  const patch = { ...input.patch };
  if (patch.status && !SUPPORT_STATUSES.has(patch.status)) throw new Error("INVALID_SUPPORT_STATUS");

  if (patch.status === "CLOSED") patch.closedAt = new Date().toISOString();
  if (patch.status === "CLIENT_VALIDATION" && input.clientValidated === true) {
    patch.clientValidatedAt = new Date().toISOString();
    patch.status = "RESOLVED";
  }

  await audit(prisma, {
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    entityType: ENTITY_TICKET,
    entityId: input.ticketNumber,
    action: "SUPPORT_TICKET_UPDATED",
    previousValue: current,
    newValue: patch,
    reason: input.reason || "Support Desk update",
  });

  const updated = { ...current, ...patch };
  const clientResponse = patch.status
    ? resolutionAgent({
        ticketNumber: input.ticketNumber,
        status: patch.status,
        resolutionSummary: updated.resolutionSummary,
      })
    : null;

  const knowledge = knowledgeAgent(updated);
  if (knowledge) {
    await audit(prisma, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      entityType: ENTITY_KNOWLEDGE,
      entityId: input.ticketNumber,
      action: "SUPPORT_KNOWLEDGE_CAPTURED",
      newValue: knowledge,
    });
  }

  return { ticket: updated, clientResponse };
}

async function createGitHubIssue(ticket) {
  const token = process.env.GITHUB_SUPPORT_TOKEN;
  const repository = process.env.GITHUB_SUPPORT_REPO || "CorporateHrNetwork/chris";
  if (!token) return { configured: false, reason: "GITHUB_SUPPORT_TOKEN_NOT_CONFIGURED" };
  const [owner, repo] = repository.split("/");
  if (!owner || !repo) throw new Error("INVALID_GITHUB_SUPPORT_REPO");
  const brief = engineeringLiaisonAgent(ticket);
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "CHRiS-Support-Desk",
    },
    body: JSON.stringify({
      title: brief.title,
      body: brief.body,
      labels: ["chris-support-desk", `severity:${String(ticket.severity || "").toLowerCase()}`],
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`GITHUB_ISSUE_CREATE_FAILED:${response.status}:${detail.slice(0, 300)}`);
  }
  const issue = await response.json();
  return { configured: true, number: issue.number, url: issue.html_url, title: issue.title };
}

async function escalateToEngineering(prisma, input) {
  const ticket = await getTicket(prisma, input);
  if (!ticket) throw new Error("SUPPORT_TICKET_NOT_FOUND");
  const result = await createGitHubIssue(ticket);
  const patch = result.configured
    ? {
        status: "ESCALATED",
        githubIssueNumber: result.number,
        githubIssueUrl: result.url,
        engineeringEscalatedAt: new Date().toISOString(),
      }
    : {
        status: "ESCALATED",
        engineeringEscalationPending: true,
        engineeringEscalationReason: result.reason,
      };
  return updateTicket(prisma, {
    ...input,
    patch,
    reason: "Engineering escalation",
  });
}

async function sendWhatsAppText({ to, body }) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) return { configured: false, reason: "WHATSAPP_OUTBOUND_NOT_CONFIGURED" };
  const response = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body },
    }),
  });
  if (!response.ok) throw new Error(`WHATSAPP_SEND_FAILED:${response.status}:${(await response.text()).slice(0, 300)}`);
  return { configured: true, data: await response.json() };
}

module.exports = {
  ENTITY_TICKET,
  ENTITY_MESSAGE,
  ENTITY_KNOWLEDGE,
  createTicket,
  listTickets,
  getTicket,
  getMessages,
  addMessage,
  updateTicket,
  escalateToEngineering,
  sendWhatsAppText,
};
