const assert = require("assert");
const { getWorkforceMetrics } = require("../src/services/workforceMetricsService");

(async () => {
  const calls = [];
  let refreshed = null;
  let snapshotRead = 0;
  const prisma = {
    organization: {
      findFirst: async (query) => {
        calls.push({ model: "organization", query });
        return { id: "org-a", timezone: "Africa/Lagos" };
      },
    },
    employee: {
      findMany: async (query) => {
        calls.push({ model: "employee", query });
        return [{ status: "ACTIVE" }, { status: "PROBATION" }, { status: "LEAVE" }];
      },
    },
    workforceSnapshot: {
      upsert: async (query) => {
        calls.push({ model: "upsert", query });
        refreshed = {
          id: "today",
          ...query.create,
          createdAt: new Date("2026-08-25T08:00:00Z"),
          updatedAt: new Date("2026-08-25T12:00:00Z"),
        };
        return refreshed;
      },
      findFirst: async () => {
        snapshotRead += 1;
        return snapshotRead === 1 ? null : refreshed;
      },
    },
    employeeEmploymentEpisode: { count: async () => 1 },
    employeeExitProcess: { count: async () => 0 },
  };

  const result = await getWorkforceMetrics(prisma, {
    organizationId: "org-a",
    from: "2026-08-25",
    to: "2026-08-25",
    now: new Date("2026-08-25T12:00:00Z"),
  });

  assert.equal(calls.filter((call) => call.model === "upsert").length, 1, "today is refreshed through one idempotent upsert");
  assert.equal(result.metrics.closingHeadcount, 3);
  assert.deepEqual(result.closingWorkforce, { active: 1, probation: 1, leave: 1, suspended: 0, exited: 0 });
  assert.equal(result.sources.currentDaySnapshot, "REFRESHED_IDEMPOTENTLY");
  assert.ok(calls.find((call) => call.model === "employee").query.where.organizationId === "org-a");

  console.log("PASS: current-day analytics refresh prevents stale workforce snapshots.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
