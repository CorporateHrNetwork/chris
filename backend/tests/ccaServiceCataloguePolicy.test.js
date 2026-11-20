"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { catalogue, evaluateServiceRequest, SERVICES } = require("../src/cca/serviceCataloguePolicy");

const identity = {
  verified: true,
  tenantId: "fictional-tenant-a",
  subjectId: "fictional-user-a",
  channel: "CHRIS_PORTAL",
  revoked: false,
  tenantActive: true,
};
const request = {
  serviceCode: "SSL_TLS_CERTIFICATE",
  description: "Please review a fictional test certificate management request.",
  idempotencyKey: "fictional-request-001",
};

test("complete launch catalogue is explicitly request-only, never provisionable or payable", () => {
  const items = catalogue();
  assert.equal(items.length, 8);
  assert.equal(new Set(items.map(item => item.code)).size, 8);
  assert.ok(["DOMAIN_REGISTRATION", "DNS_MANAGEMENT", "SSL_TLS_CERTIFICATE",
    "MANAGED_SERVER_VPS", "APPLICATION_HOSTING", "MANAGED_POSTGRESQL",
    "BACKUP_RECOVERY", "MONITORING_SUPPORT"].every(code => Object.hasOwn(SERVICES, code)));
  for (const entry of items) {
    assert.equal(entry.status, "REQUEST_ONLY");
    assert.equal(entry.provisionable, false);
    assert.equal(entry.payable, false);
    assert.equal(entry.renewalAutomated, false);
    assert.equal(Object.isFrozen(entry), true);
  }
});

test("verified fictional tenant can request human review but cannot trigger fulfilment", () => {
  const result = evaluateServiceRequest({ channel: "CHRIS_PORTAL", identity, payload: request });
  assert.equal(result.accepted, true);
  assert.equal(result.code, "REQUEST_AWAITING_HUMAN_REVIEW");
  assert.equal(result.tenantId, identity.tenantId);
  assert.equal(result.serviceCode, request.serviceCode);
  assert.equal(result.providerAction, "NONE");
  assert.equal(result.provisionable, false);
  assert.equal(result.payable, false);
  assert.equal(result.humanApprovalRequired, true);
  assert.equal(Object.isFrozen(result), true);
});

test("client-controlled tenant, provider actions, prices, certificates and secrets rejected", () => {
  for (const extra of [
    { tenantId: "fictional-tenant-b" },
    { provisionNow: true },
    { approvalGranted: true },
    { price: 0 },
    { providerToken: "fictional-token" },
    { dnsRecords: [{type: "A", name: "fake"}] },
    { certificatePrivateKey: "fictional-key" },
  ]) {
    const result = evaluateServiceRequest({
      channel: "CHRIS_PORTAL", identity, payload: { ...request, ...extra },
    });
    assert.deepEqual(result, { accepted: false, code: "UNSUPPORTED_CATALOGUE_FIELD" });
  }
});

test("unverified, revoked, inactive and mismatched tenant identities denied", () => {
  const bad = [
    null,
    { ...identity, verified: false },
    { ...identity, revoked: true },
    { ...identity, tenantActive: false },
    { ...identity, channel: "EMAIL" },
  ];
  for (const attempted of bad) {
    const result = evaluateServiceRequest({ channel: "CHRIS_PORTAL", identity: attempted, payload: request });
    assert.equal(result.accepted, false);
  }
});

test("external channels require verified sender binding and consent", () => {
  const external = { ...identity, channel: "EMAIL", consentConfirmed: true,
    bindingId: "fictional-binding", externalSenderVerified: true };
  assert.equal(evaluateServiceRequest({ channel: "EMAIL", identity: external, payload: request }).accepted, true);
  assert.equal(evaluateServiceRequest({ channel: "EMAIL", identity: { ...external, consentConfirmed: false }, payload: request }).accepted, false);
  assert.equal(evaluateServiceRequest({ channel: "EMAIL", identity: { ...external, externalSenderVerified: false }, payload: request }).accepted, false);
});

test("unknown services, missing descriptions, invalid idempotency and unknown channels fail closed", () => {
  for (const payload of [
    { ...request, serviceCode: "FREE_VPS_NOW" },
    { ...request, description: "" },
    { ...request, idempotencyKey: "" },
    null,
    [],
  ]) {
    assert.equal(evaluateServiceRequest({ channel: "CHRIS_PORTAL", identity, payload }).accepted, false);
  }
  assert.equal(evaluateServiceRequest({ channel: "HTTP_UNKNOWN", identity, payload: request }).accepted, false);
});

test("all catalogue services accept safe fictional request without side effects", () => {
  for (const code of Object.keys(SERVICES)) {
    const result = evaluateServiceRequest({
      channel: "CHRIS_PORTAL", identity,
      payload: { ...request, serviceCode: code, idempotencyKey: "fictional-" + code },
    });
    assert.equal(result.accepted, true);
    assert.equal(result.serviceStatus, "REQUEST_ONLY");
    assert.equal(result.providerAction, "NONE");
  }
});
