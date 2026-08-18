const prisma = require("../config/prisma");

function parseDateOnly(value, fallback) {
  if (!value) return fallback;

  const match =
    /^(\d{4})-(\d{2})-(\d{2})$/.exec(
      String(value).trim()
    );

  if (!match) {
    throw new Error("INVALID_ATTENDANCE_DATE");
  }

  const date = new Date(
    Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3])
    )
  );

  if (Number.isNaN(date.getTime())) {
    throw new Error("INVALID_ATTENDANCE_DATE");
  }

  return date;
}

function dateKey(date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

function startOfTodayUtc() {
  const now = new Date();

  return new Date(
    Date.UTC(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    )
  );
}

function parseClock(value) {
  const match =
    /^(\d{2}):(\d{2})$/.exec(
      String(value || "")
    );

  if (!match) {
    return null;
  }

  return {
    hours: Number(match[1]),
    minutes: Number(match[2]),
  };
}

function scheduledMinutesForShift(shift) {
  if (!shift) return 0;

  const start = parseClock(shift.startTime);
  const end = parseClock(shift.endTime);

  if (!start || !end) return 0;

  let startMinutes =
    start.hours * 60 +
    start.minutes;

  let endMinutes =
    end.hours * 60 +
    end.minutes;

  if (
    shift.crossesMidnight ||
    endMinutes <= startMinutes
  ) {
    endMinutes += 24 * 60;
  }

  return Math.max(
    0,
    endMinutes -
      startMinutes -
      Math.max(
        0,
        Number(
          shift.breakMinutes || 0
        )
      )
  );
}

function elapsedScheduledMinutesForToday({
  shift,
  now,
}) {
  if (!shift) return 0;

  const start = parseClock(shift.startTime);
  const end = parseClock(shift.endTime);

  if (!start || !end) return 0;

  const startDate = new Date(now);
  startDate.setHours(
    start.hours,
    start.minutes,
    0,
    0
  );

  const endDate = new Date(now);
  endDate.setHours(
    end.hours,
    end.minutes,
    0,
    0
  );

  if (
    shift.crossesMidnight ||
    endDate <= startDate
  ) {
    endDate.setDate(
      endDate.getDate() + 1
    );
  }

  if (now <= startDate) {
    return 0;
  }

  const capped =
    now < endDate
      ? now
      : endDate;

  let elapsed =
    Math.floor(
      (
        capped.getTime() -
        startDate.getTime()
      ) /
        60000
    );

  const totalScheduled =
    scheduledMinutesForShift(
      shift
    );

  const grossShiftMinutes =
    Math.max(
      0,
      Math.floor(
        (
          endDate.getTime() -
          startDate.getTime()
        ) /
          60000
      )
    );

  if (
    grossShiftMinutes > 0 &&
    totalScheduled <
      grossShiftMinutes &&
    elapsed >=
      grossShiftMinutes
  ) {
    elapsed =
      totalScheduled;
  }

  return Math.max(
    0,
    Math.min(
      elapsed,
      totalScheduled
    )
  );
}

function round2(value) {
  return Math.round(
    (
      Number(value || 0) +
      Number.EPSILON
    ) *
      100
  ) / 100;
}

function assignmentApplies(
  assignment,
  date
) {
  const assignmentStart =
    new Date(
      assignment.effectiveFrom
    );

  const assignmentEnd =
    assignment.effectiveTo
      ? new Date(
          assignment.effectiveTo
        )
      : null;

  return (
    assignmentStart <=
      date &&
    (
      !assignmentEnd ||
      assignmentEnd >=
        date
    )
  );
}

async function loadScheduleContext({
  organizationId,
  employees,
  start,
  end,
}) {
  const employeeIds =
    employees.map(
      (employee) =>
        employee.id
    );

  const [
    assignments,
    holidays,
    attendanceRecords,
  ] =
    await Promise.all([
      prisma.employeeShiftAssignment.findMany({
        where: {
          organizationId,
          employeeId: {
            in:
              employeeIds,
          },
          effectiveFrom: {
            lte:
              end,
          },
          OR: [
            {
              effectiveTo:
                null,
            },
            {
              effectiveTo: {
                gte:
                  start,
              },
            },
          ],
        },
        include: {
          shift:
            true,
        },
        orderBy: {
          effectiveFrom:
            "asc",
        },
      }),

      prisma.publicHoliday.findMany({
        where: {
          organizationId,
          holidayDate: {
            gte:
              start,
            lte:
              end,
          },
        },
        select: {
          holidayDate:
            true,
          name:
            true,
        },
      }),

      prisma.attendanceRecord.findMany({
        where: {
          organizationId,
          employeeId: {
            in:
              employeeIds,
          },
          attendanceDate: {
            gte:
              start,
            lte:
              end,
          },
        },
        include: {
          shift:
            true,
        },
      }),
    ]);

  const assignmentMap =
    new Map();

  for (const assignment of assignments) {
    if (
      !assignmentMap.has(
        assignment.employeeId
      )
    ) {
      assignmentMap.set(
        assignment.employeeId,
        []
      );
    }

    assignmentMap
      .get(
        assignment.employeeId
      )
      .push(
        assignment
      );
  }

  const holidayMap =
    new Map(
      holidays.map(
        (holiday) => [
          dateKey(
            new Date(
              holiday.holidayDate
            )
          ),
          holiday.name,
        ]
      )
    );

  const attendanceMap =
    new Map();

  for (const record of attendanceRecords) {
    attendanceMap.set(
      `${record.employeeId}:${dateKey(
        new Date(
          record.attendanceDate
        )
      )}`,
      record
    );
  }

  return {
    assignmentMap,
    holidayMap,
    attendanceMap,
  };
}

async function getEmployeeScheduledHourBasis({
  organizationId,
  employeeNumber,
  from,
  to,
}) {
  const today =
    startOfTodayUtc();

  const start =
    parseDateOnly(
      from,
      addDays(today, -30)
    );

  const requestedEnd =
    parseDateOnly(
      to,
      today
    );

  const end =
    requestedEnd > today
      ? today
      : requestedEnd;

  if (end < start) {
    throw new Error(
      "INVALID_ATTENDANCE_DATE"
    );
  }

  const employee =
    await prisma.employee.findFirst({
      where: {
        organizationId,
        employeeNumber:
          String(
            employeeNumber || ""
          ).trim(),
      },
      select: {
        id:
          true,
        employeeNumber:
          true,
        firstName:
          true,
        middleName:
          true,
        lastName:
          true,
      },
    });

  if (!employee) {
    throw new Error(
      "EMPLOYEE_NOT_FOUND"
    );
  }

  const {
    assignmentMap,
    holidayMap,
  } =
    await loadScheduleContext({
      organizationId,
      employees: [
        employee,
      ],
      start,
      end,
    });

  const employeeAssignments =
    assignmentMap.get(
      employee.id
    ) || [];

  let scheduledMinutes = 0;
  let scheduledDays = 0;

  for (
    let date = new Date(start);
    date <= end;
    date = addDays(
      date,
      1
    )
  ) {
    const key =
      dateKey(date);

    if (
      holidayMap.has(
        key
      )
    ) {
      continue;
    }

    const assignment =
      [...employeeAssignments]
        .reverse()
        .find(
          (item) =>
            assignmentApplies(
              item,
              date
            )
        );

    if (!assignment) {
      continue;
    }

    const minutes =
      scheduledMinutesForShift(
        assignment.shift
      );

    if (
      minutes > 0
    ) {
      scheduledMinutes +=
        minutes;
      scheduledDays +=
        1;
    }
  }

  const dailyHours =
    scheduledDays > 0
      ? round2(
          (
            scheduledMinutes /
            60
          ) /
            scheduledDays
        )
      : null;

  return {
    employeeNumber:
      employee.employeeNumber,
    employeeName: [
      employee.firstName,
      employee.middleName,
      employee.lastName,
    ]
      .filter(Boolean)
      .join(" "),
    period: {
      from:
        dateKey(start),
      to:
        dateKey(end),
    },
    scheduledDays,
    scheduledHours:
      round2(
        scheduledMinutes /
          60
      ),
    dailyHoursBasis:
      dailyHours,
  };
}

async function getScheduledVsActual({
  organizationId,
  from,
  to,
  employeeNumber,
}) {
  const today =
    startOfTodayUtc();

  const start =
    parseDateOnly(
      from,
      addDays(today, -30)
    );

  const requestedEnd =
    parseDateOnly(
      to,
      today
    );

  const end =
    requestedEnd > today
      ? today
      : requestedEnd;

  if (end < start) {
    throw new Error(
      "INVALID_ATTENDANCE_DATE"
    );
  }

  const employeeWhere = {
    organizationId,
  };

  if (employeeNumber) {
    employeeWhere.employeeNumber =
      String(
        employeeNumber
      ).trim();
  }

  const employees =
    await prisma.employee.findMany({
      where:
        employeeWhere,
      select: {
        id:
          true,
        employeeNumber:
          true,
        firstName:
          true,
        middleName:
          true,
        lastName:
          true,
      },
      orderBy: {
        employeeNumber:
          "asc",
      },
    });

  if (!employees.length) {
    return {
      period: {
        from:
          dateKey(start),
        to:
          dateKey(end),
      },
      totals: {
        scheduledCompletedDays:
          0,
        scheduledHours:
          0,
        actualWorkedDays:
          0,
        actualWorkedHours:
          0,
        varianceHours:
          0,
      },
      employees: [],
      records: [],
    };
  }

  const {
    assignmentMap,
    holidayMap,
    attendanceMap,
  } =
    await loadScheduleContext({
      organizationId,
      employees,
      start,
      end,
    });

  const now =
    new Date();

  const rows = [];
  const employeeTotals =
    new Map();

  for (
    let date = new Date(start);
    date <= end;
    date = addDays(
      date,
      1
    )
  ) {
    const key =
      dateKey(date);

    for (const employee of employees) {
      const employeeAssignments =
        assignmentMap.get(
          employee.id
        ) || [];

      const assignment =
        [...employeeAssignments]
          .reverse()
          .find(
            (item) =>
              assignmentApplies(
                item,
                date
              )
          );

      const holidayName =
        holidayMap.get(
          key
        ) || null;

      const record =
        attendanceMap.get(
          `${employee.id}:${key}`
        ) || null;

      let scheduledMinutes =
        0;

      let scheduledCompletedDay =
        false;

      if (
        assignment &&
        !holidayName
      ) {
        if (
          date < today
        ) {
          scheduledMinutes =
            scheduledMinutesForShift(
              assignment.shift
            );

          scheduledCompletedDay =
            scheduledMinutes >
            0;
        } else if (
          date.getTime() ===
          today.getTime()
        ) {
          scheduledMinutes =
            elapsedScheduledMinutesForToday({
              shift:
                assignment.shift,
              now,
            });
        }
      }

      let actualMinutes =
        0;

      if (
        record?.clockIn &&
        record?.clockOut
      ) {
        const clockIn =
          new Date(
            record.clockIn
          );

        const clockOut =
          new Date(
            record.clockOut
          );

        if (
          !Number.isNaN(
            clockIn.getTime()
          ) &&
          !Number.isNaN(
            clockOut.getTime()
          ) &&
          clockOut >
            clockIn
        ) {
          const grossMinutes =
            Math.floor(
              (
                clockOut.getTime() -
                clockIn.getTime()
              ) /
                60000
            );

          actualMinutes =
            Math.max(
              0,
              grossMinutes -
                Math.max(
                  0,
                  Number(
                    record.shift
                      ?.breakMinutes ||
                      assignment
                        ?.shift
                        ?.breakMinutes ||
                      0
                  )
                )
            );
        }
      }

      const status =
        String(
          record?.status ||
            ""
        ).toUpperCase();

      const actualWorkedDay =
        [
          "PRESENT",
          "LATE",
        ].includes(
          status
        );

      const current =
        employeeTotals.get(
          employee.id
        ) || {
          employee,
          scheduledCompletedDays:
            0,
          scheduledMinutes:
            0,
          actualWorkedDays:
            0,
          actualMinutes:
            0,
        };

      if (
        scheduledCompletedDay
      ) {
        current.scheduledCompletedDays +=
          1;
      }

      current.scheduledMinutes +=
        scheduledMinutes;

      if (actualWorkedDay) {
        current.actualWorkedDays +=
          1;
      }

      current.actualMinutes +=
        actualMinutes;

      employeeTotals.set(
        employee.id,
        current
      );

      if (
        assignment ||
        record ||
        holidayName
      ) {
        rows.push({
          date:
            key,
          employee: {
            employeeNumber:
              employee.employeeNumber,
            name: [
              employee.firstName,
              employee.middleName,
              employee.lastName,
            ]
              .filter(Boolean)
              .join(" "),
          },
          shift:
            assignment?.shift
              ? {
                  id:
                    assignment.shift.id,
                  name:
                    assignment.shift.name,
                  startTime:
                    assignment.shift.startTime,
                  endTime:
                    assignment.shift.endTime,
                  breakMinutes:
                    assignment.shift.breakMinutes,
                }
              : null,
          holiday:
            holidayName,
          scheduledHours:
            round2(
              scheduledMinutes /
                60
            ),
          scheduledCompletedDay,
          actualHours:
            round2(
              actualMinutes /
                60
            ),
          actualWorkedDay,
          varianceHours:
            round2(
              (
                actualMinutes -
                scheduledMinutes
              ) /
                60
            ),
          attendanceStatus:
            record?.status ||
            null,
          clockIn:
            record?.clockIn ||
            null,
          clockOut:
            record?.clockOut ||
            null,
        });
      }
    }
  }

  const employeesSummary =
    Array.from(
      employeeTotals.values()
    ).map((item) => ({
      employee: {
        employeeNumber:
          item.employee
            .employeeNumber,
        name: [
          item.employee
            .firstName,
          item.employee
            .middleName,
          item.employee
            .lastName,
        ]
          .filter(Boolean)
          .join(" "),
      },
      scheduledCompletedDays:
        item.scheduledCompletedDays,
      scheduledHours:
        round2(
          item.scheduledMinutes /
            60
        ),
      actualWorkedDays:
        item.actualWorkedDays,
      actualWorkedHours:
        round2(
          item.actualMinutes /
            60
        ),
      varianceHours:
        round2(
          (
            item.actualMinutes -
            item.scheduledMinutes
          ) /
            60
        ),
    }));

  const totals =
    employeesSummary.reduce(
      (acc, item) => {
        acc.scheduledCompletedDays +=
          item.scheduledCompletedDays;

        acc.scheduledHours +=
          item.scheduledHours;

        acc.actualWorkedDays +=
          item.actualWorkedDays;

        acc.actualWorkedHours +=
          item.actualWorkedHours;

        return acc;
      },
      {
        scheduledCompletedDays:
          0,
        scheduledHours:
          0,
        actualWorkedDays:
          0,
        actualWorkedHours:
          0,
      }
    );

  totals.scheduledHours =
    round2(
      totals.scheduledHours
    );

  totals.actualWorkedHours =
    round2(
      totals.actualWorkedHours
    );

  totals.varianceHours =
    round2(
      totals.actualWorkedHours -
        totals.scheduledHours
    );

  return {
    period: {
      from:
        dateKey(start),
      to:
        dateKey(end),
    },
    totals,
    employees:
      employeesSummary,
    records:
      rows,
  };
}

module.exports = {
  getScheduledVsActual,
  getEmployeeScheduledHourBasis,
};
