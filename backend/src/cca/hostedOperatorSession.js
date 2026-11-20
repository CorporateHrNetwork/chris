"use strict";

// Adapter contract for an independently verified CCA operator session.
// verifyToken MUST perform cryptographic verification, expiry and revocation
// against an independently administered CCA identity provider. This module
// neither issues sessions nor trusts headers or caller-selected tenant IDs.
const {canAccessTenantCase, PERMISSIONS} = require("./controlPlanePolicy");

function createCcaHostedSessionResolver({verifyToken, cookieName="cca_hosted_sid"}={}) {
  if (typeof verifyToken !== "function" ||
      !/^cca_[a-z0-9_]{3,40}$/.test(cookieName)) {
    throw new Error("CCA_HOSTED_SESSION_VERIFIER_REQUIRED");
  }
  return async function resolveOperatorSession(req) {
    if (!req || typeof req !== "object") return null;
    if (req.headers?.authorization || req.headers?.["x-user-id"] ||
        req.headers?.["x-tenant-id"] || req.headers?.["x-cca-user"]) return null;
    const raw=req.headers?.cookie;
    if (typeof raw !== "string" || raw.length > 4096) return null;
    const values=raw.split(";").map(x=>x.trim()).filter(Boolean);
    const found=values.filter(value=>value.startsWith(cookieName+"="));
    if (found.length !== 1) return null;
    const token=found[0].slice(cookieName.length+1);
    if (token.length < 32 || token.length > 2048 ||
        !(/^[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$/.test(token) ||
          /^[A-Za-z0-9_-]+$/.test(token))) return null;
    let proof;
    try {proof=await verifyToken(token);} catch {return null;}
    if (!proof || proof.verified !== true || proof.revoked === true ||
        proof.scope !== "CCA" || proof.subjectType !== "OPERATOR" ||
        !Number.isFinite(proof.expiresAtMs) || proof.expiresAtMs <= Date.now() ||
        typeof proof.tenantId !== "string" ||
        !Array.isArray(proof.roles) || proof.roles.length===0) return null;
    // Grants must originate from verified provider claims, not request input.
    const context=proof.context;
    if (!context || context.platformIdentityVerified !== true ||
        context.platformScope !== "CCA" ||
        !canAccessTenantCase(context,PERMISSIONS.TICKETS_READ,proof.tenantId)) return null;
    return Object.freeze({accepted:true,context,tenantId:proof.tenantId});
  };
}
module.exports={createCcaHostedSessionResolver};
