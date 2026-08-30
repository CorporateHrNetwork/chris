const assert = require("assert");
const { zonedDayStart, getWorkforceMetrics } = require("../src/services/workforceMetricsService");

assert.equal(zonedDayStart("2026-08-01", "Africa/Lagos").toISOString(), "2026-07-31T23:00:00.000Z");

function snapshot(date, totalCurrent, counts = {}) {
  return {
    snapshotDate: new Date(date + "T00:00:00.000Z"),
    totalCurrent,
    activeCount: counts.activeCount ?? totalCurrent,
    probationCount: counts.probationCount ?? 0,
    leaveCount: counts.leaveCount ?? 0,
    suspendedCount: counts.suspendedCount ?? 0,
    exitedCount: counts.exitedCount ?? 0,
    ...(counts.organizationId && { organizationId: counts.organizationId }),
  };
}

function fixture({ opening = null, closing = null, hires = 0, exits = 0 } = {}) {
  const calls = [];
  let snapshotCall = 0;
  const prisma = {
    organization: { findFirst: async (query) => { calls.push({ model: "organization", query }); return { id: query.where.id, timezone: "Africa/Lagos" }; } },
    workforceSnapshot: { findFirst: async (query) => { calls.push({ model: "snapshot", query }); snapshotCall += 1; const candidate = snapshotCall === 1 ? opening : closing; return !candidate?.organizationId || candidate.organizationId === query.where.organizationId ? candidate : null; } },
    employeeEmploymentEpisode: { count: async (query) => { calls.push({ model: "hires", query }); return hires; } },
    employeeExitProcess: { count: async (query) => { calls.push({ model: "exits", query }); return exits; } },
  };
  return { prisma, calls };
}

(async () => {
  const positive = fixture({ opening: snapshot("2026-07-31", 100), closing: snapshot("2026-08-31", 110), hires: 5, exits: 2 });
  const result = await getWorkforceMetrics(positive.prisma, { organizationId: "org-a", from: "2026-08-01", to: "2026-08-31" });
  assert.deepEqual(result.metrics, { openingHeadcount: 100, closingHeadcount: 110, headcountChange: 10, headcountGrowthRate: 10, hires: 5, completedExits: 2, netMovement: 3, averageHeadcount: 105, turnoverRate: 1.9 });
  assert.equal(result.availability.turnover.available, true);
  assert.deepEqual(result.closingWorkforce, { active: 110, probation: 0, leave: 0, suspended: 0, exited: 0 });
  assert.equal(result.sources.openingSnapshotDate, "2026-07-31");
  assert.equal(result.sources.closingSnapshotDate, "2026-08-31");
  const openingQuery = positive.calls.find((call) => call.model === "snapshot").query;
  const closingQuery = positive.calls.filter((call) => call.model === "snapshot")[1].query;
  assert.equal(openingQuery.where.organizationId, "org-a");
  assert.equal(openingQuery.where.snapshotDate.lt.toISOString(), "2026-08-01T00:00:00.000Z", "opening requires a genuinely earlier snapshot");
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

  const negative = await getWorkforceMetrics(fixture({ opening: snapshot("2026-07-31", 100), closing: snapshot("2026-08-31", 90), hires: 2, exits: 5 }).prisma, { organizationId: "org-a", from: "2026-08-01", to: "2026-08-31" });
  assert.equal(negative.metrics.headcountGrowthRate, -10); assert.equal(negative.metrics.netMovement, -3);

  const turnover = await getWorkforceMetrics(fixture({ opening: snapshot("2026-07-31", 100), closing: snapshot("2026-08-31", 80), exits: 9 }).prisma, { organizationId: "org-a", from: "2026-08-01", to: "2026-08-31" });
  assert.equal(turnover.metrics.averageHeadcount, 90); assert.equal(turnover.metrics.turnoverRate, 10);

  const closingComposition = await getWorkforceMetrics(
    fixture({
      opening: snapshot("2026-07-31", 6, { activeCount: 4, probationCount: 1, leaveCount: 0, suspendedCount: 1, exitedCount: 0 }),
      closing: snapshot("2026-08-21", 8, { activeCount: 7, probationCount: 0, leaveCount: 1, suspendedCount: 0, exitedCount: 1 }),
    }).prisma,
    { organizationId: "org-a", from: "2026-08-01", to: "2026-08-31" }
  );
  assert.deepEqual(closingComposition.closingWorkforce, { active: 7, probation: 0, leave: 1, suspended: 0, exited: 1 }, "composition must come from the selected closing snapshot");

  const zeroLeave = await getWorkforceMetrics(
    fixture({ closing: snapshot("2026-08-21", 7, { activeCount: 7, leaveCount: 0 }) }).prisma,
    { organizationId: "org-a", from: "2026-08-01", to: "2026-08-31" }
  );
  assert.equal(zeroLeave.closingWorkforce.leave, 0, "a valid zero leave count must remain zero");

  const otherTenant = await getWorkforceMetrics(
    fixture({ closing: snapshot("2026-08-21", 8, { organizationId: "org-b", activeCount: 7, leaveCount: 1 }) }).prisma,
    { organizationId: "org-a", from: "2026-08-01", to: "2026-08-31" }
  );
  assert.equal(otherTenant.closingWorkforce, null, "another tenant's snapshot must not supply composition");

  const missing = await getWorkforceMetrics(fixture({ closing: snapshot("2026-08-21", 8), hires: 1 }).prisma, { organizationId: "org-empty", from: "2026-08-01", to: "2026-08-31" });
  assert.equal(missing.metrics.openingHeadcount, null); assert.equal(missing.metrics.closingHeadcount, 8);
  assert.equal(missing.metrics.headcountChange, null); assert.equal(missing.metrics.headcountGrowthRate, null);
  assert.equal(missing.metrics.averageHeadcount, null); assert.equal(missing.metrics.turnoverRate, null);
  assert.equal(missing.metrics.hires, 1); assert.equal(missing.metrics.completedExits, 0); assert.equal(missing.metrics.netMovement, 1);
  assert.equal(missing.availability.openingHeadcount.reason, "INSUFFICIENT_OPENING_SNAPSHOT");
  assert.equal(missing.availability.turnover.available, false);
  assert.equal(missing.availability.retention.reason, "COHORT_RETENTION_DEFINITION_DEFERRED");


  const singleDay = await getWorkforceMetrics(
    fixture({ opening: null, closing: snapshot("2026-08-21", 8), exits: 2 }).prisma,
    { organizationId: "org-a", from: "2026-08-21", to: "2026-08-21" }
  );
  assert.equal(singleDay.metrics.openingHeadcount, null);
  assert.equal(singleDay.metrics.closingHeadcount, 8);
  assert.equal(singleDay.metrics.headcountChange, null);
  assert.equal(singleDay.metrics.headcountGrowthRate, null);
  assert.equal(singleDay.metrics.averageHeadcount, null);
  assert.equal(singleDay.metrics.turnoverRate, null);
  assert.equal(singleDay.metrics.completedExits, 2);
  assert.equal(singleDay.availability.openingHeadcount.reason, "INSUFFICIENT_OPENING_SNAPSHOT");
  assert.equal(singleDay.availability.turnover.reason, "INSUFFICIENT_OPENING_SNAPSHOT");
  const noClosing = await getWorkforceMetrics(fixture({ opening: snapshot("2026-07-31", 8) }).prisma, { organizationId: "org-a", from: "2026-08-01", to: "2026-08-31" });
  assert.equal(noClosing.metrics.closingHeadcount, null); assert.equal(noClosing.availability.closingHeadcount.reason, "INSUFFICIENT_CLOSING_SNAPSHOT"); assert.equal(noClosing.closingWorkforce, null, "missing closing snapshot must not fabricate live counts");
  const zero = await getWorkforceMetrics(fixture({ opening: snapshot("2026-07-31", 0), closing: snapshot("2026-08-31", 0) }).prisma, { organizationId: "org-a", from: "2026-08-01", to: "2026-08-31" });
  assert.equal(zero.metrics.headcountGrowthRate, null); assert.equal(zero.availability.growth.reason, "ZERO_OPENING_HEADCOUNT");
  assert.equal(zero.metrics.averageHeadcount, 0); assert.equal(zero.metrics.turnoverRate, null); assert.equal(zero.availability.turnover.reason, "INSUFFICIENT_AVERAGE_HEADCOUNT");


  const scopedCalls = [];
  const scopedPrisma = {
    organization: {
      findFirst: async (query) => ({
        id: query.where.id,
        timezone: "Africa/Lagos",
      }),
    },
    workforceSnapshot: {
      findFirst: async () => {
        throw new Error("filtered metrics must not read organization-wide snapshots");
      },
    },
    employee: {
      findMany: async (query) => {
        scopedCalls.push({ model: "employees", query });
        return [
          { status: "PROBATION" },
          { status: "PROBATION" },
          { status: "ACTIVE" },
        ];
      },
    },
    employeeEmploymentEpisode: {
      count: async (query) => {
        scopedCalls.push({ model: "hires", query });
        return 2;
      },
    },
    employeeExitProcess: {
      count: async (query) => {
        scopedCalls.push({ model: "exits", query });
        return 1;
      },
    },
  };

  const scoped = await getWorkforceMetrics(scopedPrisma, {
    organizationId: "org-a",
    from: "2026-08-01",
    to: "2026-08-30",
    now: new Date("2026-08-30T12:00:00.000Z"),
    filters: {
      departmentId: "dept-payroll",
      locationId: "loc-abuja",
    },
  });

  assert.equal(scoped.scope.filtered, true);
  assert.equal(scoped.metrics.closingHeadcount, 3, "filtered current closing headcount must come from the filtered employee population");
  assert.deepEqual(
    scoped.closingWorkforce,
    { active: 1, probation: 2, leave: 0, suspended: 0, exited: 0 },
    "filtered closing composition must never leak organization-wide snapshot counts"
  );
  assert.equal(scoped.metrics.openingHeadcount, null);
  assert.equal(scoped.metrics.averageHeadcount, null);
  assert.equal(scoped.metrics.turnoverRate, null);
  assert.equal(scoped.availability.openingHeadcount.reason, "FILTERED_SNAPSHOT_HISTORY_UNAVAILABLE");
  assert.equal(scoped.metrics.hires, 2);
  assert.equal(scoped.metrics.completedExits, 1);
  assert.equal(scoped.metrics.netMovement, 1);

  const scopedEmployeeWhere = scopedCalls.find((call) => call.model === "employees").query.where;
  assert.equal(scopedEmployeeWhere.organizationId, "org-a");
  assert.equal(scopedEmployeeWhere.departmentId, "dept-payroll");
  assert.equal(scopedEmployeeWhere.locationId, "loc-abuja");

  const scopedHireWhere = scopedCalls.find((call) => call.model === "hires").query.where;
  assert.equal(scopedHireWhere.startDepartmentId, "dept-payroll");
  assert.equal(scopedHireWhere.startLocationId, "loc-abuja");

  const scopedExitWhere = scopedCalls.find((call) => call.model === "exits").query.where;
  assert.equal(scopedExitWhere.employee.departmentId, "dept-payroll");
  assert.equal(scopedExitWhere.employee.locationId, "loc-abuja");

  const historicalScopedPrisma = {
    organization: {
      findFirst: async (query) => ({
        id: query.where.id,
        timezone: "Africa/Lagos",
      }),
    },
    workforceSnapshot: {
      findFirst: async () => {
        throw new Error("filtered historical metrics must not read organization-wide snapshots");
      },
    },
    employee: {
      findMany: async () => {
        throw new Error("historical filtered closing must not be fabricated from today's employees");
      },
    },
    employeeEmploymentEpisode: { count: async () => 0 },
    employeeExitProcess: { count: async () => 0 },
  };

  const historicalScoped = await getWorkforceMetrics(historicalScopedPrisma, {
    organizationId: "org-a",
    from: "2026-07-01",
    to: "2026-07-31",
    now: new Date("2026-08-30T12:00:00.000Z"),
    filters: { departmentId: "dept-payroll" },
  });

  assert.equal(historicalScoped.metrics.closingHeadcount, null);
  assert.equal(
    historicalScoped.availability.closingHeadcount.reason,
    "FILTERED_HISTORICAL_CLOSING_UNAVAILABLE"
  );
  assert.equal(historicalScoped.closingWorkforce, null);

  await assert.rejects(() => getWorkforceMetrics(fixture().prisma, { organizationId: "org-a", from: "bad", to: "2026-08-31" }), /INVALID_SNAPSHOT_DATE/);
  await assert.rejects(() => getWorkforceMetrics(fixture().prisma, { organizationId: "org-a", from: "2026-08-01", to: "bad" }), /INVALID_SNAPSHOT_DATE/);
  await assert.rejects(() => getWorkforceMetrics(fixture().prisma, { organizationId: "org-a", from: "2026-09-01", to: "2026-08-01" }), /INVALID_DATE_RANGE/);
  console.log("PASS: CHRIS advanced workforce metrics tests passed.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
