const assert = require("node:assert/strict");
const fs = require("node:fs");
const { calculateLeaveDays } = require("../src/services/leaveDayCalculator");

const working = { entitlementRules: { unit: "WORKING_DAYS" }, calendarRules: { countWeekends: false, countPublicHolidays: false } };
assert.equal(calculateLeaveDays({ startDate: "2026-08-28", endDate: "2026-08-31", policy: working }).requestedUnits, 2);
assert.equal(calculateLeaveDays({ startDate: "2026-08-28", endDate: "2026-08-31", policy: working, publicHolidays: ["2026-08-31"] }).requestedUnits, 1);
const calendar = { entitlementRules: { unit: "CALENDAR_DAYS" }, calendarRules: {} };
assert.equal(calculateLeaveDays({ startDate: "2026-08-28", endDate: "2026-08-31", policy: calendar }).requestedUnits, 4);

const routes = fs.readFileSync(require.resolve("../src/routes/leaveRoutes"), "utf8");
const policyBlock = routes.slice(routes.indexOf('"/policies"'), routes.indexOf('"/balances/'));
assert.equal((policyBlock.match(/requirePermission\("leave\.manage"\)/g) || []).length, 5);
assert.doesNotMatch(policyBlock, /requirePermission\("employees\.edit"\)/);

const balanceService = fs.readFileSync(require.resolve("../src/services/leaveBalanceService"), "utf8");
const leaveService = fs.readFileSync(require.resolve("../src/services/leaveService"), "utf8");
assert.match(balanceService, /usedDaysOverride/);
assert.match(balanceService, /supportsManualUsedDays/);
assert.match(leaveService, /recordManualLeaveUsage/);
assert.match(leaveService, /MANUAL_HISTORICAL_USED_DAYS_RECORDED/);
assert.match(leaveService, /usedDays < previouslyRecorded/);
const manualUsageRoute = routes.slice(
  routes.indexOf('"/employees/:employeeNumber/used-days"'),
  routes.indexOf('"/employees/:employeeNumber/used-days"') + 500
);
assert.match(manualUsageRoute, /requirePermission\("leave\.manage"\)/);
console.log("PASS: leave request addendum backend tests passed.");
