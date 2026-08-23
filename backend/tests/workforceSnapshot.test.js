const assert = require("assert");
const {
  dateKeyForTimezone,
  normalizedSnapshotDate,
  snapshotCounts,
  serializeSnapshotComposition,
  captureWorkforceSnapshot,
  getWorkforceSnapshots,
} = require("../src/services/workforceSnapshotService");

assert.equal(dateKeyForTimezone(new Date("2026-08-20T23:30:00.000Z"), "Africa/Lagos"), "2026-08-21");
assert.equal(normalizedSnapshotDate("2026-08-21", "Africa/Lagos").toISOString(), "2026-08-21T00:00:00.000Z");
assert.throws(() => normalizedSnapshotDate("2026-02-30", "Africa/Lagos"), /INVALID_SNAPSHOT_DATE/);

const counts = snapshotCounts([
  { status: "ACTIVE" }, { status: "PROBATION" }, { status: "LEAVE" }, { status: "SUSPENDED" },
  { status: "TERMINATED" }, { status: "RESIGNED" }, { status: "RETIRED" }, { status: "INACTIVE" },
]);
assert.deepEqual(counts, {
  totalCurrent: 4, activeCount: 1, probationCount: 1, leaveCount: 1, suspendedCount: 1,
  totalHistorical: 8, exitedCount: 4, unclassifiedCount: 0,
});
assert.deepEqual(snapshotCounts([]), {
  totalCurrent: 0, activeCount: 0, probationCount: 0, leaveCount: 0, suspendedCount: 0,
  totalHistorical: 0, exitedCount: 0, unclassifiedCount: 0,
});
assert.deepEqual(serializeSnapshotComposition({
  activeCount: 7, probationCount: 0, leaveCount: 1, suspendedCount: 0, exitedCount: 1,
}), { active: 7, probation: 0, leave: 1, suspended: 0, exited: 1 });
assert.equal(serializeSnapshotComposition(null), null);

function createPrisma(employeeRows = []) {
  const calls = [];
  const stored = new Map();
  let sequence = 0;
  const prisma = {
    organization: { findFirst: async (query) => { calls.push({ model: "organization", query }); return { id: query.where.id, timezone: "Africa/Lagos" }; } },
    employee: { findMany: async (query) => { calls.push({ model: "employee", query }); return employeeRows; } },
    workforceSnapshot: {
      upsert: async (query) => {
        calls.push({ model: "upsert", query });
        const composite = query.where.organizationId_snapshotDate;
        const key = `${composite.organizationId}:${composite.snapshotDate.toISOString()}`;
        const existing = stored.get(key);
        const record = existing
          ? { ...existing, ...query.update, updatedAt: new Date("2026-08-21T12:00:00Z") }
          : { id: `s${++sequence}`, ...query.create, createdAt: new Date("2026-08-21T10:00:00Z"), updatedAt: new Date("2026-08-21T10:00:00Z") };
        stored.set(key, record);
        return record;
      },
      findMany: async (query) => { calls.push({ model: "history", query }); return Array.from(stored.values()).filter((row) => row.organizationId === query.where.organizationId).sort((a, b) => a.snapshotDate - b.snapshotDate); },
    },
  };
  return { prisma, calls, stored };
}

(async () => {
  const fixture = createPrisma([{ status: "ACTIVE" }, { status: "LEAVE" }, { status: "TERMINATED" }]);
  const first = await captureWorkforceSnapshot(fixture.prisma, "org-a", "2026-08-21");
  assert.equal(first.totalHistorical, 3); assert.equal(first.totalCurrent, 2); assert.equal(first.active, 1); assert.equal(first.leave, 1); assert.equal(first.exited, 1);
  assert.equal(fixture.stored.size, 1, "first capture creates one canonical day row");
  fixture.prisma.employee.findMany = async (query) => { fixture.calls.push({ model: "employee", query }); return [{ status: "ACTIVE" }, { status: "ACTIVE" }]; };
  const second = await captureWorkforceSnapshot(fixture.prisma, "org-a", "2026-08-21");
  assert.equal(fixture.stored.size, 1, "same-day recapture is idempotent");
  assert.equal(second.active, 2, "same-day recapture updates changed counts"); assert.equal(second.exited, 0);
  assert.ok(fixture.calls.filter((call) => call.model === "employee").every((call) => call.query.where.organizationId === "org-a"));
  assert.ok(fixture.calls.filter((call) => call.model === "upsert").every((call) => call.query.where.organizationId_snapshotDate.organizationId === "org-a"));

  await captureWorkforceSnapshot(fixture.prisma, "org-b", "2026-08-21");
  const historyA = await getWorkforceSnapshots(fixture.prisma, "org-a", { from: "2026-08-01", to: "2026-08-31" });
  assert.equal(historyA.snapshots.length, 1); assert.equal(historyA.snapshots[0].snapshotDate, "2026-08-21");
  const historyCall = fixture.calls.findLast((call) => call.model === "history");
  assert.equal(historyCall.query.where.organizationId, "org-a");
  assert.equal(historyCall.query.orderBy.snapshotDate, "asc");
  assert.equal(historyCall.query.where.snapshotDate.gte.toISOString(), "2026-08-01T00:00:00.000Z");
  assert.equal(historyCall.query.where.snapshotDate.lte.toISOString(), "2026-08-31T00:00:00.000Z");
  await assert.rejects(() => getWorkforceSnapshots(fixture.prisma, "org-a", { from: "2026-09-01", to: "2026-08-01" }), /INVALID_DATE_RANGE/);
  await assert.rejects(() => getWorkforceSnapshots(fixture.prisma, "org-a", { from: "not-a-date" }), /INVALID_SNAPSHOT_DATE/);
  const empty = await getWorkforceSnapshots(createPrisma().prisma, "org-empty", {});
  assert.deepEqual(empty.snapshots, []);
  console.log("PASS: CHRIS workforce snapshot tests passed.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
