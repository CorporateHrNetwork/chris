const {
  assertCalendarDate,
  captureWorkforceSnapshot,
  dateKeyForTimezone,
  serializeSnapshotComposition,
  snapshotCounts,
} = require("./workforceSnapshotService");

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

function normalizeFilters(filters = {}) {
  const clean = (value) => String(value || "").trim();
  return {
    departmentId: clean(filters.departmentId),
    locationId: clean(filters.locationId),
    status: clean(filters.status).toUpperCase(),
    gender: clean(filters.gender).toUpperCase(),
  };
}

function hasWorkforceScope(filters) {
  return Object.values(filters).some(Boolean);
}

function employeeScopeWhere(filters) {
  return {
    ...(filters.departmentId && { departmentId: filters.departmentId }),
    ...(filters.locationId && { locationId: filters.locationId }),
    ...(filters.status && { status: filters.status }),
    ...(filters.gender && { gender: filters.gender }),
  };
}

function hireScopeWhere(filters) {
  const employee = {
    ...(filters.status && { status: filters.status }),
    ...(filters.gender && { gender: filters.gender }),
  };
  return {
    ...(filters.departmentId && { startDepartmentId: filters.departmentId }),
    ...(filters.locationId && { startLocationId: filters.locationId }),
    ...(Object.keys(employee).length && { employee }),
  };
}

function exitScopeWhere(filters) {
  const employee = employeeScopeWhere(filters);
  return Object.keys(employee).length ? { employee } : {};
}

function compositionFromEmployees(employees) {
  const counts = snapshotCounts(employees);
  return {
    active: counts.activeCount,
    probation: counts.probationCount,
    leave: counts.leaveCount,
    suspended: counts.suspendedCount,
    exited: counts.exitedCount,
  };
}

async function getWorkforceMetrics(
  prisma,
  { organizationId, from, to, filters = {}, now = new Date() }
) {
  if (!organizationId) throw new Error("organizationId is required");
  const fromKey = assertCalendarDate(String(from || ""));
  const toKey = assertCalendarDate(String(to || ""));
  if (fromKey > toKey) throw new Error("INVALID_DATE_RANGE");

  const normalizedFilters = normalizeFilters(filters);
  const scoped = hasWorkforceScope(normalizedFilters);

  const organization = await prisma.organization.findFirst({
    where: { id: organizationId },
    select: { id: true, timezone: true },
  });
  if (!organization) throw new Error("ORGANIZATION_NOT_FOUND");

  const currentDateKey = dateKeyForTimezone(now, organization.timezone);

  // Organization-level daily snapshots remain valuable history, but they do
  // not contain dimensional data. Never refresh or reinterpret one as a
  // department/location/status/gender snapshot.
  if (toKey === currentDateKey && !scoped) {
    await captureWorkforceSnapshot(prisma, organizationId, now);
  }

  const snapshotFrom = new Date(`${fromKey}T00:00:00.000Z`);
  const snapshotTo = new Date(`${toKey}T00:00:00.000Z`);
  const eventFrom = zonedDayStart(fromKey, organization.timezone);
  const eventToExclusive = zonedDayStart(nextDateKey(toKey), organization.timezone);

  const canUseLiveScopedClosing = scoped && toKey === currentDateKey;

  const [opening, closing, liveScopedEmployees, hires, completedExits] = await Promise.all([
    scoped
      ? Promise.resolve(null)
      : prisma.workforceSnapshot.findFirst({
          where: { organizationId, snapshotDate: { lt: snapshotFrom } },
          orderBy: { snapshotDate: "desc" },
        }),
    scoped
      ? Promise.resolve(null)
      : prisma.workforceSnapshot.findFirst({
          where: { organizationId, snapshotDate: { gte: snapshotFrom, lte: snapshotTo } },
          orderBy: { snapshotDate: "desc" },
        }),
    canUseLiveScopedClosing
      ? prisma.employee.findMany({
          where: {
            organizationId,
            ...employeeScopeWhere(normalizedFilters),
          },
          select: { status: true },
        })
      : Promise.resolve(null),
    prisma.employeeEmploymentEpisode.count({
      where: {
        organizationId,
        startDate: { gte: eventFrom, lt: eventToExclusive },
        ...hireScopeWhere(normalizedFilters),
      },
    }),
    prisma.employeeExitProcess.count({
      where: {
        organizationId,
        status: "COMPLETED",
        completedAt: { not: null, gte: eventFrom, lt: eventToExclusive },
        cancelledAt: null,
        ...exitScopeWhere(normalizedFilters),
      },
    }),
  ]);

  const liveClosingCounts =
    canUseLiveScopedClosing ? snapshotCounts(liveScopedEmployees || []) : null;

  const openingHeadcount = scoped ? null : opening?.totalCurrent ?? null;
  const closingHeadcount = scoped
    ? liveClosingCounts?.totalCurrent ?? null
    : closing?.totalCurrent ?? null;

  const bothBoundaries = openingHeadcount !== null && closingHeadcount !== null;
  const headcountChange = bothBoundaries ? closingHeadcount - openingHeadcount : null;
  const growth = bothBoundaries && openingHeadcount > 0
    ? round((headcountChange / openingHeadcount) * 100)
    : null;
  const averageHeadcount = bothBoundaries
    ? round((openingHeadcount + closingHeadcount) / 2)
    : null;
  const turnoverRate = averageHeadcount !== null && averageHeadcount > 0
    ? round((completedExits / averageHeadcount) * 100)
    : null;

  const openingReason = scoped
    ? "FILTERED_SNAPSHOT_HISTORY_UNAVAILABLE"
    : opening
      ? null
      : "INSUFFICIENT_OPENING_SNAPSHOT";

  const closingReason = scoped
    ? canUseLiveScopedClosing
      ? null
      : "FILTERED_HISTORICAL_CLOSING_UNAVAILABLE"
    : closing
      ? null
      : "INSUFFICIENT_CLOSING_SNAPSHOT";

  const boundaryReason = openingReason || closingReason;

  const closingWorkforce = scoped
    ? canUseLiveScopedClosing
      ? compositionFromEmployees(liveScopedEmployees || [])
      : null
    : serializeSnapshotComposition(closing);

  return {
    period: { from: fromKey, to: toKey, timezone: organization.timezone },
    scope: {
      filtered: scoped,
      filters: normalizedFilters,
      closingBasis: scoped
        ? canUseLiveScopedClosing
          ? "LIVE_FILTERED_WORKFORCE"
          : "UNAVAILABLE_FOR_FILTERED_HISTORICAL_DATE"
        : "ORGANIZATION_SNAPSHOT",
      historicalBoundaryBasis: scoped
        ? "DIMENSIONAL_SNAPSHOTS_NOT_AVAILABLE"
        : "ORGANIZATION_SNAPSHOTS",
    },
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
    closingWorkforce,
    availability: {
      openingHeadcount: availability(openingHeadcount !== null, openingReason),
      closingHeadcount: availability(closingHeadcount !== null, closingReason),
      headcountChange: availability(headcountChange !== null, boundaryReason),
      growth: availability(
        growth !== null,
        boundaryReason || "ZERO_OPENING_HEADCOUNT"
      ),
      averageHeadcount: availability(averageHeadcount !== null, boundaryReason),
      turnover: availability(
        turnoverRate !== null,
        boundaryReason || "INSUFFICIENT_AVERAGE_HEADCOUNT"
      ),
      hires: availability(true),
      completedExits: availability(true),
      netMovement: availability(true),
      retention: availability(false, "COHORT_RETENTION_DEFINITION_DEFERRED"),
    },
    sources: {
      openingSnapshotDate: opening?.snapshotDate.toISOString().slice(0, 10) || null,
      closingSnapshotDate: scoped
        ? canUseLiveScopedClosing
          ? currentDateKey
          : null
        : closing?.snapshotDate.toISOString().slice(0, 10) || null,
      hires: scoped
        ? "EMPLOYMENT_EPISODE_STARTS_SCOPED_TO_SELECTED_FILTERS"
        : "EMPLOYMENT_EPISODE_STARTS",
      exits: scoped
        ? "COMPLETED_EXIT_PROCESSES_SCOPED_TO_SELECTED_FILTERS"
        : "COMPLETED_EXIT_PROCESSES_BY_COMPLETED_AT",
      averageHeadcount: "OPENING_CLOSING_MEAN",
      currentDaySnapshot:
        toKey === currentDateKey && !scoped
          ? "REFRESHED_IDEMPOTENTLY"
          : scoped
            ? "NOT_USED_FOR_FILTERED_SCOPE"
            : "HISTORICAL_UNCHANGED",
    },
  };
}

module.exports = {
  round,
  zonedDayStart,
  nextDateKey,
  normalizeFilters,
  hasWorkforceScope,
  employeeScopeWhere,
  hireScopeWhere,
  exitScopeWhere,
  compositionFromEmployees,
  getWorkforceMetrics,
};
