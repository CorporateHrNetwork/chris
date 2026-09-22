require("dotenv").config({ quiet: true });

const app = require("../src/app");
const prisma = require("../src/config/prisma");

const HOST = "127.0.0.1";
const PORT = Number(process.env.ZERMATT_UAT_PORT || 5000);

const server = app.listen(PORT, HOST, () => {
  console.log(`CHRiS ZERMATT Release-1 UAT API running on http://${HOST}:${PORT}`);
  console.log("Mode: SCHEDULER_FREE_UAT");
  console.log("Workforce snapshot scheduler: NOT STARTED");
  console.log("ZERMATT annual carryover scheduler: NOT STARTED");
  console.log("Use this server for controlled browser UAT only. Stop with Ctrl+C when finished.");
});

let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  console.log(`CHRiS ZERMATT UAT server received ${signal}; shutting down.`);
  server.close(async () => {
    try {
      await prisma.$disconnect();
    } finally {
      process.exit(0);
    }
  });
}

server.on("error", async (error) => {
  console.error("CHRiS ZERMATT UAT server failed:", error?.stack || error);
  try { await prisma.$disconnect(); } catch {}
  process.exitCode = 1;
});

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
