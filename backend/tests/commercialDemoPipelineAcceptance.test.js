const fs = require("fs");
const path = require("path");
const { buildCommercialAgentWorkflow } = require("../src/services/commercialAgentWorkflowService");

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", "..", relativePath), "utf8");
}

describe("CHRiS commercial demo intake pipeline", () => {
  test("public website requests create platform commercial leads instead of support tickets", () => {
    const service = read("backend/src/services/commercialLeadService.js");
    const routes = read("backend/src/routes/commercialDemoRoutes.js");
    expect(service).toContain('const ENTITY_LEAD = "CommercialLead"');
    expect(service).toContain('const PLATFORM_SLUG = "corporatehr-network"');
    expect(routes).toContain('router.post("/public/demo-requests"');
    expect(service).not.toContain('SupportTicket');
    expect(routes).not.toContain('SupportTicket');
  });

  test("intake requires consent and keeps CHRiS as system of record before workflow and email delivery", () => {
    const service = read("backend/src/services/commercialLeadService.js");
    expect(service).toContain("DEMO_REQUEST_CONSENT_REQUIRED");
    expect(service.indexOf('action: "COMMERCIAL_DEMO_REQUEST_CREATED"')).toBeLessThan(service.indexOf('action: "COMMERCIAL_AGENT_WORKFLOW_INITIALIZED"'));
    expect(service.indexOf('action: "COMMERCIAL_AGENT_WORKFLOW_INITIALIZED"')).toBeLessThan(service.indexOf('type: "COMMERCIAL_INTERNAL_DEMO_ALERT"'));
    expect(service).toContain('const DEFAULT_INBOX = "chris@crnetwork.com.ng"');
  });

  test("internal alert and prospect acknowledgement are separate auditable channels", () => {
    const service = read("backend/src/services/commercialLeadService.js");
    expect(service).toContain("internalNotification");
    expect(service).toContain("prospectAcknowledgement");
    expect(service).toContain("COMMERCIAL_INTERNAL_NOTIFICATION_ATTEMPTED");
    expect(service).toContain("COMMERCIAL_PROSPECT_ACKNOWLEDGEMENT_ATTEMPTED");
    expect(service).toContain("COMMERCIAL_PROSPECT_ACKNOWLEDGEMENT");
  });

  test("commercial agent routing creates auditable work items and preserves human approval gates", () => {
    const workflowService = read("backend/src/services/commercialAgentWorkflowService.js");
    const service = read("backend/src/services/commercialLeadService.js");
    for (const agent of [
      "Lead Qualification Agent",
      "Sales / Business Development Agent",
      "Demo Coordination Agent",
      "Product / Solution Agent",
    ]) expect(workflowService).toContain(agent);
    expect(service).toContain("COMMERCIAL_AGENT_WORKFLOW_INITIALIZED");
    expect(workflowService).toContain("FINAL_PRICING");
    expect(workflowService).toContain("CONTRACTUAL_COMMITMENT");
    expect(workflowService).toContain("MAJOR_CUSTOMIZATION");
    expect(workflowService).toContain("no direct database writes");
  });

  test("qualified leads are handed from qualification to sales, demo coordination and solution preparation", () => {
    const workflow = buildCommercialAgentWorkflow({
      leadNumber: "CHR-DEMO-TEST-001",
      companyName: "Example Limited",
      contactName: "Demo Contact",
      employeeCount: 250,
      locations: 3,
      currentHrSystem: "Spreadsheets",
      implementationTimeline: "Within 30 days",
      modulesOfInterest: ["Employees", "Payroll"],
      preferredDemoDate: "2026-09-18",
      preferredDemoTime: "10:00",
      message: "Need payroll and employee records",
      status: "QUALIFIED",
      qualificationScore: 80,
      commercialPriority: "HIGH",
    });

    expect(workflow.state).toBe("QUALIFICATION_COMPLETE");
    expect(workflow.currentAgent).toBe("Sales / Business Development Agent");
    expect(workflow.tasks).toHaveLength(4);
    expect(workflow.tasks[0].status).toBe("COMPLETED");
    expect(workflow.tasks[1].status).toBe("READY");
    expect(workflow.tasks[2].status).toBe("READY");
    expect(workflow.tasks[3].status).toBe("READY");
    expect(workflow.approvalGates.find((gate) => gate.type === "DEMO_COMMITMENT").status).toBe("PENDING");
    expect(workflow.controls.humanApprovalRequiredFor).toContain("final pricing");
  });

  test("low-confidence leads remain under qualification review instead of being auto-progressed", () => {
    const workflow = buildCommercialAgentWorkflow({
      leadNumber: "CHR-DEMO-TEST-002",
      companyName: "Small Example",
      contactName: "Demo Contact",
      modulesOfInterest: [],
      status: "NEW",
      qualificationScore: 20,
      commercialPriority: "STANDARD",
    });

    expect(workflow.state).toBe("QUALIFICATION_REVIEW_REQUIRED");
    expect(workflow.currentAgent).toBe("Lead Qualification Agent");
    expect(workflow.tasks[1].status).toBe("REVIEW_REQUIRED");
    expect(workflow.tasks[2].status).toBe("BLOCKED");
    expect(workflow.tasks[3].status).toBe("BLOCKED");
  });

  test("won opportunities create a controlled implementation handoff without automatic tenant creation", () => {
    const service = read("backend/src/services/commercialLeadService.js");
    expect(service).toContain('next.status === "WON"');
    expect(service).toContain("Implementation / Client Onboarding Agent");
    expect(service).toContain("Customer Success Agent");
    expect(service).toContain("COMMERCIAL_IMPLEMENTATION_HANDOFF_CREATED");
    expect(service).toContain("does not create a tenant automatically");
  });

  test("commercial activity history is exposed internally", () => {
    const service = read("backend/src/services/commercialLeadService.js");
    const routes = read("backend/src/routes/commercialDemoRoutes.js");
    expect(service).toContain("listLeadActivity");
    expect(routes).toContain('/internal/leads/:leadNumber/activity');
  });

  test("commercial routes are mounted separately from support desk", () => {
    const app = read("backend/src/app.js");
    expect(app).toContain('app.use("/api/commercial", commercialDemoRoutes)');
  });
});
