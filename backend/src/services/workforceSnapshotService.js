const { summarizeEmployeeStatuses } = require("./employeeStatusSemantics");

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function assertCalendarDate(value) {
  if (!DATE_PATTERN.test(value)) throw new Error("INVALID_SNAPSHOT_DATE");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("INVALID_SNAPSHOT_DATE");
  }
  return value;
}

function dateKeyForTimezone(value = new Date(), timezone = "Africa/Lagos") {
  if (typeof value === "string" && DATE_PATTERN.test(value)) return assertCalendarDate(value);
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("INVALID_SNAPSHOT_DATE");
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const part = (type) => parts.find((item) => item.type === type)?.value;
    return assertCalendarDate(`${part("year")}-${part("month")}-${part("day")}`);
  } catch (error) {
    if (error.message === "INVALID_SNAPSHOT_DATE") throw error;
    throw new Error("INVALID_ORGANIZATION_TIMEZONE");
  }
}

function normalizedSnapshotDate(value, timezone) {
  return new Date(`${dateKeyForTimezone(value, timezone)}T00:00:00.000Z`);
}

function snapshotCounts(employees) {
  const summary = summarizeEmployeeStatuses(employees);
  return {
    totalCurrent: summary.current,
    activeCount: summary.byStatus.ACTIVE || 0,
    probationCount: summary.byStatus.PROBATION || 0,
    leaveCount: summary.byStatus.LEAVE || 0,
    suspendedCount: summary.byStatus.SUSPENDED || 0,
    totalHistorical: summary.historicalIdentities,
    exitedCount: summary.exited,
    unclassifiedCount: summary.historicalIdentities - summary.current - summary.exited,
  };
}

function serializeSnapshot(snapshot) {
  return {
    id: snapshot.id,
    snapshotDate: snapshot.snapshotDate.toISOString().slice(0, 10),
    totalHistorical: snapshot.totalHistorical,
    totalCurrent: snapshot.totalCurrent,
    active: snapshot.activeCount,
    probation: snapshot.probationCount,
    leave: snapshot.leaveCount,
    suspended: snapshot.suspendedCount,
    exited: snapshot.exitedCount,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
  };
}

async function captureWorkforceSnapshot(prisma, organizationId, snapshotDate = new Date()) {
  if (!organizationId) throw new Error("organizationId is required");
  const organization = await prisma.organization.findFirst({
    where: { id: organizationId },
    select: { id: true, timezone: true },
  });
  if (!organization) throw new Error("ORGANIZATION_NOT_FOUND");
  const normalizedDate = normalizedSnapshotDate(snapshotDate, organization.timezone);
  const employees = await prisma.employee.findMany({
    where: { organizationId },
    select: { status: true },
  });
  const counts = snapshotCounts(employees);
  const storedCounts = {
    totalCurrent: counts.totalCurrent,
    activeCount: counts.activeCount,
    probationCount: counts.probationCount,
    leaveCount: counts.leaveCount,
    suspendedCount: counts.suspendedCount,
    totalHistorical: counts.totalHistorical,
    exitedCount: counts.exitedCount,
  };
  const snapshot = await prisma.workforceSnapshot.upsert({
    where: { organizationId_snapshotDate: { organizationId, snapshotDate: normalizedDate } },
    create: { organizationId, snapshotDate: normalizedDate, ...storedCounts },
    update: storedCounts,
  });
  return { ...serializeSnapshot(snapshot), unclassifiedCount: counts.unclassifiedCount, timezone: organization.timezone };
}

async function getWorkforceSnapshots(prisma, organizationId, options = {}) {
  if (!organizationId) throw new Error("organizationId is required");
  const fromKey = options.from ? assertCalendarDate(String(options.from)) : null;
  const toKey = options.to ? assertCalendarDate(String(options.to)) : null;
  if (fromKey && toKey && fromKey > toKey) throw new Error("INVALID_DATE_RANGE");
  const snapshotDate = {};
  if (fromKey) snapshotDate.gte = new Date(`${fromKey}T00:00:00.000Z`);
  if (toKey) snapshotDate.lte = new Date(`${toKey}T00:00:00.000Z`);
  const snapshots = await prisma.workforceSnapshot.findMany({
    where: { organizationId, ...(Object.keys(snapshotDate).length && { snapshotDate }) },
    orderBy: { snapshotDate: "asc" },
  });
  return {
    from: fromKey,
    to: toKey,
    snapshots: snapshots.map(serializeSnapshot),
  };
}

module.exports = {
  assertCalendarDate,
  dateKeyForTimezone,
  normalizedSnapshotDate,
  snapshotCounts,
  serializeSnapshot,
  captureWorkforceSnapshot,
  getWorkforceSnapshots,
};



