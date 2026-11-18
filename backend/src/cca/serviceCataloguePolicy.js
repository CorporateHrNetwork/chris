"use strict";

// CCA pre-launch catalogue. POLICY ONLY: no routes, external providers,
// provisioning, payments, certificate issuance or DNS changes.
// All entries must remain REQUEST_ONLY until their provider-specific workflows
// pass independent tests and a separate, audited launch review is approved.
const { resolveIntake } = require("./tenantIntakePolicy");

const STATUS = "REQUEST_ONLY";
const SERVICES = Object.freeze({
  MANAGED_POSTGRESQL: Object.freeze({ title: "Managed PostgreSQL", category: "DATABASE", status: STATUS }),
  DOMAIN_REGISTRATION: Object.freeze({ title: "Domain Registration & Transfers", category: "DOMAIN", status: STATUS }),
  DNS_MANAGEMENT: Object.freeze({ title: "Managed DNS", category: "DOMAIN", status: STATUS }),
  SSL_TLS_CERTIFICATE: Object.freeze({ title: "SSL/TLS Certificate Management", category: "SECURITY", status: STATUS }),
  MANAGED_SERVER_VPS: Object.freeze({ title: "Managed Servers & VPS", category: "SERVER", status: STATUS }),
  APPLICATION_HOSTING: Object.freeze({ title: "Web & Application Hosting", category: "HOSTING", status: STATUS }),
  BACKUP_RECOVERY: Object.freeze({ title: "Encrypted Backup & Recovery", category: "RECOVERY", status: STATUS }),
  MONITORING_SUPPORT: Object.freeze({ title: "Infrastructure Monitoring & Support", category: "SUPPORT", status: STATUS }),
});
const ALLOWED_REQUEST_FIELDS = Object.freeze(["serviceCode", "description", "idempotencyKey"]);

function catalogue() {
  return Object.freeze(Object.entries(SERVICES).map(([code, service]) =>
    Object.freeze({ code, title: service.title, category: service.category, status: STATUS,
      provisionable: false, payable: false, renewalAutomated: false })
  ));
}

// Returns an intake candidate for a separately authenticated CCA ticket
// workflow. It does not create a record or mutate a provider.
// Tenant identity always comes from the trusted identity object, NOT payload.
function evaluateServiceRequest({ channel, payload, identity } = {}) {
  const fail = code => Object.freeze({ accepted: false, code });
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return fail("INVALID_CATALOGUE_REQUEST");
  }
  const keys = Object.keys(payload);
  if (keys.some(key => !ALLOWED_REQUEST_FIELDS.includes(key))) {
    // Fail closed on credentials, automatic provisioning and price instructions.
    return fail("UNSUPPORTED_CATALOGUE_FIELD");
  }
  if (typeof payload.serviceCode !== "string" ||
      !Object.hasOwn(SERVICES, payload.serviceCode)) {
    return fail("UNKNOWN_SERVICE");
  }
  const intake = resolveIntake({
    channel,
    payload: {
      description: payload.description,
      idempotencyKey: payload.idempotencyKey,
    },
    identity,
  });
  if (!intake.accepted) return fail(intake.code);
  return Object.freeze({
    accepted: true,
    code: "REQUEST_AWAITING_HUMAN_REVIEW",
    serviceCode: payload.serviceCode,
    serviceTitle: SERVICES[payload.serviceCode].title,
    serviceStatus: STATUS,
    tenantId: intake.tenantId,
    requesterSubjectId: intake.requesterSubjectId,
    channel: intake.channel,
    idempotencyKey: intake.idempotencyKey,
    description: intake.description,
    provisionable: false,
    payable: false,
    providerAction: "NONE",
    humanApprovalRequired: true,
  });
}

module.exports = { SERVICES, STATUS, catalogue, evaluateServiceRequest };
