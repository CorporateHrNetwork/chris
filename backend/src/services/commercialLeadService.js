const crypto = require("crypto");
const { dispatchCommercialEmail } = require("./commercialEmailService");
const { buildCommercialAgentWorkflow } = require("./commercialAgentWorkflowService");

const ENTITY_LEAD = "CommercialLead";
const PLATFORM_SLUG = "corporatehr-network";
const DEFAULT_INBOX = "chris@crnetwork.com.ng";
const STATUSES = new Set([
  "NEW",
  "QUALIFIED",
  "DEMO_SCHEDULED",
  "DEMO_COMPLETED",
  "PROPOSAL_REQUIRED",
  "PROPOSAL_SENT",
  "NEGOTIATION",
  "WON",
  "LOST",
  "DEFERRED",
]);

function clean(value) {
  return String(value || "").trim();
}

function normalizeEmail(value) {
  return clean(value).toLowerCase();
}

function safeArray(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean).slice(0, 30);
  return clean(value)
    ? clean(value).split(",").map((item) => item.trim()).filter(Boolean).slice(0, 30)
    : [];
}

function hasConsent(input) {
  return input.consent === true || String(input.consent || "").toLowerCase() === "true";
}

function leadNumber() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `CHR-DEMO-${date}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function qualifyLead(input) {
  const employeeCount = Number(input.employeeCount || input.organizationSize || 0);
  const timeline = clean(input.implementationTimeline).toLowerCase();
  const modules = safeArray(input.modulesOfInterest);
  let score = 20;
  if (employeeCount >= 50) score += 20;
  if (employeeCount >= 200) score += 15;
  if (employeeCount >= 500) score += 10;
  if (modules.length >= 2) score += 10;
  if (/immediate|30 days|1 month|this month|urgent/.test(timeline)) score += 20;
  else if (/quarter|3 month|90 day/.test(timeline)) score += 10;
  if (clean(input.currentHrSystem)) score += 5;
  score = Math.min(score, 100);
  const priority = score >= 75 ? "HIGH" : score >= 50 ? "MEDIUM" : "STANDARD";
  const qualification = score >= 45 ? "QUALIFIED" : "NEW";
  return {
    score,
    priority,
    qualification,
    assignedAgents: [
      "Lead Qualification Agent",
      "Sales / Business Development Agent",
      "Demo Coordination Agent",
      "Product / Solution Agent",
    ],
    humanApprovalRequiredFor: [
      "final pricing",
      "contractual commitments",
      "major customization commitments",
    ],
  };
}

function eventToLead(event) {
  return {
    ...(event.newValue || {}),
    leadNumber: event.entityId,
    createdAt: event.createdAt,
    updatedAt: event.createdAt,
  };
}

function applyLeadEvent(lead, event) {
  return {
    ...lead,
    ...(event.newValue || {}),
    leadNumber: event.entityId,
    updatedAt: event.createdAt,
  };
}

async function getPlatformOrganization(prisma) {
  const organization = await prisma.organization.findUnique({ where: { slug: PLATFORM_SLUG } });
  if (!organization) {
    const error = new Error("Commercial platform organization is not configured.");
    error.code = "COMMERCIAL_PLATFORM_NOT_CONFIGURED";
    throw error;
  }
  return organization;
}

async function recordEvent(prisma, {
  organizationId,
  actorUserId,
  leadNumber: id,
  action,
  previousValue,
  newValue,
  reason,
}) {
  return prisma.organizationAudit.create({
    data: {
      organizationId,
      actorUserId: actorUserId || null,
      entityType: ENTITY_LEAD,
      entityId: id,
      action,
      previousValue: previousValue || undefined,
      newValue: newValue || undefined,
      reason: reason || null,
    },
  });
}

async function getLead(prisma, organizationId, number) {
  const events = await prisma.organizationAudit.findMany({
    where: { organizationId, entityType: ENTITY_LEAD, entityId: number },
    orderBy: { createdAt: "asc" },
  });
  if (!events.length) return null;
  let lead = eventToLead(events[0]);
  for (const event of events.slice(1)) lead = applyLeadEvent(lead, event);
  return lead;
}

async function listLeads(prisma, organizationId, limit = 1000) {
  const events = await prisma.organizationAudit.findMany({
    where: { organizationId, entityType: ENTITY_LEAD },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(Number(limit) || 1000, 1), 5000),
  });
  const ordered = [...events].reverse();
  const map = new Map();
  for (const event of ordered) {
    const current = map.get(event.entityId);
    map.set(event.entityId, current ? applyLeadEvent(current, event) : eventToLead(event));
  }
  return [...map.values()].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

async function listLeadActivity(prisma, organizationId, number) {
  const rows = await prisma.organizationAudit.findMany({
    where: { organizationId, entityType: ENTITY_LEAD, entityId: number },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    reason: row.reason || null,
    actorUserId: row.actorUserId || null,
    previousValue: row.previousValue || null,
    newValue: row.newValue || null,
    createdAt: row.createdAt,
  }));
}

async function createDemoLead(prisma, input) {
  const organization = await getPlatformOrganization(prisma);
  const required = {
    companyName: clean(input.companyName || input.organizationName),
    contactName: clean(input.contactName),
    email: normalizeEmail(input.email),
    phone: clean(input.phone || input.whatsapp),
  };
  for (const [key, value] of Object.entries(required)) {
    if (!value) {
      const error = new Error(`${key} is required.`);
      error.code = "DEMO_REQUEST_VALIDATION_FAILED";
      throw error;
    }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(required.email)) {
    const error = new Error("A valid email address is required.");
    error.code = "DEMO_REQUEST_VALIDATION_FAILED";
    throw error;
  }
  if (!hasConsent(input)) {
    const error = new Error("Consent is required before a demo request can be submitted.");
    error.code = "DEMO_REQUEST_CONSENT_REQUIRED";
    throw error;
  }

  const qualification = qualifyLead(input);
  const number = leadNumber();
  const internalInbox = process.env.COMMERCIAL_DEMO_INBOX || DEFAULT_INBOX;
  const lead = {
    leadNumber: number,
    source: clean(input.source) || "CHRIS_COMMERCIAL_WEBSITE",
    campaign: clean(input.campaign) || null,
    website: clean(input.website) || "https://www.chris.crnetwork.com.ng",
    referrer: clean(input.referrer) || null,
    utmSource: clean(input.utmSource) || null,
    utmMedium: clean(input.utmMedium) || null,
    utmCampaign: clean(input.utmCampaign) || clean(input.campaign) || null,
    utmContent: clean(input.utmContent) || null,
    companyName: required.companyName,
    contactName: required.contactName,
    email: required.email,
    phone: required.phone,
    jobTitle: clean(input.jobTitle) || null,
    country: clean(input.country) || null,
    employeeCount: Number(input.employeeCount || input.organizationSize || 0) || null,
    locations: Number(input.locations || 0) || null,
    modulesOfInterest: safeArray(input.modulesOfInterest),
    currentHrSystem: clean(input.currentHrSystem) || null,
    implementationTimeline: clean(input.implementationTimeline) || null,
    preferredDemoDate: clean(input.preferredDemoDate) || null,
    preferredDemoTime: clean(input.preferredDemoTime) || null,
    message: clean(input.message || input.requirements) || null,
    consent: true,
    consentCapturedAt: new Date().toISOString(),
    status: qualification.qualification,
    qualificationScore: qualification.score,
    commercialPriority: qualification.priority,
    assignedAgents: qualification.assignedAgents,
    humanApprovalRequiredFor: qualification.humanApprovalRequiredFor,
    owner: "CHRiS Commercial Operations",
    nextAction: "Review qualification and schedule discovery/demo",
    internalNotification: { status: "QUEUED", to: internalInbox },
    prospectAcknowledgement: { status: "QUEUED", to: required.email },
    emailNotification: { status: "QUEUED", to: internalInbox },
    implementationHandoff: null,
  };

  // Lead creation is authoritative. Notification failures or downstream workflow issues must never discard the request.
  await recordEvent(prisma, {
    organizationId: organization.id,
    leadNumber: number,
    action: "COMMERCIAL_DEMO_REQUEST_CREATED",
    newValue: lead,
    reason: "Submitted from CHRiS commercial website",
  });

  const agentWorkflow = buildCommercialAgentWorkflow(lead);
  lead.agentWorkflow = agentWorkflow;
  lead.nextAction = agentWorkflow.nextAction;
  await recordEvent(prisma, {
    organizationId: organization.id,
    leadNumber: number,
    action: "COMMERCIAL_AGENT_WORKFLOW_INITIALIZED",
    previousValue: null,
    newValue: {
      agentWorkflow,
      nextAction: agentWorkflow.nextAction,
    },
    reason: `Commercial intake orchestrated to ${agentWorkflow.currentAgent}; first-response SLA ${agentWorkflow.firstResponseDueAt}`,
  });

  const internalNotification = await dispatchCommercialEmail({
    to: internalInbox,
    subject: `New CHRiS Demo Request · ${lead.leadNumber} · ${lead.companyName}`,
    replyTo: lead.email,
    type: "COMMERCIAL_INTERNAL_DEMO_ALERT",
    lead,
    message: `A new CHRiS website demo request has been captured, qualified and routed to ${agentWorkflow.currentAgent}. Next action: ${agentWorkflow.nextAction}.`,
  });
  await recordEvent(prisma, {
    organizationId: organization.id,
    leadNumber: number,
    action: "COMMERCIAL_INTERNAL_NOTIFICATION_ATTEMPTED",
    previousValue: { internalNotification: lead.internalNotification },
    newValue: { internalNotification, emailNotification: internalNotification },
    reason: `Demo request notification routed to ${internalNotification.to}`,
  });

  const prospectAcknowledgement = await dispatchCommercialEmail({
    to: lead.email,
    subject: `We received your CHRiS demo request · ${lead.leadNumber}`,
    replyTo: internalInbox,
    type: "COMMERCIAL_PROSPECT_ACKNOWLEDGEMENT",
    lead: {
      leadNumber: lead.leadNumber,
      companyName: lead.companyName,
      contactName: lead.contactName,
      preferredDemoDate: lead.preferredDemoDate,
      preferredDemoTime: lead.preferredDemoTime,
    },
    message: `Thank you, ${lead.contactName}. Your CHRiS demo request has been received. Our Commercial team will review your requirements and contact you using reference ${lead.leadNumber}.`,
  });
  await recordEvent(prisma, {
    organizationId: organization.id,
    leadNumber: number,
    action: "COMMERCIAL_PROSPECT_ACKNOWLEDGEMENT_ATTEMPTED",
    previousValue: { prospectAcknowledgement: lead.prospectAcknowledgement },
    newValue: { prospectAcknowledgement },
    reason: `Demo acknowledgement routed to ${prospectAcknowledgement.to}`,
  });

  return {
    ...lead,
    internalNotification,
    prospectAcknowledgement,
    emailNotification: internalNotification,
  };
}

async function updateLead(prisma, { organizationId, actorUserId, leadNumber: number, patch, reason }) {
  const current = await getLead(prisma, organizationId, number);
  if (!current) {
    const error = new Error("Commercial lead not found.");
    error.code = "COMMERCIAL_LEAD_NOT_FOUND";
    throw error;
  }
  const next = { ...patch };
  if (next.status) {
    next.status = clean(next.status).toUpperCase();
    if (!STATUSES.has(next.status)) {
      const error = new Error("Invalid commercial lead status.");
      error.code = "INVALID_COMMERCIAL_STATUS";
      throw error;
    }
  }
  if (next.assignedAgents) next.assignedAgents = safeArray(next.assignedAgents);

  const wonNow = next.status === "WON" && current.status !== "WON";
  if (wonNow && !current.implementationHandoff) {
    next.implementationHandoff = {
      status: "READY",
      sourceLeadNumber: number,
      clientCompany: current.companyName,
      contactName: current.contactName,
      contactEmail: current.email,
      modulesOfInterest: current.modulesOfInterest || [],
      owner: "CHRiS Implementation",
      assignedAgents: [
        "Implementation / Client Onboarding Agent",
        "Customer Success Agent",
      ],
      createdAt: new Date().toISOString(),
      note: "Commercial win recorded. Human-approved contract/pricing remains authoritative; this handoff does not create a tenant automatically.",
    };
    next.nextAction = "Implementation team to review signed commercial terms and commence controlled onboarding";
  }

  await recordEvent(prisma, {
    organizationId,
    actorUserId,
    leadNumber: number,
    action: "COMMERCIAL_LEAD_UPDATED",
    previousValue: current,
    newValue: next,
    reason: clean(reason) || "Commercial lead update",
  });

  if (wonNow && next.implementationHandoff) {
    await recordEvent(prisma, {
      organizationId,
      actorUserId,
      leadNumber: number,
      action: "COMMERCIAL_IMPLEMENTATION_HANDOFF_CREATED",
      previousValue: null,
      newValue: { implementationHandoff: next.implementationHandoff },
      reason: "Won opportunity handed to controlled CHRiS implementation workflow",
    });
  }

  return { ...current, ...next, updatedAt: new Date().toISOString() };
}

module.exports = {
  PLATFORM_SLUG,
  STATUSES,
  createDemoLead,
  getPlatformOrganization,
  getLead,
  listLeads,
  listLeadActivity,
  updateLead,
  qualifyLead,
};
