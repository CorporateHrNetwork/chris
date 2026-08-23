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

const PORT = process.env.PORT || 5000;
const paystackConfigured = Boolean(String(process.env.PAYSTACK_SECRET_KEY || "").trim());

console.log(`CHRIS Paystack configured: ${paystackConfigured ? "YES" : "NO"}`);

const snapshotScheduler = createWorkforceSnapshotScheduler({ prisma });
const server = app.listen(PORT, async () => {
  console.log(`CHRIS API running on http://localhost:${PORT}`);
  if (shouldAutoStartSnapshotScheduler()) {
    try {
      await snapshotScheduler.start();
      console.log("CHRIS workforce snapshot scheduler started.");
    } catch (error) {
      console.error("CHRIS workforce snapshot scheduler startup failed:", error);
    }
  }
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`CHRIS API received ${signal}; shutting down.`);
  snapshotScheduler.stop();
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
