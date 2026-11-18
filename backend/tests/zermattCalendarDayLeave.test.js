const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { calculateLeaveDays } = require("../src/services/leaveDayCalculator");
const ZERMATT_LEAVE_CALENDAR_RULES = require("../src/config/zermattLeaveCalendarRules");

const zermattPolicy = {
  entitlementRules: { unit: "CALENDAR_DAYS" },
  calendarRules: ZERMATT_LEAVE_CALENDAR_RULES,
};

test("Zermatt calendar leave includes weekends and excludes approved public holidays", () => {
  const result = calculateLeaveDays({
    startDate: "2026-10-01",
    endDate: "2026-10-05",
    policy: zermattPolicy,
    publicHolidays: ["2026-10-01"],
  });
  assert.equal(result.requestedUnits, 4);
  assert.equal(result.unit, "CALENDAR_DAYS");
  assert.equal(result.countWeekends, true);
  assert.equal(result.countPublicHolidays, false);
});

test("Zermatt excludes a public holiday even when it occurs on a weekend", () => {
  const result = calculateLeaveDays({
    startDate: "2026-11-14",
    endDate: "2026-11-16",
    policy: zermattPolicy,
    publicHolidays: ["2026-11-15"],
  });
  assert.equal(result.requestedUnits, 2);
});

test("non-Zermatt calendar-day policies retain default public-holiday inclusion absent explicit rules", () => {
  const result = calculateLeaveDays({
    startDate: "2026-10-01",
    endDate: "2026-10-02",
    policy: { entitlementRules: { unit: "CALENDAR_DAYS" } },
    publicHolidays: ["2026-10-01"],
  });
  assert.equal(result.requestedUnits, 2);
  assert.equal(result.countPublicHolidays, true);
});

test("explicit WORKING_DAYS policy can independently include or exclude weekends and holidays", () => {
  const result = calculateLeaveDays({
    startDate: "2026-10-01",
    endDate: "2026-10-05",
    policy: { entitlementRules: { unit: "WORKING_DAYS" }, calendarRules: {countWeekends: false, countPublicHolidays: false} },
    publicHolidays: ["2026-10-01"],
  });
  assert.equal(result.requestedUnits, 2);
});

test("Zermatt policy provisioning uses CALENDAR_DAYS consistently", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/services/zermattLeaveEntitlementService.js"), "utf8");
  assert.match(source, /entitlementRules:\s*\{[\s\S]*?unit: "CALENDAR_DAYS"/);
  assert.match(source, /defaultEntitlement: entitlement,\s*unit: "CALENDAR_DAYS"/);
  assert.doesNotMatch(source, /unit: "WORKING_DAYS"/);
  assert.deepEqual(ZERMATT_LEAVE_CALENDAR_RULES, {countWeekends:true,countPublicHolidays:false});
});
