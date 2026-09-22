const SENSITIVE_PATTERNS = [
  /\bpassword\b/i,
  /\botp\b/i,
  /\bone[- ]?time password\b/i,
  /\bdatabase (password|credential|connection string)\b/i,
  /\baccess token\b/i,
  /\bsecret key\b/i,
];

const CATEGORIES = {
  QUERY: "QUERY",
  INCIDENT: "INCIDENT",
  BUG: "BUG",
  ACCESS: "ACCESS_ISSUE",
  CONFIGURATION: "CONFIGURATION_REQUEST",
  IMPROVEMENT: "IMPROVEMENT_REQUEST",
  DATA: "DATA_ISSUE",
  SECURITY: "SECURITY_CONCERN",
};

const SEVERITIES = {
  P1: "P1_CRITICAL",
  P2: "P2_HIGH",
  P3: "P3_MEDIUM",
  P4: "P4_LOW",
};

const SUPPORT_STATUSES = new Set([
  "NEW",
  "TRIAGED",
  "AWAITING_CLIENT",
  "ASSIGNED",
  "IN_PROGRESS",
  "FIX_READY",
  "DEPLOYED",
  "CLIENT_VALIDATION",
  "RESOLVED",
  "CLOSED",
  "CANCELLED",
  "ESCALATED",
  "BLOCKED",
  "REOPENED",
]);

function cleanText(value) {
  return String(value || "").trim();
}

function containsAny(text, terms) {
  const source = text.toLowerCase();
  return terms.some((term) => source.includes(term));
}

function privacyGuard(input) {
  const text = cleanText(input);
  const flagged = SENSITIVE_PATTERNS.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source);
  return {
    safe: flagged.length === 0,
    flagged,
    clientInstruction:
      flagged.length > 0
        ? "For your security, please do not send passwords, OTPs, access tokens, database credentials or other secrets through WhatsApp. CHRiS Support Desk will request only the minimum information required to investigate your case."
        : null,
  };
}

function classifyCategory(message) {
  const text = cleanText(message).toLowerCase();
  if (containsAny(text, ["breach", "unauthorised", "unauthorized", "hacked", "security", "data leak"])) return CATEGORIES.SECURITY;
  if (containsAny(text, ["cannot login", "can't login", "unable to login", "access denied", "permission", "locked out"])) return CATEGORIES.ACCESS;
  if (containsAny(text, ["wrong data", "missing employee", "duplicate", "incorrect data", "data mismatch"])) return CATEGORIES.DATA;
  if (containsAny(text, ["error", "bug", "not working", "broken", "crash", "failed", "failure"])) return CATEGORIES.BUG;
  if (containsAny(text, ["improve", "enhancement", "feature", "can chris add", "would like", "request to add"])) return CATEGORIES.IMPROVEMENT;
  if (containsAny(text, ["configure", "configuration", "setup", "change setting", "workflow change"])) return CATEGORIES.CONFIGURATION;
  if (containsAny(text, ["down", "outage", "unavailable", "stopped", "blocked", "cannot process"])) return CATEGORIES.INCIDENT;
  return CATEGORIES.QUERY;
}

function classifySeverity({ message, category, businessImpact, payrollDeadlineToday = false, affectedUsers = 1 }) {
  const text = `${cleanText(message)} ${cleanText(businessImpact)}`.toLowerCase();
  if (
    category === CATEGORIES.SECURITY ||
    containsAny(text, ["full outage", "all users", "organisation-wide", "organization-wide", "data breach", "payroll completely blocked"]) ||
    (payrollDeadlineToday && containsAny(text, ["payroll", "salary"]) && affectedUsers > 10)
  ) return SEVERITIES.P1;

  if (
    containsAny(text, ["major module", "cannot process payroll", "critical workflow", "many users", "branch blocked"]) ||
    (payrollDeadlineToday && containsAny(text, ["payroll", "salary"])) ||
    affectedUsers >= 5
  ) return SEVERITIES.P2;

  if (category === CATEGORIES.IMPROVEMENT || category === CATEGORIES.QUERY) return SEVERITIES.P4;
  return SEVERITIES.P3;
}

function inferModule(message) {
  const text = cleanText(message).toLowerCase();
  const modules = [
    ["payroll", ["payroll", "payslip", "salary", "deduction", "allowance"]],
    ["employees", ["employee", "onboarding", "designation", "line manager", "transfer", "promotion"]],
    ["leave", ["leave", "entitlement", "return to work"]],
    ["attendance", ["attendance", "clock", "shift", "overtime", "lateness", "absence"]],
    ["recruitment", ["recruitment", "candidate", "vacancy", "interview", "offer"]],
    ["loans", ["loan", "salary advance"]],
    ["reports", ["report", "analytics", "dashboard"]],
    ["settings", ["role", "permission", "user access", "setting"]],
  ];
  return modules.find(([, terms]) => containsAny(text, terms))?.[0] || "general";
}

function supportAgent({ message, contactName }) {
  const guard = privacyGuard(message);
  if (!guard.safe) {
    return { action: "SECURITY_REDIRECT", response: guard.clientInstruction, guard };
  }
  return {
    action: "ACKNOWLEDGE_AND_TRIAGE",
    response: `Thank you${contactName ? `, ${contactName}` : ""}. CHRiS Support Desk has received your message. I am assessing the issue now and will ask only for information required to resolve it.`,
    guard,
  };
}

function triageAgent(input) {
  const category = input.category || classifyCategory(input.message);
  const severity = input.severity || classifySeverity({ ...input, category });
  const module = input.module || inferModule(input.message);
  const needsEngineering = [
    CATEGORIES.BUG,
    CATEGORIES.INCIDENT,
    CATEGORIES.DATA,
    CATEGORIES.SECURITY,
    CATEGORIES.IMPROVEMENT,
  ].includes(category);

  return {
    category,
    severity,
    module,
    status: needsEngineering ? "TRIAGED" : "NEW",
    needsEngineering,
    missingInformation: [
      !input.expectedBehaviour && [CATEGORIES.BUG, CATEGORIES.DATA, CATEGORIES.INCIDENT].includes(category) ? "expectedBehaviour" : null,
      !input.actualBehaviour && [CATEGORIES.BUG, CATEGORIES.DATA, CATEGORIES.INCIDENT].includes(category) ? "actualBehaviour" : null,
      !input.businessImpact && severity !== SEVERITIES.P4 ? "businessImpact" : null,
    ].filter(Boolean),
  };
}

function engineeringLiaisonAgent(ticket) {
  const title = `[${ticket.severity}] ${ticket.ticketNumber} · ${ticket.module || "General"} · ${ticket.subject || ticket.category}`;
  const body = [
    "## CHRiS Support Desk Engineering Escalation",
    `**Ticket:** ${ticket.ticketNumber}`,
    `**Client/Tenant:** ${ticket.organizationName || ticket.organizationSlug || ticket.organizationId}`,
    `**Category:** ${ticket.category}`,
    `**Severity:** ${ticket.severity}`,
    `**Module:** ${ticket.module || "General"}`,
    ticket.branch ? `**Branch:** ${ticket.branch}` : null,
    ticket.contactName ? `**Client Contact:** ${ticket.contactName}` : null,
    "",
    "### Reported issue",
    ticket.description || ticket.subject || "No description supplied.",
    "",
    "### Expected behaviour",
    ticket.expectedBehaviour || "Not yet supplied.",
    "",
    "### Actual behaviour",
    ticket.actualBehaviour || "Not yet supplied.",
    "",
    "### Business impact",
    ticket.businessImpact || "Not yet supplied.",
    "",
    "### Reproduction / evidence",
    ticket.reproductionSteps || "Not yet supplied.",
    ticket.evidenceReference ? `Evidence reference: ${ticket.evidenceReference}` : null,
    "",
    "### Acceptance criteria",
    ticket.acceptanceCriteria || "Issue no longer reproduces, affected workflow behaves as expected, and client validation is obtained before closure.",
    "",
    "_Generated by CHRiS Support Desk. Do not add passwords, OTPs, access tokens or unnecessary sensitive employee/payroll data to this issue._",
  ].filter((line) => line !== null).join("\n");
  return { title, body };
}

function resolutionAgent({ ticketNumber, status, resolutionSummary }) {
  const messages = {
    ASSIGNED: `Your CHRiS Support Desk case ${ticketNumber} has been assigned for resolution.`,
    IN_PROGRESS: `Work is in progress on CHRiS Support Desk case ${ticketNumber}.`,
    FIX_READY: `A fix is ready for CHRiS Support Desk case ${ticketNumber} and is being prepared for deployment/validation.`,
    DEPLOYED: `The resolution for CHRiS Support Desk case ${ticketNumber} has been deployed. Please validate the affected workflow.`,
    CLIENT_VALIDATION: `CHRiS Support Desk case ${ticketNumber} is awaiting your validation.`,
    RESOLVED: `CHRiS Support Desk case ${ticketNumber} has been resolved${resolutionSummary ? `: ${resolutionSummary}` : "."}`,
    CLOSED: `CHRiS Support Desk case ${ticketNumber} is now closed. Thank you for confirming the resolution.`,
    CANCELLED: `CHRiS Support Desk case ${ticketNumber} was cancelled before Support attendance.`,
  };
  return messages[status] || `CHRiS Support Desk case ${ticketNumber} has been updated to ${status}.`;
}

function knowledgeAgent(ticket) {
  if (!["RESOLVED", "CLOSED"].includes(ticket.status) || !ticket.resolutionSummary) return null;
  return {
    title: `${ticket.module || "General"}: ${ticket.subject || ticket.category}`,
    category: ticket.category,
    module: ticket.module,
    problem: ticket.description,
    resolution: ticket.resolutionSummary,
    reusable: ticket.category !== CATEGORIES.SECURITY,
  };
}

module.exports = {
  CATEGORIES,
  SEVERITIES,
  SUPPORT_STATUSES,
  privacyGuard,
  supportAgent,
  triageAgent,
  engineeringLiaisonAgent,
  resolutionAgent,
  knowledgeAgent,
};