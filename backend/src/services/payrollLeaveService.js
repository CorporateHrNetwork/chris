const { calculateLeaveDays, utcDay } = require("./leaveDayCalculator");

const approvedLeaveStatuses = ["APPROVED", "ACTIVE", "COMPLETED"];

async function loadPayrollLeave({ prismaClient, organizationId, period, paidOnly = false }) {
  const periodStart = period ? utcDay(period.periodStart) : null;
  const periodEnd = period ? utcDay(period.periodEnd) : null;
  const rows = await prismaClient.leaveRequest.findMany({
    where: {
      organizationId,
      status: { in: approvedLeaveStatuses },
      ...(paidOnly ? { leaveType: { isPaid: true } } : {}),
      ...(period ? {
        startDate: { lt: new Date(periodEnd.getTime() + 86400000) },
        endDate: { gte: periodStart },
      } : {}),
    },
    select: {
      id: true,
      employeeId: true,
      startDate: true,
      endDate: true,
      requestedUnits: true,
      status: true,
      employee: { select: { employeeNumber: true, firstName: true, middleName: true, lastName: true } },
      leaveType: { select: { name: true, code: true, isPaid: true, unit: true } },
      leavePolicy: { select: { calendarRules: true, entitlementRules: true } },
    },
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
  });

  const spanning = period ? rows.filter((row) => utcDay(row.startDate) < periodStart || utcDay(row.endDate) > periodEnd) : [];
  const holidays = spanning.length ? await prismaClient.publicHoliday.findMany({
    where: { organizationId, holidayDate: {
      gte: new Date(Math.min(...spanning.map((row) => row.startDate.getTime()))),
      lte: new Date(Math.max(...spanning.map((row) => row.endDate.getTime()))),
    } },
    select: { holidayDate: true },
  }) : [];
  const spanningIds = new Set(spanning.map((row) => row.id));
  return rows.map((row) => {
    const requestedUnits = Number(row.requestedUnits);
    if (!spanningIds.has(row.id)) return { ...row, requestedUnits, periodUnits: requestedUnits };
    const countDays = (startDate, endDate) => calculateLeaveDays({
      startDate, endDate, policy: row.leavePolicy, publicHolidays: holidays.map((holiday) => holiday.holidayDate),
    }).requestedUnits;
    const fullDays = countDays(row.startDate, row.endDate);
    const overlapDays = countDays(
      utcDay(row.startDate) < periodStart ? periodStart : row.startDate,
      utcDay(row.endDate) > periodEnd ? periodEnd : row.endDate
    );
    return { ...row, requestedUnits, periodUnits: fullDays ? Math.round(requestedUnits * overlapDays / fullDays * 100) / 100 : 0 };
  });
}

function calculateLeavePayableDays({ standardDays, workedDays, paidDays, unpaidDays }) {
  if (workedDays == null) return Math.max(0, standardDays - unpaidDays);
  return workedDays + Math.min(paidDays, Math.max(0, standardDays - workedDays));
}

module.exports = { loadPayrollLeave, calculateLeavePayableDays };
