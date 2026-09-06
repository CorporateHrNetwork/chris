const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.resolve(root, relativePath), "utf8");

test("ZERMATT Annual Leave carries unused year-end balance into Q1 and forfeits the remainder", () => {
  const policy = read("backend/src/services/zermattLeaveEntitlementService.js");
  const carryover = read("backend/src/services/zermattAnnualLeaveCarryoverService.js");
  const routes = read("backend/src/routes/zermattOperationsRoutes.js");
  const scheduler = read("backend/src/services/zermattAnnualCarryoverScheduler.js");
  const server = read("backend/src/server.js");
  const ui = read("src/components/leave/ZermattAnnualCarryoverPanel.jsx");
  const dashboard = read("src/pages/LeaveDashboard.jsx");

  assert.ok(policy.includes("allowCarryForward: annualCarryover"), "Annual policy must enable carry forward");
  assert.ok(policy.includes('carryForwardUsePriority: "CARRYOVER_FIRST"'), "carryover must be consumed before new-year entitlement");
  assert.ok(policy.includes('carryForwardExpiry: "03-31"'), "carryover expiry must be 31 March");
  assert.ok(policy.includes('carryForwardExpiryAction: "FORFEIT_UNUSED"'), "unused carryover must forfeit after Q1");

  for (const expected of [
    "previewAnnualCarryover",
    "applyAnnualCarryover",
    "forfeitExpiredCarryover",
    "CARRYOVER_SOURCE_YEAR_NOT_CLOSED",
    "CARRYOVER_PENDING_ANNUAL_REQUESTS",
    "CARRYOVER_TARGET_YEAR_ALREADY_IN_USE",
    "PENDING_REQUEST_REVIEW_REQUIRED",
    "q1AnnualUsage",
    "FORFEIT_REASON_PREFIX",
  ]) assert.ok(carryover.includes(expected), `missing carryover control: ${expected}`);

  assert.ok(carryover.includes('status: { in: ["APPROVED", "ACTIVE", "COMPLETED"] }'), "Q1 consumption must be based on approved lifecycle usage");
  assert.ok(carryover.includes("carriedForward: row.carryable"), "target balance must store carryover separately from opening entitlement");
  assert.ok(carryover.includes("adjusted: { increment: amount }"), "forfeiture must be an auditable balance adjustment rather than rewriting used leave");
  assert.ok(carryover.includes("leaveEntitlementAdjustment.create"), "forfeiture must append to the entitlement adjustment ledger");

  assert.ok(routes.includes('/leave-carryover/preview'), "Super User carryover preview endpoint missing");
  assert.ok(routes.includes('/leave-carryover/apply'), "Super User carryover apply endpoint missing");
  assert.ok(routes.includes('/leave-carryover/forfeit-expired'), "expired carryover endpoint missing");
  assert.ok(routes.includes("requireZermattSuperUser"), "carryover actions must remain ZERMATT Super User controlled");

  assert.ok(scheduler.includes("forfeitExpiredCarryover"), "automatic post-Q1 forfeiture scheduler missing");
  assert.ok(server.includes("annualCarryoverScheduler.start"), "carryover scheduler must start with CHRiS backend");
  assert.ok(server.includes("annualCarryoverScheduler.stop"), "carryover scheduler must stop cleanly with CHRiS backend");

  assert.ok(ui.includes("Annual Leave Carryover"), "carryover management UI missing");
  assert.ok(ui.includes("Preview Carryover"), "carryover preview action missing");
  assert.ok(ui.includes("Carry Forward to"), "carry-forward action missing");
  assert.ok(ui.includes("Forfeit Expired Carryover"), "forfeiture action missing");
  assert.ok(ui.includes("31 March"), "Q1 use-by rule must be visible to the Super User");
  assert.ok(dashboard.includes("ZermattAnnualCarryoverPanel"), "Leave Dashboard must surface carryover management for ZERMATT");

  console.log("PASS: ZERMATT Annual Leave carryover and Q1 forfeiture gate passed.");
});
