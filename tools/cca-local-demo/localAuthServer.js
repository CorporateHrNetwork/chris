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
function createAuthServer(auth) {
  const pending = new Map();
  const files = {
    "/": "admin-login.html",
    "/admin-login.js": "admin-login.js",
  };
  return http.createServer(async (req, res) => {
    const host = (req.headers.host || "").split(":")[0];
    if (!["127.0.0.1", "localhost"].includes(host)) return json(res, 403, FAIL);
    const url = new URL(req.url || "/", "http://localhost");
    const origin = req.headers.origin;
    if (origin && !originFor(req.socket.localPort).includes(origin))
      return json(res, 403, FAIL);
    if (req.method === "GET" && Object.prototype.hasOwnProperty.call(files, url.pathname)) {
      const isScript = url.pathname.endsWith(".js");
      res.writeHead(200, {
        "Content-Type": isScript ? "text/javascript; charset=utf-8" : "text/html; charset=utf-8",
        "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Content-Security-Policy": "default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      });
      return fs.createReadStream(path.join(__dirname, files[url.pathname])).pipe(res);
    }
    const cookie = parseCookies(req.headers.cookie)[COOKIE];
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
    if (url.pathname === "/api/password") {
      const result = auth.lab.loginPassword({ id: body.account, password: body.password });
      if (!result.ok) return json(res, 401, FAIL);
      // Separate short-lived browser challenge; never expose account roles.
      return json(res, 200, { ok: true, challenge: result.challenge });
    }
    if (url.pathname === "/api/mfa") {
      const result = auth.lab.loginOtp({ challenge: body.challenge, code: body.code });
      if (!result.ok) return json(res, 401, FAIL);
      return json(res, 200, { ok: true, demonstration: true },
        { "Set-Cookie": COOKIE + "=" + result.token + "; HttpOnly; SameSite=Strict; Path=/; Max-Age=900" });
    }
    if (cookie) auth.lab.revoke(cookie);
    return json(res, 200, { ok: true },
      { "Set-Cookie": COOKIE + "=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0" });
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
  server.listen(PORT, HOST, () => {
    console.log("LOCAL FICTIONAL CCA LOGIN: http://" + HOST + ":" + PORT);
    console.log("DEMO ONLY — account:", ACCOUNT);
    console.log("Ephemeral password (not saved):", password);
    console.log("TOTP enrollment secret (one-time local terminal display):", base32(secret));
    console.log("Authenticator: TOTP SHA1, six digits, 30-second period.");
    console.log("Restart clears account and sessions. Do not share these demo values.");
  });
}
module.exports = { createAuthServer, createDemoAuth, base32, ACCOUNT, HOST, PORT };
