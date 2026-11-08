"use strict";

const ANALYSIS_AGENT = "CCA Intake Analysis Agent";
const CLARIFICATION_AGENT = "Intake Clarification Agent";
const ROUTES = Object.freeze([
  { category: "PAYROLL", agent: "Payroll Support Agent",
    signals: /\b(payroll|payslips?|salar(?:y|ies)|paye|pension|statutory deductions?|transport support pay)\b/i },
  { category: "HR", agent: "HR Support Agent",
    signals: /\b(leave|attendance|onboarding|employee records?|employee profiles?|performance (?:reviews?|evaluations?)|worked days?|benefits?|loans?)\b/i },
  { category: "BILLING", agent: "Billing Support Agent",
    signals: /\b(subscriptions?|renewals?|invoices?|billing|licen[cs]e|charged twice)\b/i },
  { category: "TECHNICAL", agent: "Technical Support Agent",
    signals: /\b(sign[ -]?in|log[ -]?in|authenticator|mfa|password reset|outage|crash(?:ed|es|ing)?|blank (?:page|screen)|server (?:error|unavailable)|error (?:code|[45]\d\d))\b/i },
  { category: "CUSTOMER_SUCCESS", agent: "Customer Success Agent",
    signals: /\b(train(?:ing)?|book (?:a )?demo|product walkthrough|implementation guidance|adoption)\b/i },
]);

function analyzeSupportRequest(description) {
  const text = description.normalize("NFKC").replace(/[‘’]/g, "'");
  const matches = ROUTES.filter(route => route.signals.test(text));
  if (matches.length === 1) {
    const [{ category, agent }] = matches;
    return { category, agent, reason: "The request matches the " + category.toLowerCase().replace("_", " ") + " routing rules." };
  }
  return {
    category: "CLARIFICATION", agent: CLARIFICATION_AGENT,
    reason: matches.length ? "The request matches multiple support areas." : "The request does not identify a support area.",
    question: matches.length
      ? "Which issue should we address first, and what outcome do you need?"
      : "Which CHRiS feature is affected, what were you trying to do, and what happened?",
  };
}

module.exports = { ANALYSIS_AGENT, analyzeSupportRequest };
