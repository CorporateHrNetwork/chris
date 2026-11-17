"use strict";

// Zermatt effective-dated employee exceptions, keyed by authoritative employee number.
// These are entitlement instructions, not payroll transactions or payment approvals.
const ZERMATT_SLUG = "zermatt-liquor-limited";
const FULL_TIME_STATUTORY_EXEMPTIONS = Object.freeze(new Set(["ZLL000046", "ZLL000053"]));
const HISTORICAL_EOSB = Object.freeze({
  ZLL000057: Object.freeze({ startDate: "2021-04-22", endDate: "2026-06-30", monthlyGross: 81956 }),
  ZLL000178: Object.freeze({ startDate: "2025-01-22", endDate: "2026-05-14", monthlyGross: 70560 }),
});
// The HR-approved deduction exemption covers the entire November payroll month.
// Employee Full-Time classification separately takes effect from 17 November 2026.
const EFFECTIVE_FROM = "2026-11-01";
const FULL_TIME_CLASSIFICATION_FROM = "2026-11-17";

function dateOnly(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function statutoryExemption({ organizationSlug, employeeNumber, employmentType, asOf }) {
  const permitted = organizationSlug === ZERMATT_SLUG
    && FULL_TIME_STATUTORY_EXEMPTIONS.has(String(employeeNumber || "").toUpperCase())
    && String(employmentType || "").replace(/[_-]/g, " ").trim().toUpperCase() === "FULL TIME"
    && Boolean(dateOnly(asOf))
    && dateOnly(asOf) >= EFFECTIVE_FROM;
  return permitted
    ? { exempt: true, payeExempt: true, pensionExempt: true, employerPensionExempt: false, nhfExempt: true,
        source: "ZERMATT_APPROVED_EMPLOYEE_EXCEPTION", exemptionEffectiveFrom: EFFECTIVE_FROM,
        employmentClassificationEffectiveFrom: FULL_TIME_CLASSIFICATION_FROM,
        reason: "Approved full-November 2026 employee statutory deduction exemption for named full-time staff." }
    : null;
}

function leaveConversionReview({ organizationSlug, employeeNumber, leaveYear, employmentType }) {
  const number = String(employeeNumber || "").toUpperCase();
  const affected = organizationSlug === ZERMATT_SLUG
    && FULL_TIME_STATUTORY_EXEMPTIONS.has(number)
    && Number(leaveYear) === 2026
    && String(employmentType || "").replace(/[_-]/g, " ").trim().toUpperCase() === "FULL TIME";
  if (!affected) return null;
  return {
    status: "APPROVED_FULL_ANNUAL_ENTITLEMENT",
    employeeNumber: number,
    leaveYear: 2026,
    fullTimeEffectiveFrom: FULL_TIME_CLASSIFICATION_FROM,
    levelNumber: number === "ZLL000053" ? 201 : 202,
    annualEntitlementDays: number === "ZLL000053" ? 14 : 16,
    proration: "NONE",
    reason: "HR approved full 2026 annual leave entitlement for this full-time conversion without proration."
  };
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

module.exports = { ZERMATT_SLUG, EFFECTIVE_FROM, FULL_TIME_CLASSIFICATION_FROM, statutoryExemption, leaveConversionReview, historicalEosb };
