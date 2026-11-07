"use strict";
/**
 * Local-only CCA prototype. No CHRiS app routes, database, or live users.
 * IMPORTANT: demo personas are NOT authentication. NEVER deploy to the internet.
 */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { createSyntheticSupportWorkflow } = require("../../backend/src/cca/syntheticSupportWorkflow");
const { derivePlatformContext } = require("../../backend/src/cca/platformDirectoryPolicy");

const HOST = "127.0.0.1";
const TENANTS = Object.freeze([
  { id: "demo-cedar", name: "Cedar Demo Services", requester: "cedar-requester" },
  { id: "demo-atlas", name: "Atlas Demo Works", requester: "atlas-requester" },
]);
const AGENTS = Object.freeze(["Intake Agent", "HR Support Agent", "Technical Support Agent", "Customer Success Agent"]);

function platformContext(id, role, tenantId) {
  return derivePlatformContext({
    sessionResult: { accepted: true, platformPrincipalId: id, sessionId: "demo-session-" + id },
    principal: { id, active: true },
    assignments: [
      { assignmentId: id + "-p", principalId: id, active: true, scope: "PLATFORM", role },
      { assignmentId: id + "-t", principalId: id, active: true, scope: "TENANT", role, tenantId },
    ],
  });
}

function createDemoState() {
  const flow = createSyntheticSupportWorkflow();
  const index = new Map();
  function submit(tenantId, description) {
    const tenant = TENANTS.find(t => t.id === tenantId);
    if (!tenant) return { ok: false, code: "UNKNOWN_DEMO_TENANT" };
    const result = flow.submit({
      channel: "CHRIS_PORTAL",
      payload: { description, idempotencyKey: crypto.randomUUID() },
      identity: { verified: true, channel: "CHRIS_PORTAL", tenantId, subjectId: tenant.requester, tenantActive: true }
    });
    if (result.ok) index.set(result.case.id, tenant.id);
    return result;
  }
  // Fictional seeded cases; no integration with the live CHRiS demo tenants.
  submit("demo-cedar", "Synthetic onboarding request: explain the employee record workflow.");
  submit("demo-atlas", "Synthetic support request: report filtering needs clarification.");

  function state() {
    const cases = [...index].map(([id, tenantId]) => {
      const context = platformContext("demo-reader", "SERVICE_AGENT", tenantId);
      return flow.getCase({ caseId: id, context }).case;
    });
    return { ok: true, demonstration: true, tenants: TENANTS, agents: AGENTS, cases,
      notice: "FICTIONAL DATA ONLY — NOT CONNECTED TO CHRiS PRODUCTION" };
  }
  function operate({ caseId, operation, agentId, recommendation, resolution }) {
    const tenantId = index.get(caseId);
    if (!tenantId) return { ok: false, code: "CASE_NOT_FOUND" };
    const context = platformContext("demo-support", "SERVICE_AGENT", tenantId);
    if (operation === "CONFIRM") {
      const tenant = TENANTS.find(t => t.id === tenantId);
      return flow.clientConfirm({ caseId, verifiedTenantId: tenantId, verifiedSubjectId: tenant.requester });
    }
    const approval = operation === "APPROVE" ? {
      approverId: "demo-independent-approver",
      context: platformContext("demo-independent-approver", "PLATFORM_APPROVER", tenantId),
      reference: "DEMO-APPROVAL-" + crypto.randomUUID().slice(0, 8)
    } : undefined;
    return flow.act({ caseId, operation, context, approval, agentId, recommendation, resolution });
  }
  function audit(caseId) {
    const tenantId = index.get(caseId);
    if (!tenantId) return { ok: false, code: "CASE_NOT_FOUND" };
    return flow.getEvents({ caseId, context: platformContext("demo-audit-reader", "SERVICE_AGENT", tenantId) });
  }
  return Object.freeze({ state, submit, operate, audit });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => {
      raw += chunk;
      if (raw.length > 16000) { reject(new Error("BODY_TOO_LARGE")); req.destroy(); }
    });
    req.on("end", () => {
      try { resolve(JSON.parse(raw || "{}")); } catch { reject(new Error("INVALID_JSON")); }
    });
    req.on("error", reject);
  });
}
function send(res, code, data) {
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  });
  res.end(JSON.stringify(data));
}

function createServer(demo = createDemoState()) {
  const html = path.join(__dirname, "index.html");
  const js = path.join(__dirname, "client.js");
  return http.createServer(async (req, res) => {
    const host = (req.headers.host || "").split(":")[0];
    if (!["127.0.0.1", "localhost"].includes(host)) return send(res, 403, { ok: false, code: "LOCAL_ONLY" });
    const url = new URL(req.url, "http://localhost");
    const origin = req.headers.origin;
    if (origin && !["http://127.0.0.1:" + req.socket.localPort, "http://localhost:" + req.socket.localPort].includes(origin)) {
      return send(res, 403, { ok: false, code: "INVALID_ORIGIN" });
    }
    const staticPages = Object.freeze({
      "/": html, "/client.js": js,
      "/control-centre": path.join(__dirname, "control-centre.html"),
      "/control-centre.js": path.join(__dirname, "control-centre.js"),
    });
    if (req.method === "GET" && Object.prototype.hasOwnProperty.call(staticPages, url.pathname)) {
      const isJS = url.pathname.endsWith(".js");
      res.writeHead(200, { "Content-Type": isJS ? "text/javascript; charset=utf-8" : "text/html; charset=utf-8",
        "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" });
      return fs.createReadStream(staticPages[url.pathname]).pipe(res);
    }
    if (req.method === "GET" && url.pathname === "/api/state") return send(res, 200, demo.state());
    if (req.method === "GET" && url.pathname === "/api/audit")
      return send(res, 200, demo.audit(url.searchParams.get("caseId")));
    if (req.method === "POST" && ["/api/submit", "/api/act"].includes(url.pathname)) {
      if (!origin) return send(res, 403, { ok: false, code: "ORIGIN_REQUIRED" });
      if (!String(req.headers["content-type"] || "").startsWith("application/json")) {
        return send(res, 415, { ok: false, code: "JSON_REQUIRED" });
      }
      try {
        const body = await parseBody(req);
        const result = url.pathname === "/api/submit"
          ? demo.submit(body.tenantId, body.description)
          : demo.operate(body);
        return send(res, result.ok ? 200 : 400, result);
      } catch (e) { return send(res, 400, { ok: false, code: e.message }); }
    }
    return send(res, 404, { ok: false, code: "NOT_FOUND" });
  });
}

if (require.main === module) {
  const server = createServer();
  const port = Number(process.env.CCA_LOCAL_PORT || 4179);
  server.listen(port, HOST, () => {
    console.log("CCA fictional local prototype: http://" + HOST + ":" + server.address().port);
    console.log("No CHRiS production connection. Close with Ctrl+C.");
  });
}
module.exports = { createServer, createDemoState, HOST };
