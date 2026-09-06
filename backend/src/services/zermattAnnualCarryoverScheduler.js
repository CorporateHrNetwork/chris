const { forfeitExpiredCarryover, carryoverExpiryDate } = require("./zermattAnnualLeaveCarryoverService");

const HOUR_MS = 60 * 60 * 1000;

function createZermattAnnualCarryoverScheduler({ prisma, intervalMs = HOUR_MS }) {
  let timer = null;
  let running = false;

  async function runOnce(now = new Date()) {
    if (running) return null;
    running = true;
    try {
      const year = now.getUTCFullYear();
      if (now <= carryoverExpiryDate(year)) return { skipped: "Q1_NOT_EXPIRED", leaveYear: year };
      const organization = await prisma.organization.findUnique({
        where: { slug: "zermatt-liquor-limited" },
        select: { id: true },
      });
      if (!organization) return { skipped: "ZERMATT_NOT_CONFIGURED", leaveYear: year };
      return await forfeitExpiredCarryover({
        organizationId: organization.id,
        actorUserId: null,
        leaveYear: year,
        asOfDate: now,
        tx: prisma,
      });
    } catch (error) {
      console.error("CHRiS ZERMATT Annual Leave carryover scheduler failed:", error);
      return { error: error.message || "CARRYOVER_SCHEDULER_FAILED" };
    } finally {
      running = false;
    }
  }

  async function start() {
    await runOnce(new Date());
    if (!timer) timer = setInterval(() => runOnce(new Date()), intervalMs);
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { start, stop, runOnce };
}

module.exports = { createZermattAnnualCarryoverScheduler };
