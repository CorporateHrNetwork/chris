const WORKFLOW_VERSION = "1.0";

const AGENTS = {
  QUALIFICATION: "Lead Qualification Agent",
  SALES: "Sales / Business Development Agent",
  DEMO: "Demo Coordination Agent",
  PRODUCT: "Product / Solution Agent",
};

function clean(value) {
  return String(value || "").trim();
}

function addHours(iso, hours) {
  return new Date(new Date(iso).getTime() + hours * 60 * 60 * 1000).toISOString();
}

function slaHours(priority) {
  if (priority === "HIGH") return 4;
  if (priority === "MEDIUM") return 12;
  return 24;
}

function buildDiscoveryBrief(lead) {
  const modules = Array.isArray(lead.modulesOfInterest) ? lead.modulesOfInterest : [];
  return {
    companyName: lead.companyName,
    contactName: lead.contactName,
    employeeCount: lead.employeeCount || null,
    locations: lead.locations || null,
    currentHrSystem: lead.currentHrSystem || null,
    implementationTimeline: lead.implementationTimeline || null,
    modulesOfInterest: modules,
    prospectRequirements: lead.message || null,
    questionsToConfirm: [
      !lead.employeeCount ? "Confirm workforce size and expected growth." : null,
      !lead.locations ? "Confirm operating locations and branch structure." : null,
      !lead.currentHrSystem ? "Confirm current HR/payroll process and migration source." : null,
      !lead.implementationTimeline ? "Confirm target implementation timeline." : null,
      !modules.length ? "Confirm priority CHRiS modules and immediate pain points." : null,
    ].filter(Boolean),
  };
}

function buildCommercialAgentWorkflow(lead) {
  const createdAt = new Date().toISOString();
  const responseDueAt = addHours(createdAt, slaHours(lead.commercialPriority));
  const isQualified = lead.status === "QUALIFIED";
  const hasDemoPreference = Boolean(clean(lead.preferredDemoDate) && clean(lead.preferredDemoTime));
  const hasModules = Array.isArray(lead.modulesOfInterest) && lead.modulesOfInterest.length > 0;

  const tasks = [
    {
      id: `${lead.leadNumber}:qualification`,
      agent: AGENTS.QUALIFICATION,
      stage: "QUALIFICATION",
      status: "COMPLETED",
      priority: lead.commercialPriority,
      createdAt,
      completedAt: createdAt,
      dueAt: createdAt,
      output: {
        score: lead.qualificationScore,
        classification: lead.status,
        priority: lead.commercialPriority,
      },
      nextHandoff: AGENTS.SALES,
    },
    {
      id: `${lead.leadNumber}:sales-discovery`,
      agent: AGENTS.SALES,
      stage: "DISCOVERY",
      status: isQualified ? "READY" : "REVIEW_REQUIRED",
      priority: lead.commercialPriority,
      createdAt,
      dueAt: responseDueAt,
      instruction: isQualified
        ? "Review the qualification evidence, contact the prospect, confirm business needs, and prepare the discovery outcome."
        : "Review the low-confidence qualification result before progressing the opportunity.",
      discoveryBrief: buildDiscoveryBrief(lead),
      nextHandoff: AGENTS.DEMO,
    },
    {
      id: `${lead.leadNumber}:demo-coordination`,
      agent: AGENTS.DEMO,
      stage: "DEMO_COORDINATION",
      status: isQualified ? (hasDemoPreference ? "READY" : "AWAITING_INPUT") : "BLOCKED",
      priority: lead.commercialPriority,
      createdAt,
      dueAt: responseDueAt,
      preferredDemoDate: lead.preferredDemoDate || null,
      preferredDemoTime: lead.preferredDemoTime || null,
      instruction: hasDemoPreference
        ? "Validate the requested demo slot and prepare it for human confirmation before any calendar commitment is made."
        : "Obtain a preferred demo date and time before scheduling.",
      nextHandoff: AGENTS.PRODUCT,
    },
    {
      id: `${lead.leadNumber}:solution-preparation`,
      agent: AGENTS.PRODUCT,
      stage: "SOLUTION_PREPARATION",
      status: isQualified ? (hasModules ? "READY" : "DISCOVERY_REQUIRED") : "BLOCKED",
      priority: lead.commercialPriority,
      createdAt,
      dueAt: responseDueAt,
      modulesOfInterest: lead.modulesOfInterest || [],
      instruction: hasModules
        ? "Prepare a focused CHRiS demo storyline and solution notes around the prospect's selected modules and stated requirements."
        : "Wait for discovery to identify priority modules before preparing the solution storyline.",
    },
  ];

  const approvalGates = [
    {
      id: `${lead.leadNumber}:approval-demo-slot`,
      type: "DEMO_COMMITMENT",
      status: hasDemoPreference ? "PENDING" : "NOT_READY",
      owner: "CHRiS Commercial Operations",
      requirement: "Human confirmation is required before committing a final demo date/time to the prospect.",
    },
    {
      id: `${lead.leadNumber}:approval-pricing`,
      type: "FINAL_PRICING",
      status: "NOT_READY",
      owner: "Authorized CHRiS Commercial Approver",
      requirement: "AI agents may prepare pricing inputs, but final pricing requires human approval.",
    },
    {
      id: `${lead.leadNumber}:approval-contract`,
      type: "CONTRACTUAL_COMMITMENT",
      status: "NOT_READY",
      owner: "Authorized CHRiS Commercial Approver",
      requirement: "No contract or binding commercial commitment may be issued without human approval.",
    },
    {
      id: `${lead.leadNumber}:approval-customization`,
      type: "MAJOR_CUSTOMIZATION",
      status: "NOT_READY",
      owner: "Authorized CHRiS Product / Commercial Approver",
      requirement: "Major customization scope or delivery commitments require human approval.",
    },
  ];

  return {
    workflowVersion: WORKFLOW_VERSION,
    initializedAt: createdAt,
    state: isQualified ? "QUALIFICATION_COMPLETE" : "QUALIFICATION_REVIEW_REQUIRED",
    commercialPriority: lead.commercialPriority,
    firstResponseDueAt: responseDueAt,
    currentAgent: isQualified ? AGENTS.SALES : AGENTS.QUALIFICATION,
    nextAction: isQualified
      ? "Sales / Business Development Agent to complete discovery and progress demo coordination"
      : "Lead Qualification Agent to review qualification evidence before commercial progression",
    tasks,
    approvalGates,
    controls: {
      databaseWritePolicy: "Agents act only through approved CHRiS services/API workflows; no direct database writes.",
      humanApprovalRequiredFor: ["final pricing", "contractual commitments", "major customization commitments", "final demo commitment"],
      sourceLeadNumber: lead.leadNumber,
    },
  };
}

module.exports = {
  AGENTS,
  WORKFLOW_VERSION,
  buildCommercialAgentWorkflow,
};
