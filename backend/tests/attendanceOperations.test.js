const assert =
  require("assert");

const {
  parseTime,
  calculateAttendanceMetrics,
} = require(
  "../src/services/attendanceService"
);

assert.deepEqual(
  parseTime("08:30"),
  {
    hours: 8,
    minutes: 30,
  }
);

const metrics =
  calculateAttendanceMetrics({
    attendanceDate:
      new Date(
        "2026-08-17T00:00:00"
      ),
    shift: {
      startTime:
        "08:00",
      endTime:
        "17:00",
      graceMinutes:
        10,
      crossesMidnight:
        false,
    },
    clockIn:
      new Date(
        "2026-08-17T08:25:00"
      ),
    clockOut:
      new Date(
        "2026-08-17T18:00:00"
      ),
  });

assert.equal(
  metrics.lateMinutes,
  15
);

assert.equal(
  metrics.overtimeMinutes,
  60
);

console.log(
  "PASS: CHRIS attendance operations unit tests passed."
);
