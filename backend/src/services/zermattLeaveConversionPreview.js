"use strict";

// Read-only illustration of the mid-year full-time conversion window.
// This does not determine HR policy, create entitlements or write leave balances.
function isoDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) throw new Error("INVALID_CONVERSION_DATE");
  const time = Date.parse(value + "T00:00:00.000Z");
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) throw new Error("INVALID_CONVERSION_DATE");
  return time;
}
function previewConversionLeave({ employeeNumber, leaveYear, effectiveFrom, annualEntitlement, previousUsed = 0, pendingUnits = 0 }) {
  const year = Number(leaveYear);
  if (!Number.isInteger(year) || year < 2000 || year > 2200) throw new Error("INVALID_LEAVE_YEAR");
  const startOfYear = Date.UTC(year, 0, 1), endExclusive = Date.UTC(year + 1, 0, 1);
  const from = isoDay(effectiveFrom);
  if (from < startOfYear || from >= endExclusive) throw new Error("CONVERSION_OUTSIDE_LEAVE_YEAR");
  const yearlyDays = (endExclusive - startOfYear) / 86400000;
  const remainingCalendarDays = (endExclusive - from) / 86400000;
  const annual = Number(annualEntitlement), used = Number(previousUsed), pending = Number(pendingUnits);
  if (![annual, used, pending].every(v => Number.isFinite(v) && v >= 0)) throw new Error("INVALID_LEAVE_UNITS");
  const unroundedProportionalDays = annual * remainingCalendarDays / yearlyDays;
  return {
    employeeNumber: String(employeeNumber || "").toUpperCase(),
    leaveYear: year, effectiveFrom,
    annualEntitlement: annual,
    calendarDaysInYear: yearlyDays, remainingCalendarDays,
    unroundedProportionalDays: Math.round(unroundedProportionalDays * 10000) / 10000,
    wholeDayFloor: Math.floor(unroundedProportionalDays),
    halfDayNearest: Math.round(unroundedProportionalDays * 2) / 2,
    existingUsed: used, pendingUnits: pending,
    status: "PREVIEW_ONLY_POLICY_DECISION_REQUIRED",
    warning: "Illustration only. The active leave policy must authorize the conversion proration and rounding before an audited balance can be written."
  };
}
module.exports = { previewConversionLeave };
