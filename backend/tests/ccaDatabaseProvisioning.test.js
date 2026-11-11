"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createDemoState } = require("../../tools/cca-local-demo/server");

test("CCA routes fictional database requests to Database Services", () => {
  const demo = createDemoState();
  const result = demo.submit("demo-cedar", "Please provision a PostgreSQL database for our staging application.");
  assert.equal(result.ok, true);
  const ticket = demo.state("demo-cedar").cases.find(item => item.id === result.case.id);
  assert.equal(ticket.status, "ASSIGNED");
  assert.equal(ticket.analysis.category, "DATABASE_PROVISIONING");
  assert.equal(ticket.assignee, "Database Services Agent");
  assert.match(ticket.draft, /operator can review/);
  assert.equal(demo.state("demo-atlas").cases.some(item => item.id === ticket.id), false);
});
