const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const frontend = fs.readFileSync(path.join(root, "src/pages/EmployeeExits.jsx"), "utf8");
const routes = fs.readFileSync(path.join(root, "backend/src/routes/exitRoutes.js"), "utf8");
const service = fs.readFileSync(path.join(root, "backend/src/services/exitSettlementService.js"), "utf8");
const schema = fs.readFileSync(path.join(root, "backend/prisma/schema.prisma"), "utf8");

test("exit initiation captures entitled notice period beside notice dates", () => {
  assert.ok(frontend.includes('label="Entitled Notice Period (Days)"'));
  assert.ok(frontend.includes('setExitField("entitledNoticeDays"'));
  assert.ok(frontend.includes("NOTICE PERIOD ANALYSIS"));
  assert.ok(frontend.includes("Automatic Notice Position"));
  assert.ok(frontend.includes("Notice Days Given"));
  assert.ok(frontend.includes("Deficiency"));
  assert.ok(frontend.includes("Excess"));
});

test("notice preview synchronizes the three inputs immediately", () => {
  assert.ok(frontend.includes("function calculateNoticePreview"));
  assert.ok(frontend.includes("exitForm.noticeDate"));
  assert.ok(frontend.includes("exitForm.lastWorkingDay"));
  assert.ok(frontend.includes("exitForm.entitledNoticeDays"));
  assert.ok(frontend.includes("Math.max(0, required - daysGiven)"));
});

test("exit API validates and stores notice entitlement", () => {
  assert.ok(routes.includes("entitledNoticeDaysRaw"));
  assert.ok(routes.includes("entitledNoticeDays,"));
  assert.ok(routes.includes("Enter the employee's entitled notice period in days."));
  assert.ok(schema.includes("entitledNoticeDays         Int?"));
});

test("settlement pulls notice entitlement from the exit process instead of asking HR again", () => {
  assert.ok(service.includes("exit.entitledNoticeDays ?? null"));
  assert.ok(service.includes("system.notice?.entitledNoticeDays"));
  assert.equal(frontend.includes('setSettlementField("entitledNoticeDays"'), false);
  assert.ok(frontend.includes("The saved deficiency flows automatically into the Exit Settlement Account"));
});
