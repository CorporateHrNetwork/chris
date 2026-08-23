const MS_PER_DAY = 86400000;

function utcDay(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("INVALID_LEAVE_DATES");
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function dateKey(value) {
  return utcDay(value).toISOString().slice(0, 10);
}

function calculateLeaveDays({ startDate, endDate, policy, publicHolidays = [], scheduleWeekdays }) {
  const start = utcDay(startDate);
  const end = utcDay(endDate);
  if (end < start) throw new Error("INVALID_LEAVE_DATES");

  const entitlementUnit = String(policy?.entitlementRules?.unit || "WORKING_DAYS").toUpperCase();
  const rules = policy?.calendarRules || {};
  const countWeekends = entitlementUnit === "CALENDAR_DAYS" || rules.countWeekends === true;
  const countPublicHolidays = entitlementUnit === "CALENDAR_DAYS" || rules.countPublicHolidays === true;
  const weekdays = Array.isArray(scheduleWeekdays) && scheduleWeekdays.length
    ? new Set(scheduleWeekdays.map(Number))
    : new Set([1, 2, 3, 4, 5]);
  const holidays = new Set(publicHolidays.map(dateKey));
  let units = 0;
  for (let day = new Date(start); day <= end; day = new Date(day.getTime() + MS_PER_DAY)) {
    if (!countWeekends && !weekdays.has(day.getUTCDay())) continue;
    if (!countPublicHolidays && holidays.has(dateKey(day))) continue;
    units += 1;
  }
  return {
    requestedUnits: units,
    dateSemantic: "LEAVE_END_DATE_INCLUSIVE",
    unit: entitlementUnit,
    countWeekends,
    countPublicHolidays,
    scheduleSource: scheduleWeekdays?.length ? "EMPLOYEE_WORK_SCHEDULE" : "STANDARD_MONDAY_FRIDAY",
  };
}

module.exports = { calculateLeaveDays, dateKey, utcDay };
