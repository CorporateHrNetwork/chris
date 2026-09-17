const fs = require("fs");
const path = require("path");

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

  test("intake requires consent and keeps CHRiS as system of record before email delivery", () => {
    const service = read("backend/src/services/commercialLeadService.js");
    expect(service).toContain("DEMO_REQUEST_CONSENT_REQUIRED");
    expect(service.indexOf('action: "COMMERCIAL_DEMO_REQUEST_CREATED"')).toBeLessThan(service.indexOf('type: "COMMERCIAL_INTERNAL_DEMO_ALERT"'));
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

  test("commercial agent routing and human approval controls are preserved", () => {
    const service = read("backend/src/services/commercialLeadService.js");
    for (const agent of [
      "Lead Qualification Agent",
      "Sales / Business Development Agent",
      "Demo Coordination Agent",
      "Product / Solution Agent",
    ]) expect(service).toContain(agent);
    expect(service).toContain("final pricing");
    expect(service).toContain("contractual commitments");
    expect(service).toContain("major customization commitments");
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
