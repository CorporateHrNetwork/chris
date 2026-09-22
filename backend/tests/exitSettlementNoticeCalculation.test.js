const test = require("node:test");
const assert = require("node:assert/strict");
const {
  noticeDaysBetween,
  resolveNoticePosition,
} = require("../src/services/exitSettlementService");

test("notice days given are the elapsed calendar days between notice and last working day", () => {
  assert.equal(noticeDaysBetween("2026-09-07", "2026-09-09"), 2);
  assert.equal(noticeDaysBetween("2026-09-07", "2026-09-07"), 0);
  assert.equal(noticeDaysBetween("2026-09-09", "2026-09-07"), 0);
});

test("notice deficiency is required notice less notice days given", () => {
  const result = resolveNoticePosition({
    noticeDate: "2026-09-07",
    lastWorkingDay: "2026-09-09",
    noticeStatus: "SERVED",
    entitledNoticeDays: 30,
  });
  assert.equal(result.entitledNoticeDays, 30);
  assert.equal(result.noticeDaysGiven, 2);
  assert.equal(result.noticeDeficiencyDays, 28);
  assert.equal(result.noticeExcessDays, 0);
});

test("waived or not-required notice does not create a deduction deficiency", () => {
  for (const status of ["WAIVED", "NOT_REQUIRED"]) {
    const result = resolveNoticePosition({
      noticeDate: null,
      lastWorkingDay: "2026-09-09",
      noticeStatus: status,
      entitledNoticeDays: 30,
    });
    assert.equal(result.noticeDeficiencyDays, 0);
    assert.equal(result.deductionWaived, true);
  }
});
