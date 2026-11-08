const { dateKey, utcDay } = require("./leaveDayCalculator");

const DAY = 86400000;
const ZERMATT_SLUG = "zermatt-liquor-limited";

function lagosToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

function expectedReturnDate(endDate) {
  return new Date(utcDay(endDate).getTime() + DAY);
}

function summarizeReturn({ request, start, end, today, attendance, holidays }) {
  const due = expectedReturnDate(request.endDate);
  const pending = request.status === "ACTIVE";
  const stop = pending ? utcDay(today) : utcDay(request.actualReturnDate);
  const first = Math.max(due.getTime(), start.getTime());
  const limit = Math.min(stop.getTime(), end.getTime() + DAY);
  const fullTime = String(request.employee.employmentType || "").toLowerCase().replace(/[\s_-]+/g, "") === "fulltime";
  const missedDates = [];
  for (let time = first; time < limit; time += DAY) {
    const day = dateKey(time);
    const status = attendance.get(day);
    if (holidays.has(day)) continue;
    // Recorded attendance takes precedence. Where daily rosters are absent,
    // use the existing Zermatt full-time convention of one off day per seven.
    if (status === "ABSENT" || (!status && fullTime && ((time - due.getTime()) / DAY + 1) % 7 !== 0)) {
      missedDates.push(day);
    }
  }
  return { requestId: request.id, expectedReturn: dateKey(due), pending, elapsed: first < limit, missedDates };
}

async function loadReturnDeficits({ db, organizationId, requests, start, end, today = lagosToday() }) {
  if (!requests.length) return new Map();
  const [records, holidayRows] = await Promise.all([
    db.attendanceRecord.findMany({
      where: {
        organizationId, employeeId: { in: [...new Set(requests.map(row => row.employeeId))] },
        attendanceDate: { gte: start, lt: new Date(end.getTime() + DAY) },
      },
      select: { employeeId: true, attendanceDate: true, status: true },
    }),
    db.publicHoliday.findMany({
      where: { organizationId, holidayDate: { gte: start, lt: new Date(end.getTime() + DAY) } },
      select: { holidayDate: true },
    }),
  ]);
  const attendance = new Map();
  for (const row of records) {
    if (!attendance.has(row.employeeId)) attendance.set(row.employeeId, new Map());
    attendance.get(row.employeeId).set(dateKey(row.attendanceDate), row.status);
  }
  const holidays = new Set(holidayRows.map(row => dateKey(row.holidayDate)));
  const summaries = new Map();
  for (const request of requests) {
    const item = summarizeReturn({ request, start, end, today, holidays, attendance: attendance.get(request.employeeId) || new Map() });
    if (!item.elapsed) continue;
    if (!summaries.has(request.employeeId)) summaries.set(request.employeeId, []);
    summaries.get(request.employeeId).push(item);
  }
  return summaries;
}

async function payrollReturnDeficits({ db, organizationId, employeeIds, start, end, today }) {
  if (!employeeIds.length) return new Map();
  const requests = await db.leaveRequest.findMany({
    where: {
      organizationId, employeeId: { in: employeeIds }, endDate: { lt: end }, commencementDate: { not: null },
      OR: [
        { status: "ACTIVE", returnedAt: null, employee: { status: "LEAVE" } },
        { status: "COMPLETED", actualReturnDate: { gt: start } },
      ],
    },
    select: { id: true, employeeId: true, endDate: true, status: true, actualReturnDate: true, employee: { select: { employmentType: true } } },
  });
  return loadReturnDeficits({ db, organizationId, requests, start, end, today });
}

function missedDatesFor(items = []) {
  return [...new Set(items.flatMap(item => item.missedDates))].sort();
}

async function lockLeaveReturnPayroll(db, organizationId) {
  await db.$queryRawUnsafe(
    "SELECT 1 FROM pg_advisory_xact_lock(hashtext($1), hashtext('zermatt_leave_return_payroll'))",
    organizationId
  );
}

async function assertLeaveReturnPayrollReady({ db, organizationId, runId, today }) {
  const organization = await db.organization.findUnique({ where: { id: organizationId }, select: { slug: true } });
  if (organization?.slug !== ZERMATT_SLUG) return;
  await lockLeaveReturnPayroll(db, organizationId);
  const rows = await db.$queryRawUnsafe(
    `SELECT pl."employeeId", pl."employeeNumber", pl."details", p."periodStart", p."periodEnd"
       FROM "payroll_run_lines" pl
       JOIN "payroll_runs" r ON r."id"=pl."runId" AND r."organizationId"=pl."organizationId"
       JOIN "payroll_periods" p ON p."id"=r."periodId" AND p."organizationId"=r."organizationId"
      WHERE pl."organizationId"=$1 AND pl."runId"=$2`,
    organizationId, runId
  );
  if (!rows.length) return;
  const deficits = await payrollReturnDeficits({
    db, organizationId, employeeIds: rows.map(row => row.employeeId),
    start: utcDay(rows[0].periodStart), end: utcDay(rows[0].periodEnd), today,
  });
  for (const row of rows) {
    const items = deficits.get(row.employeeId) || [];
    const prior = row.details?.attendance?.leaveReturn;
    const pending = items.some(item => item.pending);
    const changed = prior?.pending || JSON.stringify(missedDatesFor(items)) !== JSON.stringify(prior?.missedDates || []);
    if (pending || changed) {
      throw Object.assign(new Error(pending
        ? `Confirm the return to work for ${row.employeeNumber}, then recalculate payroll.`
        : `Leave-return attendance changed for ${row.employeeNumber}. Recalculate payroll before proceeding.`), {
        code: pending ? "PAYROLL_LEAVE_RETURN_UNCONFIRMED" : "PAYROLL_LEAVE_RETURN_RECALCULATION_REQUIRED",
        statusCode: 409,
      });
    }
  }
}

module.exports = {
  ZERMATT_SLUG, lagosToday, expectedReturnDate, summarizeReturn, loadReturnDeficits, payrollReturnDeficits,
  missedDatesFor, lockLeaveReturnPayroll, assertLeaveReturnPayrollReady,
};
