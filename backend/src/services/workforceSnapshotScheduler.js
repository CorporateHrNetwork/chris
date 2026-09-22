const {
  captureWorkforceSnapshot,
  dateKeyForTimezone,
  normalizedSnapshotDate,
} = require("./workforceSnapshotService");

const SNAPSHOT_CAPTURE_HOUR = 23;
const SNAPSHOT_CAPTURE_MINUTE = 55;
const SNAPSHOT_CHECK_INTERVAL_MS = 5 * 60 * 1000;

function localTimeParts(value, timezone) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const part = (type) => Number(parts.find((item) => item.type === type)?.value);
  return { hour: part("hour"), minute: part("minute") };
}

function isClosingCaptureDue(value, timezone) {
  const { hour, minute } = localTimeParts(value, timezone);
  return hour > SNAPSHOT_CAPTURE_HOUR ||
    (hour === SNAPSHOT_CAPTURE_HOUR && minute >= SNAPSHOT_CAPTURE_MINUTE);
}

function shouldAutoStartSnapshotScheduler(env = process.env) {
  return env.NODE_ENV !== "test" &&
    String(env.WORKFORCE_SNAPSHOT_SCHEDULER_ENABLED || "true").toLowerCase() !== "false";
}

async function getActiveOrganizations(prisma) {
  return prisma.organization.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, timezone: true },
    orderBy: { id: "asc" },
  });
}

async function captureOrganizations({
  prisma,
  organizations,
  now,
  capture = captureWorkforceSnapshot,
  logger = console,
  onlyMissing = false,
}) {
  const results = [];
  for (const organization of organizations) {
    const dateKey = dateKeyForTimezone(now, organization.timezone);
    try {
      if (onlyMissing) {
        const snapshotDate = normalizedSnapshotDate(dateKey, organization.timezone);
        const existing = await prisma.workforceSnapshot.findUnique({
          where: {
            organizationId_snapshotDate: {
              organizationId: organization.id,
              snapshotDate,
            },
          },
          select: { id: true },
        });
        if (existing) {
          results.push({ organizationId: organization.id, dateKey, status: "existing" });
          continue;
        }
      }
      await capture(prisma, organization.id, now);
      logger.info?.(`Workforce snapshot captured for organization ${organization.id}`);
      results.push({ organizationId: organization.id, dateKey, status: "captured" });
    } catch (error) {
      logger.error?.(`Workforce snapshot capture failed for organization ${organization.id}`, error);
      results.push({ organizationId: organization.id, dateKey, status: "failed", error });
    }
  }
  return results;
}

async function runStartupSnapshotCatchUp({ prisma, now = new Date(), capture, logger }) {
  const organizations = await getActiveOrganizations(prisma);
  return captureOrganizations({ prisma, organizations, now, capture, logger, onlyMissing: true });
}

async function runScheduledSnapshotCapture({ prisma, now = new Date(), capture, logger }) {
  const organizations = await getActiveOrganizations(prisma);
  const due = [];
  const failures = [];
  for (const organization of organizations) {
    try {
      if (isClosingCaptureDue(now, organization.timezone)) due.push(organization);
    } catch (error) {
      logger?.error?.("Workforce snapshot scheduling failed for organization " + organization.id, error);
      failures.push({
        organizationId: organization.id,
        dateKey: null,
        status: "failed",
        error,
      });
    }
  }
  const captures = await captureOrganizations({ prisma, organizations: due, now, capture, logger });
  return [...failures, ...captures];
}

function createWorkforceSnapshotScheduler({
  prisma,
  capture = captureWorkforceSnapshot,
  logger = console,
  now = () => new Date(),
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
  intervalMs = SNAPSHOT_CHECK_INTERVAL_MS,
} = {}) {
  if (!prisma) throw new Error("prisma is required");
  let timer = null;
  let running = false;
  let startPromise = null;

  async function tick() {
    if (running) return [];
    running = true;
    try {
      return await runScheduledSnapshotCapture({ prisma, now: now(), capture, logger });
    } finally {
      running = false;
    }
  }

  async function start() {
    if (timer) return;
    if (!startPromise) {
      startPromise = (async () => {
        await runStartupSnapshotCatchUp({ prisma, now: now(), capture, logger });
        timer = setIntervalFn(() => {
          tick().catch((error) => logger.error?.("Workforce snapshot scheduler tick failed", error));
        }, intervalMs);
        timer.unref?.();
      })();
    }
    try {
      await startPromise;
    } finally {
      startPromise = null;
    }
  }

  function stop() {
    if (!timer) return;
    clearIntervalFn(timer);
    timer = null;
  }

  return { start, stop, tick, isStarted: () => Boolean(timer) };
}

module.exports = {
  SNAPSHOT_CAPTURE_HOUR,
  SNAPSHOT_CAPTURE_MINUTE,
  SNAPSHOT_CHECK_INTERVAL_MS,
  localTimeParts,
  isClosingCaptureDue,
  shouldAutoStartSnapshotScheduler,
  getActiveOrganizations,
  captureOrganizations,
  runStartupSnapshotCatchUp,
  runScheduledSnapshotCapture,
  createWorkforceSnapshotScheduler,
};