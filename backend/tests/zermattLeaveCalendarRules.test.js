const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ZERMATT_LEAVE_CALENDAR_RULES,
} = require("../src/services/zermattLeaveEntitlementService");
const { calculateLeaveDays } = require("../src/services/leaveDayCalculator");

test("ZERMATT leave policies count weekends and off-days but exclude public holidays", () => {
  assert.deepEqual(ZERMATT_LEAVE_CALENDAR_RULES, {
    countWeekends: true,
    countPublicHolidays: false,
  });

  const result = calculateLeaveDays({
    startDate: "2026-10-25T00:00:00.000Z",
    endDate: "2026-11-04T00:00:00.000Z",
    policy: {
      entitlementRules: { unit: "WORKING_DAYS" },
      calendarRules: ZERMATT_LEAVE_CALENDAR_RULES,
    },
    publicHolidays: ["2026-10-28T00:00:00.000Z"],
  });

  assert.equal(result.requestedUnits, 10);
  assert.equal(result.countWeekends, true);
  assert.equal(result.countPublicHolidays, false);
});

test("ZERMATT leave policy configuration retains WORKING_DAYS and explicitly sets calendar rules", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const source = fs.readFileSync(
    path.resolve(__dirname, "../src/services/zermattLeaveEntitlementService.js"),
    "utf8"
  );

  assert.match(source, /unit: "WORKING_DAYS"/);
  assert.match(source, /calendarRules: \{ \.\.\.ZERMATT_LEAVE_CALENDAR_RULES \}/);
});


test("live policy updater is ZERMATT-scoped, preview-first, and audited", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const script = fs.readFileSync(
    path.resolve(__dirname, "../scripts/apply-zermatt-leave-calendar-rules.cjs"),
    "utf8"
  );

  assert.match(script, /process\.argv\.includes\("--apply"\)/);
  assert.match(script, /where: \{ slug: ZERMATT_SLUG \}/);
  assert.match(script, /Database Writes Issued: 0/);
  assert.match(script, /organizationAudit\.create/);
  assert.match(script, /isolationLevel: "Serializable"/);
  assert.match(script, /ZERMATT_LEAVE_RULES_ACTOR_EMAIL_REQUIRED/);
});
