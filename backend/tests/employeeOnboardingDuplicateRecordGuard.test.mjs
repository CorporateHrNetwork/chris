import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const routesPath = path.join(root, "backend/src/routes/onboardingRoutes.js");
const source = fs.readFileSync(routesPath, "utf8");

assert.match(
  source,
  /latestCompletedByEmployee/,
  "Tracker must identify each employee's latest completed onboarding."
);

assert.match(
  source,
  /isStaleActiveRecord/,
  "Tracker must explicitly identify stale active onboarding duplicates."
);

assert.match(
  source,
  /activeCreatedAt\s*<=\s*completedBoundary/,
  "An active onboarding created before the completed onboarding boundary must be treated as stale."
);

assert.match(
  source,
  /if\s*\(\s*isStaleActiveRecord\(record\)\s*\)\s*\{\s*return false;/s,
  "Stale active onboarding rows must not be exposed as current tracker rows."
);

assert.match(
  source,
  /const\s+\[existing,\s*latestCompleted\]\s*=\s*await Promise\.all/s,
  "Start Onboarding must resolve active and completed records together."
);

assert.match(
  source,
  /code:\s*"ONBOARDING_ALREADY_COMPLETED"/,
  "Start Onboarding must return the completed onboarding instead of reopening a stale active duplicate."
);

assert.match(
  source,
  /code:\s*"ACTIVE_ONBOARDING_REUSED"/,
  "A genuinely current active onboarding must still be reused."
);

console.log(
  "PASS: duplicate onboarding tracker/start safeguards are present."
);
