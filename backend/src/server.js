const path = require("path");

require("dotenv").config({
  path: path.join(__dirname, "../.env"),
});

const app = require("./app");
const prisma = require("./config/prisma");
const {
  createWorkforceSnapshotScheduler,
  shouldAutoStartSnapshotScheduler,
} = require("./services/workforceSnapshotScheduler");
const { createZermattAnnualCarryoverScheduler } = require("./services/zermattAnnualCarryoverScheduler");
const { createPayrollPeriodAutomationScheduler } = require("./services/payrollPeriodAutomationScheduler");

const { createScheduler } = require("./services/performanceEvaluationService");
const performanceEvaluationScheduler = createScheduler(prisma);

const PORT = process.env.PORT || 5000;
const isSalesDemo = true; // This isolated branch serves fictional demo tenants only.
const paystackConfigured = Boolean(String(process.env.PAYSTACK_SECRET_KEY || "").trim());

console.log(`CHRIS Paystack configured: ${paystackConfigured ? "YES" : "NO"}`);
console.log(`CHRIS sales demo mode: ${isSalesDemo ? "ON" : "OFF"}`);

const snapshotScheduler = createWorkforceSnapshotScheduler({ prisma });
const payrollPeriodAutomationScheduler = createPayrollPeriodAutomationScheduler({ prisma });
const annualCarryoverScheduler = isSalesDemo ? null : createZermattAnnualCarryoverScheduler({ prisma });

const server = app.listen(PORT, async () => {
  console.log(`CHRIS API running on http://localhost:${PORT}`);
  // No automated customer actions or data changes run in the sales demo.
  if (!isSalesDemo) performanceEvaluationScheduler.start();
  if (!isSalesDemo && shouldAutoStartSnapshotScheduler()) {
    try {
      await snapshotScheduler.start();
      console.log("CHRIS workforce snapshot scheduler started.");
    } catch (error) {
      console.error("CHRIS workforce snapshot scheduler startup failed:", error);
    }
  }
  try {
    if (!isSalesDemo) await payrollPeriodAutomationScheduler.start();
    if (!isSalesDemo) console.log("CHRIS payroll/performance automation scheduler started.");
  } catch (error) {
    console.error("CHRIS payroll/performance automation scheduler startup failed:", error);
  }
  if (annualCarryoverScheduler) {
    try {
      await annualCarryoverScheduler.start();
      console.log("CHRIS Annual Leave carryover scheduler started.");
    } catch (error) {
      console.error("CHRIS Annual Leave carryover scheduler startup failed:", error);
    }
  } else {
    console.log("CHRIS Zermatt Annual Leave carryover scheduler disabled in sales demo.");
  }
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`CHRIS API received ${signal}; shutting down.`);
  snapshotScheduler.stop();
  performanceEvaluationScheduler.stop();
  if (annualCarryoverScheduler) annualCarryoverScheduler.stop();
  payrollPeriodAutomationScheduler.stop();
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
