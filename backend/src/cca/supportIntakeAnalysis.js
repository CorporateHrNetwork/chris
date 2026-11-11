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

const DRAFTS = Object.freeze({
  PAYROLL: "Thanks for reporting this payroll issue. Which payroll period and branch are affected, and what did you expect to see? A support reviewer can use those details to check the payroll workflow.",
  HR: "Thanks for contacting HR Support. Which HR screen or workflow are you using, and which step needs guidance? Please describe the issue without including personal employee information.",
  BILLING: "Thanks for contacting Billing Support. Please share the invoice reference or subscription period and describe the discrepancy. Leave out payment card and bank details.",
  TECHNICAL: "Thanks for reporting this technical issue. Please share the affected screen, when it occurred, and the exact error message if available. Leave out passwords and authenticator codes.",
  CUSTOMER_SUCCESS: "Thanks for reaching out. Please share the CHRiS workflow your team wants to learn, the intended audience, and the outcome you want. We can use those details to prepare a walkthrough.",
});

function draftSupportResponse({ analysis, assignee, description }) {
  if (!analysis || !ROUTES.some(route => route.category === analysis.category && route.agent === assignee)) return null;
  if (analysis.category === "PAYROLL" && /\bpayslips?\b/i.test(description) &&
      /\b(missing|unavailable|not (?:visible|showing|available)|can(?:not|'t) (?:find|see))\b/i.test(description)) {
    return "Thanks for reporting the missing payslip. Please confirm the payroll month, the branch, and whether the payslip is missing from Employee Self-Service or from a payroll export. A Payroll Support reviewer can then check whether the payslip was generated and made available.";
  }
  return DRAFTS[analysis.category];
}

module.exports = { ANALYSIS_AGENT, analyzeSupportRequest, draftSupportResponse };
