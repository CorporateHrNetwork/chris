const assert = require("node:assert/strict");
const test = require("node:test");
const {
  lagosToday, expectedReturnDate, summarizeReturn, missedDatesFor, assertLeaveReturnPayrollReady,
} = require("../src/services/leaveReturnPayrollService");

const request = {
  id: "leave-1", employeeId: "employee-1", endDate: "2026-10-30",
  status: "ACTIVE", employee: { employmentType: "FULL_TIME" },
};
const bounds = {
  start: new Date("2026-11-01"), end: new Date("2026-11-30"), today: "2026-11-08",
  attendance: new Map([["2026-11-02", "PRESENT"], ["2026-11-03", "REST_DAY"]]),
  holidays: new Set(["2026-11-05"]),
};

test("uses Lagos days and the day after the inclusive leave end", () => {
  assert.equal(lagosToday(new Date("2026-10-30T23:01:00Z")), "2026-10-31");
  assert.equal(expectedReturnDate(request.endDate).toISOString(), "2026-10-31T00:00:00.000Z");
  assert.equal(summarizeReturn({ ...bounds, request, today: "2026-10-31" }).elapsed, false);
});

test("splits periods, honors attendance and holidays, and excludes today or actual return", () => {
  const pending = summarizeReturn({ ...bounds, request });
  assert.equal(pending.pending, true);
  assert.deepEqual(pending.missedDates, ["2026-11-01", "2026-11-04", "2026-11-07"]);
  const returned = summarizeReturn({ ...bounds, request: { ...request, status: "COMPLETED", actualReturnDate: "2026-11-04" } });
  assert.equal(returned.pending, false);
  assert.deepEqual(returned.missedDates, ["2026-11-01"]);
  assert.deepEqual(missedDatesFor([pending, returned]), pending.missedDates);
  const onTime = summarizeReturn({ ...bounds, request: { ...request, status: "COMPLETED", actualReturnDate: "2026-10-31" } });
  assert.deepEqual(onTime.missedDates, []);
});

test("requires recorded absence for employees without the full-time workday convention", () => {
  const partTime = { ...request, employee: { employmentType: "Part-Time" } };
  const attendance = new Map([["2026-11-01", "ABSENT"]]);
  assert.deepEqual(summarizeReturn({ ...bounds, request: partTime, attendance }).missedDates, ["2026-11-01"]);
});

test("blocks payroll approval until confirmation and recalculation, then permits the fresh snapshot", async () => {
  const row = {
    employeeId: request.employeeId, employeeNumber: "TEST-1",
    periodStart: bounds.start, periodEnd: bounds.end, details: {},
  };
  let liveRequest = request;
  const db = {
    organization: { findUnique: async () => ({ slug: "zermatt-liquor-limited" }) },
    $queryRawUnsafe: async (sql) => sql.includes("payroll_run_lines") ? [row] : [],
    leaveRequest: { findMany: async () => [liveRequest] },
    attendanceRecord: { findMany: async () => [] },
    publicHoliday: { findMany: async () => [] },
  };
  const check = () => assertLeaveReturnPayrollReady({ db, organizationId: "test-tenant", runId: "test-run", today: bounds.today });
  await assert.rejects(check, { code: "PAYROLL_LEAVE_RETURN_UNCONFIRMED" });
  liveRequest = { ...request, status: "COMPLETED", actualReturnDate: "2026-11-02" };
  await assert.rejects(check, { code: "PAYROLL_LEAVE_RETURN_RECALCULATION_REQUIRED" });
  row.details.attendance = { leaveReturn: { missedDates: ["2026-11-01"], pending: false } };
  await check();
});
