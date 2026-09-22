const assert = require("assert");
const {
  SNAPSHOT_CHECK_INTERVAL_MS,
  isClosingCaptureDue,
  shouldAutoStartSnapshotScheduler,
  runStartupSnapshotCatchUp,
  runScheduledSnapshotCapture,
  createWorkforceSnapshotScheduler,
} = require("../src/services/workforceSnapshotScheduler");

function fixture() {
  const organizations = [
    { id: "org-a", timezone: "Africa/Lagos" },
    { id: "org-b", timezone: "Africa/Lagos" },
  ];
  const stored = new Map();
  const prisma = {
    organization: {
      findMany: async (query) => {
        assert.deepEqual(query.where, { status: "ACTIVE" });
        return organizations;
      },
    },
    workforceSnapshot: {
      findUnique: async (query) => {
        const key = query.where.organizationId_snapshotDate;
        return stored.get(`${key.organizationId}:${key.snapshotDate.toISOString()}`) || null;
      },
    },
  };
  const calls = [];
  const capture = async (_prisma, organizationId, now) => {
    calls.push({ organizationId, now });
    const date = new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" }).format(now)}T00:00:00.000Z`);
    const key = `${organizationId}:${date.toISOString()}`;
    stored.set(key, { id: key });
    return { id: key };
  };
  return { prisma, organizations, stored, calls, capture };
}

(async () => {
  assert.equal(SNAPSHOT_CHECK_INTERVAL_MS, 300000);
  assert.equal(isClosingCaptureDue(new Date("2026-08-21T22:56:00Z"), "Africa/Lagos"), true);
  assert.equal(isClosingCaptureDue(new Date("2026-08-21T20:00:00Z"), "Africa/Lagos"), false);
  assert.equal(shouldAutoStartSnapshotScheduler({ NODE_ENV: "test" }), false);
  assert.equal(shouldAutoStartSnapshotScheduler({ NODE_ENV: "production", WORKFORCE_SNAPSHOT_SCHEDULER_ENABLED: "false" }), false);
  assert.equal(shouldAutoStartSnapshotScheduler({ NODE_ENV: "production" }), true);

  const startup = fixture();
  const now = new Date("2026-08-21T10:00:00Z");
  const first = await runStartupSnapshotCatchUp({ prisma: startup.prisma, now, capture: startup.capture, logger: {} });
  assert.deepEqual(first.map((row) => row.status), ["captured", "captured"]);
  assert.deepEqual(startup.calls.map((row) => row.organizationId), ["org-a", "org-b"]);
  assert.ok([...startup.stored.keys()].every((key) => key.endsWith("2026-08-21T00:00:00.000Z")), "startup must not fabricate previous days");
  const second = await runStartupSnapshotCatchUp({ prisma: startup.prisma, now, capture: startup.capture, logger: {} });
  assert.deepEqual(second.map((row) => row.status), ["existing", "existing"]);
  assert.equal(startup.calls.length, 2, "same-day startup catch-up does not duplicate captures");

  const isolated = fixture();
  const successes = [];
  const captureWithFailure = async (_prisma, organizationId) => {
    if (organizationId === "org-a") throw new Error("tenant failure");
    successes.push(organizationId);
  };
  const closing = await runScheduledSnapshotCapture({
    prisma: isolated.prisma,
    now: new Date("2026-08-21T22:56:00Z"),
    capture: captureWithFailure,
    logger: {},
  });
  assert.deepEqual(closing.map((row) => row.status), ["failed", "captured"]);
  assert.deepEqual(successes, ["org-b"], "one tenant failure must not stop another tenant");

  const invalidTimezone = fixture();
  invalidTimezone.organizations[0].timezone = "Invalid/Timezone";
  const validCaptures = [];
  const timezoneResults = await runScheduledSnapshotCapture({
    prisma: invalidTimezone.prisma,
    now: new Date("2026-08-21T22:56:00Z"),
    capture: async (_prisma, organizationId) => validCaptures.push(organizationId),
    logger: {},
  });
  assert.deepEqual(timezoneResults.map((row) => row.status), ["failed", "captured"]);
  assert.deepEqual(validCaptures, ["org-b"], "invalid tenant timezone must not stop valid tenants");

  let intervalCallback = null;
  let cleared = false;
  const controlled = fixture();
  const scheduler = createWorkforceSnapshotScheduler({
    prisma: controlled.prisma,
    capture: controlled.capture,
    logger: {},
    now: () => now,
    setIntervalFn: (callback, delay) => {
      assert.equal(delay, SNAPSHOT_CHECK_INTERVAL_MS);
      intervalCallback = callback;
      return { unref() {} };
    },
    clearIntervalFn: () => { cleared = true; },
  });
  await Promise.all([scheduler.start(), scheduler.start()]);
  assert.equal(scheduler.isStarted(), true);
  assert.equal(typeof intervalCallback, "function");
  assert.equal(controlled.calls.length, 2, "scheduler initialization runs startup catch-up once");
  scheduler.stop();
  assert.equal(cleared, true);
  assert.equal(scheduler.isStarted(), false);

  console.log("PASS: CHRIS workforce snapshot scheduler tests passed.");
})().catch((error) => { console.error(error); process.exitCode = 1; });