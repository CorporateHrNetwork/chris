const fs = require("fs");
const path = require("path");

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", "..", relativePath), "utf8");
}

describe("CHRiS support portal environment separation", () => {
  test("client and platform support navigation are tenant-specific", () => {
    const sidebar = read("src/components/layout/Sidebar/Sidebar.jsx");
    expect(sidebar).toContain('label:"My Support Requests"');
    expect(sidebar).toContain("clientTenantOnly:true");
    expect(sidebar).toContain('label:"CHRiS Support Desk"');
    expect(sidebar).toContain("platformTenantOnly:true");
    expect(sidebar).toContain('PLATFORM_ORGANIZATION_SLUG = "corporatehr-network"');
  });

  test("platform tenant cannot use client support APIs", () => {
    const guard = read("backend/src/routes/supportDeskClientLifecycleGuardRoutes.js");
    expect(guard).toContain('router.use("/client", requireAuth');
    expect(guard).toContain("CLIENT_SUPPORT_PORTAL_TENANT_ONLY");
    expect(guard).toContain('PLATFORM_ORGANIZATION_SLUG = "corporatehr-network"');
  });

  test("client tickets feed the central support desk and client-visible feedback returns", () => {
    const routes = read("backend/src/routes/supportDeskRoutes.js");
    const service = read("backend/src/services/supportDeskService.js");
    expect(routes).toContain('router.post("/client/tickets"');
    expect(routes).toContain('channel: "CHRIS_CLIENT_PORTAL"');
    expect(routes).toContain('router.get("/internal/tickets"');
    expect(routes).toContain("listAllTickets");
    expect(routes).toContain('visibility: req.body?.visibility === "INTERNAL" ? "INTERNAL" : "CLIENT"');
    expect(service).toContain("clientVisibleOnly");
    expect(service).toContain('message.visibility !== "INTERNAL"');
    expect(service).toContain("supportAgent");
    expect(service).toContain("triageAgent");
  });
});
