"use strict";

// Zermatt effective-dated employee exceptions, keyed by authoritative employee number.
// These are entitlement instructions, not payroll transactions or payment approvals.
const ZERMATT_SLUG = "zermatt-liquor-limited";
const FULL_TIME_STATUTORY_EXEMPTIONS = Object.freeze(new Set(["ZLL000046", "ZLL000053"]));
const HISTORICAL_EOSB = Object.freeze({
  ZLL000057: Object.freeze({ startDate: "2021-04-22", endDate: "2026-06-30", monthlyGross: 81956 }),
  ZLL000178: Object.freeze({ startDate: "2025-01-22", endDate: "2026-05-14", monthlyGross: 70560 }),
});
const EFFECTIVE_FROM = "2026-11-17";

function dateOnly(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function statutoryExemption({ organizationSlug, employeeNumber, employmentType, asOf }) {
  const permitted = organizationSlug === ZERMATT_SLUG
    && FULL_TIME_STATUTORY_EXEMPTIONS.has(String(employeeNumber || "").toUpperCase())
    && String(employmentType || "").replace(/[_-]/g, " ").trim().toUpperCase() === "FULL TIME"
    && (dateOnly(asOf) || "9999-12-31") >= EFFECTIVE_FROM;
  return permitted
    ? { exempt: true, payeExempt: true, pensionExempt: true, employerPensionExempt: false, nhfExempt: true,
        source: "ZERMATT_APPROVED_EMPLOYEE_EXCEPTION", reason: "Employee-specific full-time statutory exemption." }
    : null;
}

function historicalEosb({ organizationSlug, employeeNumber, asOf }) {
  if (organizationSlug !== ZERMATT_SLUG) return null;
  const rule = HISTORICAL_EOSB[String(employeeNumber || "").toUpperCase()];
  if (!rule) return null;
  const requested = dateOnly(asOf);
  if (requested && requested < rule.startDate) return null;
  const endDate = requested && requested < rule.endDate ? requested : rule.endDate;
  return { ...rule, endDate, source: "ZERMATT_APPROVED_HISTORICAL_FULL_TIME_SERVICE" };
}

module.exports = { ZERMATT_SLUG, EFFECTIVE_FROM, statutoryExemption, historicalEosb };
