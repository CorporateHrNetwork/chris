"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { analyzeSupportRequest } = require("../src/cca/supportIntakeAnalysis");

test("clear support requests route to their corresponding specialist", () => {
  for (const [message, agent] of [
    ["Our December payroll payslips are missing", "Payroll Support Agent"],
    ["I need help approving annual leave", "HR Support Agent"],
    ["I cannot sign in with my authenticator", "Technical Support Agent"],
    ["Our subscription renewal invoice looks wrong", "Billing Support Agent"],
    ["We need training for our new team", "Customer Success Agent"],
  ]) assert.equal(analyzeSupportRequest(message).agent, agent);
});

test("ambiguous requests are assigned for clarification, with a question", () => {
  for (const message of ["Please help urgently", "I cannot log in and my payslip is missing"]) {
    const result = analyzeSupportRequest(message);
    assert.equal(result.agent, "Intake Clarification Agent");
    assert.match(result.question, /\?$/);
  }
});
