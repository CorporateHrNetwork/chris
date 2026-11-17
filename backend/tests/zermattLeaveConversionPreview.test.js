const test = require("node:test");
const assert = require("node:assert/strict");
const { previewConversionLeave } = require("../src/services/zermattLeaveConversionPreview");

test("Zermatt L2 2026 conversion preview is read-only and includes both effective and final dates", () => {
  for (const employeeNumber of ["ZLL000046", "ZLL000053"]) {
    const result = previewConversionLeave({
      employeeNumber, leaveYear: 2026, effectiveFrom: "2026-11-17", annualEntitlement: 16,
    });
    assert.equal(result.calendarDaysInYear, 365);
    assert.equal(result.remainingCalendarDays, 45);
    assert.equal(result.annualEntitlement, 16);
    assert.equal(result.unroundedProportionalDays, 1.9726);
    assert.equal(result.wholeDayFloor, 1);
    assert.equal(result.halfDayNearest, 2);
    assert.equal(result.status, "PREVIEW_ONLY_POLICY_DECISION_REQUIRED");
  }
});

test("conversion preview rejects invalid dates and does not assume a policy decision", () => {
  assert.throws(() => previewConversionLeave({leaveYear:2026,effectiveFrom:"2026-11-31",annualEntitlement:16}), /INVALID_CONVERSION_DATE/);
  assert.throws(() => previewConversionLeave({leaveYear:2026,effectiveFrom:"2027-01-01",annualEntitlement:16}), /CONVERSION_OUTSIDE_LEAVE_YEAR/);
  const result = previewConversionLeave({leaveYear:2026,effectiveFrom:"2026-11-17",annualEntitlement:16,previousUsed:1,pendingUnits:1});
  assert.equal(result.existingUsed,1);
  assert.equal(result.pendingUnits,1);
  assert.match(result.warning,/must authorize/);
});
