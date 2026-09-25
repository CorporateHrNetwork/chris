const { spawnSync } = require("node:child_process");

const mode = String(process.env.ZERMATT_EMPLOYMENT_LEVEL_V3_MODE || "OFF")
  .trim()
  .toUpperCase();

function runNode(args, label) {
  console.log(`\n[CHRiS startup] ${label}`);
  const result = spawnSync(process.execPath, args, {
    stdio: "inherit",
    env: process.env,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}`);
  }
}

function startServer() {
  console.log("\n[CHRiS startup] Starting API server.");
  require("../src/server.js");
}

try {
  if (!["OFF", "PREVIEW", "APPLY"].includes(mode)) {
    throw new Error(
      "ZERMATT_EMPLOYMENT_LEVEL_V3_MODE must be OFF, PREVIEW, or APPLY"
    );
  }

  if (mode === "PREVIEW") {
    runNode(
      ["scripts/apply-zermatt-employment-level-v3.cjs"],
      "ZERMATT V3 preview (read-only)"
    );
  }

  if (mode === "APPLY") {
    runNode(
      ["--test", "tests/zermattEmploymentLevelV3Acceptance.test.js"],
      "ZERMATT V3 acceptance tests"
    );
    runNode(
      ["scripts/apply-zermatt-employment-level-v3.cjs", "--apply"],
      "ZERMATT V3 controlled activation"
    );
    runNode(
      ["scripts/verify-zermatt-employment-level-v3.cjs"],
      "ZERMATT V3 post-activation verification"
    );
  }

  startServer();
} catch (error) {
  console.error("\n[CHRiS startup] Startup activation failed safely.");
  console.error(error);
  process.exit(1);
}
