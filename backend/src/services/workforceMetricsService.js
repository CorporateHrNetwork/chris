const { assertCalendarDate } = require("./workforceSnapshotService");

function round(value, places = 2) {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

// Converts an organization-local midnight into its UTC instant. A second pass
// keeps the conversion correct across timezones with daylight-saving changes.
function zonedDayStart(dateKey, timezone) {
  assertCalendarDate(dateKey);
  const [year, month, day] = dateKey.split("-").map(Number);
  let instant = Date.UTC(year, month - 1, day);
  for (let pass = 0; pass < 2; pass += 1) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(instant));
    const value = (type) => Number(parts.find((part) => part.type === type)?.value);
    const represented = Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"), value("second"));
    instant -= represented - Date.UTC(year, month - 1, day);
  }
  return new Date(instant);
}

function nextDateKey(dateKey) {
  const date = new Date(`${assertCalendarDate(dateKey)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function availability(available, unavailableReason = null) {
  return { available, reason: available ? null : unavailableReason };
}

async function getWorkforceMetrics(prisma, { organizationId, from, to }) {
  if (!organizationId) throw new Error("organizationId is required");
  const fromKey = assertCalendarDate(String(from || ""));
  const toKey = assertCalendarDate(String(to || ""));
  if (fromKey > toKey) throw new Error("INVALID_DATE_RANGE");

  const organization = await prisma.organization.findFirst({
    where: { id: organizationId },
    select: { id: true, timezone: true },
  });
  if (!organization) throw new Error("ORGANIZATION_NOT_FOUND");

  const snapshotFrom = new Date(`${fromKey}T00:00:00.000Z`);
  const snapshotTo = new Date(`${toKey}T00:00:00.000Z`);
  const eventFrom = zonedDayStart(fromKey, organization.timezone);
  const eventToExclusive = zonedDayStart(nextDateKey(toKey), organization.timezone);

  const [opening, closing, hires, completedExits] = await Promise.all([
    prisma.workforceSnapshot.findFirst({
      where: { organizationId, snapshotDate: { lte: snapshotFrom } },
      orderBy: { snapshotDate: "desc" },
    }),
    // Closing must be represented by a snapshot inside the reporting period;
    // a stale pre-period snapshot is not a defensible period-end denominator.
    prisma.workforceSnapshot.findFirst({
      where: { organizationId, snapshotDate: { gte: snapshotFrom, lte: snapshotTo } },
      orderBy: { snapshotDate: "desc" },
    }),
    prisma.employeeEmploymentEpisode.count({
      where: { organizationId, startDate: { gte: eventFrom, lt: eventToExclusive } },
    }),
    prisma.employeeExitProcess.count({
      where: {
        organizationId,
        status: "COMPLETED",
        completedAt: { not: null, gte: eventFrom, lt: eventToExclusive },
        cancelledAt: null,
      },
    }),
  ]);

  const openingHeadcount = opening?.totalCurrent ?? null;
  const closingHeadcount = closing?.totalCurrent ?? null;
  const bothBoundaries = openingHeadcount !== null && closingHeadcount !== null;
  const headcountChange = bothBoundaries ? closingHeadcount - openingHeadcount : null;
  const growth = bothBoundaries && openingHeadcount > 0
    ? round((headcountChange / openingHeadcount) * 100)
    : null;
  const averageHeadcount = bothBoundaries ? round((openingHeadcount + closingHeadcount) / 2) : null;
  const turnoverRate = averageHeadcount !== null && averageHeadcount > 0
    ? round((completedExits / averageHeadcount) * 100)
    : null;
  const openingReason = opening ? null : "INSUFFICIENT_OPENING_SNAPSHOT";
  const closingReason = closing ? null : "INSUFFICIENT_CLOSING_SNAPSHOT";
  const boundaryReason = openingReason || closingReason;

  return {
    period: { from: fromKey, to: toKey, timezone: organization.timezone },
    metrics: {
      openingHeadcount,
      closingHeadcount,
      headcountChange,
      headcountGrowthRate: growth,
      hires,
      completedExits,
      netMovement: hires - completedExits,
      averageHeadcount,
      turnoverRate,
    },
    availability: {
      openingHeadcount: availability(openingHeadcount !== null, openingReason),
      closingHeadcount: availability(closingHeadcount !== null, closingReason),
      headcountChange: availability(headcountChange !== null, boundaryReason),
      growth: availability(growth !== null, boundaryReason || "ZERO_OPENING_HEADCOUNT"),
      averageHeadcount: availability(averageHeadcount !== null, boundaryReason),
      turnover: availability(turnoverRate !== null, boundaryReason || "INSUFFICIENT_AVERAGE_HEADCOUNT"),
      hires: availability(true),
      completedExits: availability(true),
      netMovement: availability(true),
      retention: availability(false, "COHORT_RETENTION_DEFINITION_DEFERRED"),
    },
    sources: {
      openingSnapshotDate: opening?.snapshotDate.toISOString().slice(0, 10) || null,
      closingSnapshotDate: closing?.snapshotDate.toISOString().slice(0, 10) || null,
      hires: "EMPLOYMENT_EPISODE_STARTS",
      exits: "COMPLETED_EXIT_PROCESSES_BY_COMPLETED_AT",
      averageHeadcount: "OPENING_CLOSING_MEAN",
    },
  };
}

module.exports = { round, zonedDayStart, nextDateKey, getWorkforceMetrics };
