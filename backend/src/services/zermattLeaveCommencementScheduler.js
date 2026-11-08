const { ZERMATT_SLUG, lagosToday } = require("./leaveReturnPayrollService");
const { utcDay } = require("./leaveDayCalculator");

const lifecycleConflicts = new Set([
  "LEAVE_REQUEST_NOT_FOUND",
  "LEAVE_NOT_APPROVED",
  "LEAVE_ALREADY_COMMENCED",
  "CURRENT_EMPLOYMENT_EPISODE_NOT_FOUND",
  "EMPLOYEE_STATUS_NOT_ELIGIBLE_FOR_LEAVE",
  "EMPLOYEE_ALREADY_ON_ACTIVE_LEAVE",
]);

function createZermattLeaveCommencementScheduler({ prisma, commenceLeave, intervalMs = 60000 }) {
  let timer;
  let running = false;

  async function run(now = new Date()) {
    if (running) return;
    running = true;
    try {
      const today = utcDay(lagosToday(now));
      const requests = await prisma.leaveRequest.findMany({
        where: {
          organization: { slug: ZERMATT_SLUG, status: "ACTIVE" },
          status: "APPROVED", cancelledAt: null, commencedAt: null,
          startDate: { lte: today }, endDate: { gte: today },
          employee: { status: { in: ["ACTIVE", "PROBATION"] } },
        },
        select: { id: true, organizationId: true, startDate: true },
        orderBy: [{ startDate: "asc" }, { id: "asc" }],
      });
      for (const request of requests) {
        try {
          await commenceLeave({
            organizationId: request.organizationId, leaveRequestId: request.id,
            effectiveDate: utcDay(request.startDate), zermatt: true,
          });
        } catch (error) {
          if (!lifecycleConflicts.has(error.message)) {
            console.error("Zermatt automatic leave commencement failed. Review database availability.");
          }
        }
      }
    } catch {
      console.error("Zermatt leave commencement scheduler could not load due requests.");
    } finally {
      running = false;
    }
  }

  return {
    run,
    start() {
      if (timer) return;
      void run();
      timer = setInterval(run, intervalMs);
      timer.unref?.();
    },
    stop() {
      clearInterval(timer);
      timer = null;
    },
  };
}

module.exports = { createZermattLeaveCommencementScheduler };
