const { lagosToday, dispatchTodayCelebrations, deliveryConfiguration } = require('./zermattCelebrationNotificationService');

function createZermattCelebrationScheduler({ prisma, env = process.env, now = () => new Date(), dispatch = dispatchTodayCelebrations, logger = console, intervalMs = 15 * 60 * 1000 } = {}) {
  let timer = null;
  let running = false;
  const enabled = () => env.CHRIS_CELEBRATION_AUTOMATION_ENABLED === 'true';

  async function run() {
    if (!enabled()) return { skipped: 'AUTOMATION_DISABLED' };
    if (running) return { skipped: 'RUN_IN_PROGRESS' };
    const current = now();
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', hour: '2-digit', hourCycle: 'h23' }).format(current));
    if (hour < 8) return { skipped: 'BEFORE_08_LAGOS' };
    if (hour >= 20) return { skipped: 'AFTER_20_LAGOS' };
    running = true;
    try {
      const organization = await prisma.organization.findUnique({ where: { slug: 'zermatt-liquor-limited' }, select: { id: true, status: true } });
      if (!organization || organization.status !== 'ACTIVE') return { skipped: 'ZERMATT_NOT_ACTIVE' };
      const result = await dispatch({ organizationId: organization.id, date: lagosToday(current), now: current, prismaClient: prisma, env });
      const channels = {};
      const ledger = await prisma.$queryRawUnsafe(
        `SELECT "channel","status",COUNT(*)::int AS "count" FROM "employee_celebration_notification_ledger"
         WHERE "organizationId"=$1 AND "celebrationDate"=$2::date GROUP BY "channel","status"`, organization.id, result.date
      );
      for (const row of ledger) channels[`${row.channel}:${row.status}`] = Number(row.count);
      // Keep employee names, birthdays and contact details out of scheduler logs.
      const summary = { date: result.date, count: result.count, channels };
      logger.info('[CHRiS] Zermatt celebrations', summary);
      return summary;
    } finally { running = false; }
  }

  function tick() { return run().catch(() => { logger.error('[CHRiS] Celebration scheduler failed; review service/database availability.'); }); }
  function start() {
    if (!enabled() || timer) return;
    void tick();
    timer = setInterval(tick, intervalMs);
    timer.unref?.();
  }
  function stop() { if (timer) clearInterval(timer); timer = null; }
  return { start, stop, run, readiness: () => ({ enabled: enabled(), emailConfigured: deliveryConfiguration(env).emailConfigured, smsConfigured: deliveryConfiguration(env).smsConfigured }) };
}

module.exports = { createZermattCelebrationScheduler };
