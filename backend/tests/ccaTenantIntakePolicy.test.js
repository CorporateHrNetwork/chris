"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveIntake } = require("../src/cca/tenantIntakePolicy");

const portal = {
  channel: "CHRIS_PORTAL", payload: { description: "Payroll report issue", idempotencyKey: "case-001" },
  identity: { verified: true, channel: "CHRIS_PORTAL", tenantId: "tenant-A",
    subjectId: "requester-A", tenantActive: true },
};
test("verified portal request is assigned only to its verified organization", () => {
  const result = resolveIntake(portal);
  assert.equal(result.accepted, true);
  assert.equal(result.tenantId, "tenant-A");
});
test("cannot route WhatsApp requests to a default organization", () => {
  const result = resolveIntake({ channel: "WHATSAPP", payload: portal.payload,
    identity: { channel: "WHATSAPP", subjectId: "phone-1", tenantActive: true } });
  assert.equal(result.accepted, false);
  assert.equal(result.tenantId, undefined);
});
test("channel mismatch and unverified senders are denied", () => {
  assert.equal(resolveIntake({ ...portal, channel: "EMAIL" }).accepted, false);
  const wa = { ...portal, channel: "WHATSAPP", identity: {
    ...portal.identity, channel: "WHATSAPP", bindingId: "verified-binding",
    externalSenderVerified: true, consentConfirmed: false,
  }};
  assert.equal(resolveIntake(wa).code, "CHANNEL_BINDING_UNVERIFIED");
  assert.equal(resolveIntake({ ...wa, identity: { ...wa.identity, consentConfirmed: true }}).accepted, true);
});
test("revocation and inactive tenant are denied even with previously verified identity", () => {
  assert.equal(resolveIntake({ ...portal, identity: { ...portal.identity, revoked: true }}).accepted, false);
  assert.equal(resolveIntake({ ...portal, identity: { ...portal.identity, tenantActive: false }}).accepted, false);
});
test("unknown channels, empty request, and missing idempotency key are denied", () => {
  assert.equal(resolveIntake({ ...portal, channel: "SMS" }).accepted, false);
  assert.equal(resolveIntake({ ...portal, payload: { ...portal.payload, description: "" } }).accepted, false);
  assert.equal(resolveIntake({ ...portal, payload: { description: "Issue" } }).accepted, false);
});
