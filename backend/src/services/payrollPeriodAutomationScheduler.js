const crypto = require("crypto");

function currentMonthWindow(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { start, end, code: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}` };
}

function currentQuarter(now = new Date()) {
  return Math.floor(now.getUTCMonth() / 3) + 1;
}

function createPayrollPeriodAutomationScheduler({ prisma, intervalMs = 60 * 60 * 1000 } = {}) {
  let timer = null;
  let running = false;

  async function run() {
    if (running) return;
    running = true;
    try {
      const now = new Date();
      const { start, end, code } = currentMonthWindow(now);
      const organizations = await prisma.organization.findMany({
        where: { status: "ACTIVE" },
        select: { id: true, name: true },
      });

      for (const org of organizations) {
        const existing = await prisma.$queryRawUnsafe(
          `SELECT "id" FROM "payroll_periods" WHERE "organizationId"=$1 AND "code"=$2 LIMIT 1`,
          org.id,
          code
        );
        if (!existing[0]) {
          await prisma.$queryRawUnsafe(
            `INSERT INTO "payroll_periods" ("id","organizationId","code","name","periodStart","periodEnd","payDate","status","createdByUserId")
             VALUES ($1,$2,$3,$4,$5::date,$6::date,NULL,'OPEN',NULL)`,
            crypto.randomUUID(),
            org.id,
            code,
            `${start.toLocaleString("en-US", { month: "long", year: "numeric" })} Payroll`,
            start.toISOString().slice(0, 10),
            end.toISOString().slice(0, 10)
          );
          console.log(`[CHRiS] Automatically opened ${code} payroll for ${org.name}.`);
        }

        const quarter = currentQuarter(now);
        const year = now.getUTCFullYear();
        const cycleExists = await prisma.$queryRawUnsafe(
          `SELECT "id" FROM "chris_performance_cycles" WHERE "organizationId"=$1 AND "year"=$2 AND "quarter"=$3 LIMIT 1`,
          org.id, year, quarter
        );
        if (!cycleExists[0]) {
          const cycleStart = new Date(Date.UTC(year, (quarter - 1) * 3, 1));
          const cycleEnd = new Date(Date.UTC(year, quarter * 3, 0));
          await prisma.$queryRawUnsafe(
            `INSERT INTO "chris_performance_cycles" ("id","organizationId","year","quarter","startDate","endDate","status")
             VALUES ($1,$2,$3,$4,$5::date,$6::date,'OPEN')`,
            crypto.randomUUID(), org.id, year, quarter,
            cycleStart.toISOString().slice(0, 10),
            cycleEnd.toISOString().slice(0, 10)
          );
          console.log(`[CHRiS] Opened performance cycle Q${quarter} ${year} for ${org.name}.`);
        }
      }
    } catch (error) {
      console.error("[CHRiS] Payroll/performance automation scheduler failed:", error);
    } finally {
      running = false;
    }
  }

  return {
    start: async () => {
      await run();
      timer = setInterval(run, intervalMs);
      if (typeof timer.unref === "function") timer.unref();
    },
    stop: () => {
      if (timer) clearInterval(timer);
      timer = null;
    },
    run,
  };
}

module.exports = { createPayrollPeriodAutomationScheduler };
