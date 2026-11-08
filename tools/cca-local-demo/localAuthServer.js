"use strict";
/**
 * Independent local-only CCA sign-in demo. DO NOT expose publicly.
 * In-memory synthetic user/session; no tenant auth or production route.
 */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { createLocalIdentityLab, otpAt } = require("./localIdentityLab");
const { PERMISSIONS } = require("../../backend/src/cca/controlPlanePolicy");

const HOST = "127.0.0.1";
const ACCOUNT = "cca-demo-operator";
const PORT = 4182;
const COOKIE = "cca_demo_sid";
const FAIL = Object.freeze({ ok: false, code: "CCA_AUTH_FAILED" });
const originFor = port => ["http://127.0.0.1:" + port, "http://localhost:" + port];
function createDemoAuth({ lab = createLocalIdentityLab(), account = ACCOUNT, password, secret } = {}) {
  if (!password || !Buffer.isBuffer(secret)) throw new Error("LOCAL_DEMO_BOOTSTRAP_REQUIRED");
  lab.enroll({ id: account, password, secret, role: "SERVICE_AGENT", tenantIds: ["demo-cedar"] });
  return Object.freeze({ lab, account });
}
function parseCookies(raw) {
  const map = Object.create(null);
  if (typeof raw !== "string") return map;
  for (const entry of raw.slice(0, 4096).split(";")) {
    const pos = entry.indexOf("=");
    if (pos > 0) map[entry.slice(0, pos).trim()] = entry.slice(pos + 1).trim();
  }
  return map;
}
function json(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'", ...extraHeaders });
  res.end(JSON.stringify(payload));
}
function payloadFrom(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", bytes => {
      raw += bytes;
      if (raw.length > 3000) { reject(Error("TOO_LARGE")); req.destroy(); }
    });
    req.on("end", () => {
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw Error("BAD_JSON");
        resolve(parsed);
      } catch { reject(Error("BAD_JSON")); }
    });
    req.on("error", reject);
  });
}
function createAuthServer(auth, { sourceThrottle, auditLedger, checkpoint, staging = false } = {}) {
  const cookieName = staging ? "cca_staging_sid" : COOKIE;
  let unavailable = false;
  function verifyState() {
    if (unavailable) throw Error("CCA_STAGING_STATE_UNAVAILABLE");
    checkpoint?.verify();
  }
  const auditEvents = [];
  const files = {
    "/": staging ? "staging-login.html" : "admin-login.html",
    "/admin-login.js": "admin-login.js",
    "/protected-centre": "protected-centre.html",
    "/protected-centre.js": "protected-centre.js",
  };
  return http.createServer(staging ? { requestTimeout: 10000, headersTimeout: 5000 } : {}, async (req, res) => {
    const host = (req.headers.host || "").split(":")[0];
    if (!["127.0.0.1", "localhost"].includes(host)) return json(res, 403, FAIL);
    let url;
    try { url = new URL(req.url || "/", "http://localhost"); }
    catch { return json(res, 400, FAIL); }
    const origin = req.headers.origin;
    if (origin && !originFor(req.socket.localPort).includes(origin))
      return json(res, 403, FAIL);
    try { verifyState(); }
    catch {
      unavailable = true;
      return json(res, 503, { ok: false, code: "CCA_STAGING_STATE_UNAVAILABLE" });
    }
    const cookie = parseCookies(req.headers.cookie)[cookieName];
    if (req.method === "GET" && Object.prototype.hasOwnProperty.call(files, url.pathname)) {
      if (url.pathname.startsWith("/protected-centre") && !auth.lab.resolveSession(cookie).accepted)
        return json(res, 401, FAIL);
      const isScript = url.pathname.endsWith(".js");
      res.writeHead(200, {
        "Content-Type": isScript ? "text/javascript; charset=utf-8" : "text/html; charset=utf-8",
        "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Content-Security-Policy": "default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      });
      return fs.createReadStream(path.join(__dirname, files[url.pathname])).pipe(res);
    }
    if (req.method === "GET" && url.pathname === "/api/whoami") {
      const identity = auth.lab.resolveSession(cookie, PERMISSIONS.TICKETS_READ, "demo-cedar");
      return json(res, identity.accepted ? 200 : 401, identity.accepted
        ? { ok: true, account: identity.principalId, assignedTenants: identity.assignedTenantIds,
            scope: "CCA", demonstration: true }
        : FAIL);
    }
    if (req.method === "GET" && url.pathname === "/api/fictional-cases") {
      const identity = auth.lab.resolveSession(cookie, PERMISSIONS.TICKETS_READ, "demo-cedar");
      if (!identity.accepted) return json(res, 401, FAIL);
      return json(res, 200, { ok: true, demonstration: true, cases: [
        { id: "CCA-AUTH-DEMO-001", tenantId: "demo-cedar",
          description: "Fictional onboarding question", status: "DEMO_READ_ONLY" }
      ] });
    }
    const modules = Object.freeze({
      support: { permission: PERMISSIONS.TICKETS_READ,
        description: "Fictional support cases, scoped to explicitly assigned demonstration tenants.", 
        records: [["CCA-AUTH-DEMO-001", "demo-cedar", "Fictional onboarding question", "READ ONLY"]] },
      agents: { permission: PERMISSIONS.AGENTS_READ,
        description: "Fictional AI agent roster. No agents can be executed here.",
        records: [["Intake Agent", "SIMULATION"], ["Support Agent", "SIMULATION"]] },
      billing: { permission: PERMISSIONS.BILLING_READ,
        description: "Fictional subscription overview. No billing writes are enabled.",
        records: [["Cedar Demo Services", "DEMO", "NO PAYMENT"]] },
      releases: { permission: PERMISSIONS.RELEASE_READ,
        description: "Illustrative release proposals only. Deployment controls are not connected.",
        records: [["CCA Prototype", "LOCAL ONLY", "NO DEPLOYMENT"]] },
      audit: { permission: PERMISSIONS.AUDIT_READ,
        description: "In-memory fictional login/authorization events, no production audit data.",
        records: auditEvents.slice(-20).map(e => [e.event, e.actor, e.time]) },
    });
    const permissionFor = item => auth.lab.resolveSession(cookie, item.permission,
      item.permission === PERMISSIONS.TICKETS_READ ? "demo-cedar" : undefined).accepted;
    if (req.method === "GET" && url.pathname === "/api/access") {
      const session = auth.lab.resolveSession(cookie);
      if (!session.accepted) return json(res, 401, FAIL);
      return json(res, 200, { ok: true, demonstration: true, account: session.principalId,
        modules: Object.keys(modules).filter(id => permissionFor(modules[id])) });
    }
    if (req.method === "GET" && url.pathname === "/api/workspace") {
      const session = auth.lab.resolveSession(cookie);
      if (!session.accepted) return json(res, 401, FAIL);
      const moduleId = url.searchParams.get("module");
      if (!Object.prototype.hasOwnProperty.call(modules, moduleId || ""))
        return json(res, 404, { ok: false, code: "NOT_FOUND" });
      const item = modules[moduleId];
      if (!permissionFor(item)) {
        auditEvents.push({ event: "ACCESS_DENIED", actor: session.principalId, time: new Date().toISOString() });
        if (auditEvents.length > 100) auditEvents.shift();
        return json(res, 403, { ok: false, code: "PERMISSION_DENIED" });
      }
      return json(res, 200, { ok: true, demonstration: true,
        description: item.description, records: item.records });
    }
    if (req.method !== "POST" ||
        !["/api/password", "/api/mfa", "/api/logout"].includes(url.pathname))
      return json(res, 404, { ok: false, code: "NOT_FOUND" });
    // No cookie auth mutation without Origin + JSON. No HTML form fallback.
    if (!origin || !originFor(req.socket.localPort).includes(origin))
      return json(res, 403, FAIL);
    if (!String(req.headers["content-type"] || "").startsWith("application/json"))
      return json(res, 415, FAIL);
    let body;
    try { body = await payloadFrom(req); }
    catch { return json(res, 400, FAIL); }
    if (url.pathname !== "/api/logout") {
      const passwordStep = url.pathname === "/api/password";
      const peer = req.socket.remoteAddress;
      let result;
      try {
        // Recheck after awaiting the body, then perform each operation synchronously
        // within the sole staging writer before returning anything to the browser.
        verifyState();
        const limit = sourceThrottle?.reserve
          ? sourceThrottle.reserve(peer, passwordStep ? "password" : "mfa")
          : passwordStep && sourceThrottle?.limit(peer);
        if (limit && !limit.allowed)
          return json(res, 429, { ok: false, code: "CCA_AUTH_THROTTLED" },
            { "Retry-After": String(limit.retryAfterSeconds) });
        result = passwordStep
          ? auth.lab.loginPassword({ id: body.account, password: body.password })
          : auth.lab.loginOtp({ challenge: body.challenge, code: body.code });
        if (passwordStep && !result.ok && sourceThrottle && !sourceThrottle.reserve)
          sourceThrottle.recordFailure(peer);
        if (!passwordStep && result.ok && auditLedger) {
          auditLedger.append({ event: "CCA_MFA_VERIFIED", actor: auth.account, target: auth.account });
        }
        checkpoint?.commit();
      } catch {
        if (!passwordStep && result?.ok) auth.lab.revoke(result.token);
        if (checkpoint) unavailable = true;
        return json(res, 503, { ok: false, code: "CCA_STAGING_STATE_UNAVAILABLE" });
      }
      if (!result.ok) return json(res, 401, FAIL);
      if (passwordStep) return json(res, 200, { ok: true, challenge: result.challenge });
      auditEvents.push({ event: "MFA_SESSION_GRANTED", actor: auth.account, time: new Date().toISOString() });
      if (auditEvents.length > 100) auditEvents.shift();
      return json(res, 200, { ok: true, demonstration: true },
        { "Set-Cookie": cookieName + "=" + result.token + "; HttpOnly; SameSite=Strict; Path=/; Max-Age=900" });
    }
    if (cookie) {
      const session = auth.lab.resolveSession(cookie);
      if (session.accepted) {
        auditEvents.push({ event: "SESSION_REVOKED", actor: session.principalId, time: new Date().toISOString() });
        if (auditEvents.length > 100) auditEvents.shift();
      }
      auth.lab.revoke(cookie);
    }
    return json(res, 200, { ok: true },
      { "Set-Cookie": cookieName + "=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0" });
  });
}
function base32(bytes) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, value = 0, result = "";
  for (const b of bytes) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { result += alphabet[(value >>> (bits -= 5)) & 31]; }
  }
  if (bits) result += alphabet[(value << (5 - bits)) & 31];
  return result;
}
if (require.main === module) {
  const password = crypto.randomBytes(24).toString("base64url");
  const secret = crypto.randomBytes(20);
  const auth = createDemoAuth({ password, secret });
  const server = createAuthServer(auth);
  const port = Number(process.env.CCA_AUTH_PORT || PORT);
  server.listen(port, HOST, () => {
    console.log("LOCAL FICTIONAL CCA LOGIN: http://" + HOST + ":" + port);
    console.log("DEMO ONLY — account:", ACCOUNT);
    console.log("Ephemeral password (not saved):", password);
    console.log("TOTP enrollment secret (one-time local terminal display):", base32(secret));
    console.log("Authenticator: TOTP SHA1, six digits, 30-second period.");
    console.log("Restart clears account and sessions. Do not share these demo values.");
  });
}
module.exports = { createAuthServer, createDemoAuth, base32, ACCOUNT, HOST, PORT };
