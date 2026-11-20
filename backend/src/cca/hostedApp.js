"use strict";

// Dedicated CCA hosted API factory. NOT a publicly deployable binary: the
// caller must inject a verified CCA identity/session resolver and hosted DB.
// No CHRiS cookies, trusted X-User headers, tenancy from query strings, or
// payment/provisioning endpoints. Run behind independently reviewed HTTPS.
const http = require("node:http");
const { PERMISSIONS, canAccessTenantCase } = require("./controlPlanePolicy");

function json(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "X-Frame-Options": "DENY",
  });
  res.end(JSON.stringify(data));
}

function createCcaHostedApp({ database, resolveOperatorSession } = {}) {
  if (!database || typeof database.verify !== "function" ||
      typeof database.reader?.listServiceRequests !== "function" ||
      typeof resolveOperatorSession !== "function") {
    throw new Error("CCA_HOSTED_APP_VERIFIED_DEPENDENCIES_REQUIRED");
  }
  let ready = false;
  const server = http.createServer({
    requestTimeout: 10000, headersTimeout: 5000,
    maxHeaderSize: 8192,
  }, async (req, res) => {
    if (req.method !== "GET") return json(res, 405, {ok:false, code:"METHOD_NOT_ALLOWED"});
    let url;
    try { url = new URL(req.url || "/", "http://cca.invalid"); }
    catch { return json(res, 400, {ok:false, code:"BAD_REQUEST"}); }
    if (url.pathname === "/health/live") {
      return json(res, 200, {ok:true, service:"CCA", status:"alive"});
    }
    if (url.pathname === "/health/ready") {
      return json(res, ready ? 200 : 503, {ok:ready, service:"CCA",
        status:ready ? "ready" : "not_ready"});
    }
    if (url.pathname !== "/api/cca/service-requests") {
      return json(res, 404, {ok:false, code:"NOT_FOUND"});
    }
    if (!ready) return json(res, 503, {ok:false, code:"CCA_NOT_READY"});
    if ([...url.searchParams].length || req.headers["x-tenant-id"] ||
        req.headers["x-user-id"] || req.headers["x-cca-user"]) {
      return json(res, 400, {ok:false, code:"CCA_CLIENT_SCOPE_DENIED"});
    }
    let session;
    try {
      session = await resolveOperatorSession(req);
    } catch {
      return json(res, 401, {ok:false, code:"CCA_AUTH_REQUIRED"});
    }
    if (!session || session.accepted !== true ||
        session.context?.platformIdentityVerified !== true ||
        session.context?.platformScope !== "CCA" ||
        typeof session.tenantId !== "string" ||
        !canAccessTenantCase(session.context, PERMISSIONS.TICKETS_READ, session.tenantId)) {
      return json(res, 403, {ok:false, code:"CCA_PERMISSION_DENIED"});
    }
    try {
      const requests = await database.reader.listServiceRequests({
        context: session.context, tenantId: session.tenantId, limit: 20,
      });
      return json(res, 200, {ok:true, requests});
    } catch {
      // Never disclose SQL, credentials, database names or internal context.
      return json(res, 503, {ok:false, code:"CCA_DATABASE_UNAVAILABLE"});
    }
  });
  return Object.freeze({
    server,
    async start({ host = "127.0.0.1", port = 0 } = {}) {
      // Explicit fail-closed private-only default until proxy and operator
      // identity integration undergo independent security review.
      if (host !== "127.0.0.1" || !Number.isInteger(port) ||
          port < 0 || port > 65535) throw new Error("CCA_HOSTED_PUBLIC_LISTENER_DISABLED");
      if (!await database.verify()) throw new Error("CCA_HOSTED_DATABASE_NOT_VERIFIED");
      await new Promise((resolve, reject) => {
        const onError = err => {server.removeListener("listening", onListening); reject(err);};
        const onListening = () => {server.removeListener("error", onError); resolve();};
        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(port, host);
      });
      ready = true;
      return server.address();
    },
    async stop() {
      ready = false;
      if (server.listening) await new Promise(resolve => server.close(resolve));
      if (typeof database.close === "function") await database.close();
    },
  });
}

module.exports = {createCcaHostedApp};
