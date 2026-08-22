const assert = require("assert");
const { zonedDayStart, getWorkforceMetrics } = require("../src/services/workforceMetricsService");

assert.equal(zonedDayStart("2026-08-01", "Africa/Lagos").toISOString(), "2026-07-31T23:00:00.000Z");

function snapshot(date, totalCurrent) {
  return { snapshotDate: new Date(`${date}T00:00:00.000Z`), totalCurrent };
}

function fixture({ opening = null, closing = null, hires = 0, exits = 0 } = {}) {
  const calls = [];
  let snapshotCall = 0;
  const prisma = {
    organization: { findFirst: async (query) => { calls.push({ model: "organization", query }); return { id: query.where.id, timezone: "Africa/Lagos" }; } },
    workforceSnapshot: { findFirst: async (query) => { calls.push({ model: "snapshot", query }); snapshotCall += 1; return snapshotCall === 1 ? opening : closing; } },
    employeeEmploymentEpisode: { count: async (query) => { calls.push({ model: "hires", query }); return hires; } },
    employeeExitProcess: { count: async (query) => { calls.push({ model: "exits", query }); return exits; } },
  };
  return { prisma, calls };
}

(async () => {
  const positive = fixture({ opening: snapshot("2026-08-01", 100), closing: snapshot("2026-08-31", 110), hires: 5, exits: 2 });
  const result = await getWorkforceMetrics(positive.prisma, { organizationId: "org-a", from: "2026-08-01", to: "2026-08-31" });
  assert.deepEqual(result.metrics, { openingHeadcount: 100, closingHeadcount: 110, headcountChange: 10, headcountGrowthRate: 10, hires: 5, completedExits: 2, netMovement: 3, averageHeadcount: 105, turnoverRate: 1.9 });
  assert.equal(result.availability.turnover.available, true);
  assert.equal(result.sources.openingSnapshotDate, "2026-08-01");
  assert.equal(result.sources.closingSnapshotDate, "2026-08-31");
  const openingQuery = positive.calls.find((call) => call.model === "snapshot").query;
  const closingQuery = positive.calls.filter((call) => call.model === "snapshot")[1].query;
  assert.equal(openingQuery.where.organizationId, "org-a");
  assert.equal(openingQuery.where.snapshotDate.lte.toISOString(), "2026-08-01T00:00:00.000Z");
  assert.equal(closingQuery.where.organizationId, "org-a");
  assert.equal(closingQuery.where.snapshotDate.gte.toISOString(), "2026-08-01T00:00:00.000Z", "closing cannot use a stale pre-period snapshot");
  assert.equal(closingQuery.where.snapshotDate.lte.toISOString(), "2026-08-31T00:00:00.000Z");
  const hireQuery = positive.calls.find((call) => call.model === "hires").query.where;
  assert.equal(hireQuery.organizationId, "org-a");
  assert.equal(hireQuery.startDate.gte.toISOString(), "2026-07-31T23:00:00.000Z");
  assert.equal(hireQuery.startDate.lt.toISOString(), "2026-08-31T23:00:00.000Z");
  const exitQuery = positive.calls.find((call) => call.model === "exits").query.where;
  assert.equal(exitQuery.organizationId, "org-a"); assert.equal(exitQuery.status, "COMPLETED"); assert.equal(exitQuery.cancelledAt, null);
  assert.equal(exitQuery.completedAt.not, null); assert.equal(exitQuery.completedAt.gte.toISOString(), "2026-07-31T23:00:00.000Z");

  const negative = await getWorkforceMetrics(fixture({ opening: snapshot("2026-08-01", 100), closing: snapshot("2026-08-31", 90), hires: 2, exits: 5 }).prisma, { organizationId: "org-a", from: "2026-08-01", to: "2026-08-31" });
  assert.equal(negative.metrics.headcountGrowthRate, -10); assert.equal(negative.metrics.netMovement, -3);

  const turnover = await getWorkforceMetrics(fixture({ opening: snapshot("2026-08-01", 100), closing: snapshot("2026-08-31", 80), exits: 9 }).prisma, { organizationId: "org-a", from: "2026-08-01", to: "2026-08-31" });
  assert.equal(turnover.metrics.averageHeadcount, 90); assert.equal(turnover.metrics.turnoverRate, 10);

  const missing = await getWorkforceMetrics(fixture({ closing: snapshot("2026-08-21", 8), hires: 1 }).prisma, { organizationId: "org-empty", from: "2026-08-01", to: "2026-08-31" });
  assert.equal(missing.metrics.openingHeadcount, null); assert.equal(missing.metrics.closingHeadcount, 8);
  assert.equal(missing.metrics.headcountChange, null); assert.equal(missing.metrics.headcountGrowthRate, null);
  assert.equal(missing.metrics.averageHeadcount, null); assert.equal(missing.metrics.turnoverRate, null);
  assert.equal(missing.metrics.hires, 1); assert.equal(missing.metrics.completedExits, 0); assert.equal(missing.metrics.netMovement, 1);
  assert.equal(missing.availability.openingHeadcount.reason, "INSUFFICIENT_OPENING_SNAPSHOT");
  assert.equal(missing.availability.turnover.available, false);
  assert.equal(missing.availability.retention.reason, "COHORT_RETENTION_DEFINITION_DEFERRED");

  const noClosing = await getWorkforceMetrics(fixture({ opening: snapshot("2026-07-31", 8) }).prisma, { organizationId: "org-a", from: "2026-08-01", to: "2026-08-31" });
  assert.equal(noClosing.metrics.closingHeadcount, null); assert.equal(noClosing.availability.closingHeadcount.reason, "INSUFFICIENT_CLOSING_SNAPSHOT");
  const zero = await getWorkforceMetrics(fixture({ opening: snapshot("2026-08-01", 0), closing: snapshot("2026-08-31", 0) }).prisma, { organizationId: "org-a", from: "2026-08-01", to: "2026-08-31" });
  assert.equal(zero.metrics.headcountGrowthRate, null); assert.equal(zero.availability.growth.reason, "ZERO_OPENING_HEADCOUNT");
  assert.equal(zero.metrics.averageHeadcount, 0); assert.equal(zero.metrics.turnoverRate, null); assert.equal(zero.availability.turnover.reason, "INSUFFICIENT_AVERAGE_HEADCOUNT");

  await assert.rejects(() => getWorkforceMetrics(fixture().prisma, { organizationId: "org-a", from: "bad", to: "2026-08-31" }), /INVALID_SNAPSHOT_DATE/);
  await assert.rejects(() => getWorkforceMetrics(fixture().prisma, { organizationId: "org-a", from: "2026-08-01", to: "bad" }), /INVALID_SNAPSHOT_DATE/);
  await assert.rejects(() => getWorkforceMetrics(fixture().prisma, { organizationId: "org-a", from: "2026-09-01", to: "2026-08-01" }), /INVALID_DATE_RANGE/);
  console.log("PASS: CHRIS advanced workforce metrics tests passed.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
