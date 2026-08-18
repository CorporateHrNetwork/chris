const prisma = require("../config/prisma");

function parseTime(value) {
  const match =
    /^(\d{2}):(\d{2})$/.exec(
      String(value || "").trim()
    );

  if (!match) {
    throw new Error(
      "INVALID_SHIFT_TIME"
    );
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    throw new Error(
      "INVALID_SHIFT_TIME"
    );
  }

  return {
    hours,
    minutes,
  };
}

function combineDateAndTime(
  date,
  time,
  addDay = false
) {
  const base =
    new Date(date);

  if (
    Number.isNaN(
      base.getTime()
    )
  ) {
    throw new Error(
      "INVALID_ATTENDANCE_DATE"
    );
  }

  const parsed =
    parseTime(time);

  const result =
    new Date(base);

  result.setHours(
    parsed.hours,
    parsed.minutes,
    0,
    0
  );

  if (addDay) {
    result.setDate(
      result.getDate() + 1
    );
  }

  return result;
}

function calculateAttendanceMetrics({
  attendanceDate,
  shift,
  clockIn,
  clockOut,
}) {
  if (!shift) {
    return {
      lateMinutes: 0,
      overtimeMinutes: 0,
    };
  }

  const shiftStart =
    combineDateAndTime(
      attendanceDate,
      shift.startTime,
      false
    );

  const shiftEnd =
    combineDateAndTime(
      attendanceDate,
      shift.endTime,
      Boolean(
        shift.crossesMidnight
      )
    );

  const graceMinutes =
    Number(
      shift.graceMinutes || 0
    );

  let lateMinutes = 0;
  let overtimeMinutes = 0;

  if (clockIn) {
    const inTime =
      new Date(clockIn);

    const diff =
      Math.floor(
        (
          inTime.getTime() -
          shiftStart.getTime()
        ) /
          60000
      );

    lateMinutes =
      Math.max(
        0,
        diff - graceMinutes
      );
  }

  if (clockOut) {
    const outTime =
      new Date(clockOut);

    const diff =
      Math.floor(
        (
          outTime.getTime() -
          shiftEnd.getTime()
        ) /
          60000
      );

    overtimeMinutes =
      Math.max(
        0,
        diff
      );
  }

  return {
    lateMinutes,
    overtimeMinutes,
  };
}

async function getActiveShiftAssignment({
  organizationId,
  employeeId,
  attendanceDate,
}) {
  return prisma.employeeShiftAssignment.findFirst({
    where: {
      organizationId,
      employeeId,
      effectiveFrom: {
        lte:
          attendanceDate,
      },
      OR: [
        {
          effectiveTo: null,
        },
        {
          effectiveTo: {
            gte:
              attendanceDate,
          },
        },
      ],
    },
    include: {
      shift: true,
    },
    orderBy: {
      effectiveFrom:
        "desc",
    },
  });
}

async function hasApprovedLeave({
  organizationId,
  employeeId,
  attendanceDate,
}) {
  return prisma.leaveRequest.findFirst({
    where: {
      organizationId,
      employeeId,
      status: "APPROVED",
      startDate: {
        lte:
          attendanceDate,
      },
      endDate: {
        gte:
          attendanceDate,
      },
    },
    select: {
      id: true,
    },
  });
}

async function createWorkShift({
  organizationId,
  payload,
}) {
  parseTime(payload.startTime);
  parseTime(payload.endTime);

  return prisma.workShift.create({
    data: {
      organizationId,
      name:
        String(
          payload.name || ""
        ).trim(),
      code:
        String(
          payload.code || ""
        )
          .trim()
          .toUpperCase(),
      startTime:
        payload.startTime,
      endTime:
        payload.endTime,
      breakMinutes:
        Number(
          payload.breakMinutes || 0
        ),
      graceMinutes:
        Number(
          payload.graceMinutes || 0
        ),
      crossesMidnight:
        Boolean(
          payload.crossesMidnight
        ),
      isActive:
        payload.isActive !==
        false,
    },
  });
}

async function assignShift({
  organizationId,
  employeeNumber,
  shiftId,
  effectiveFrom,
  effectiveTo,
}) {
  const employee =
    await prisma.employee.findFirst({
      where: {
        organizationId,
        employeeNumber,
      },
      select: {
        id: true,
      },
    });

  if (!employee) {
    throw new Error(
      "EMPLOYEE_NOT_FOUND"
    );
  }

  const shift =
    await prisma.workShift.findFirst({
      where: {
        id: shiftId,
        organizationId,
        isActive: true,
      },
    });

  if (!shift) {
    throw new Error(
      "SHIFT_NOT_FOUND"
    );
  }

  const start =
    new Date(
      effectiveFrom
    );

  const end =
    effectiveTo
      ? new Date(
          effectiveTo
        )
      : null;

  if (
    Number.isNaN(
      start.getTime()
    ) ||
    (
      end &&
      (
        Number.isNaN(
          end.getTime()
        ) ||
        end < start
      )
    )
  ) {
    throw new Error(
      "INVALID_SHIFT_ASSIGNMENT_DATES"
    );
  }

    const overlappingAssignment =
    await prisma.employeeShiftAssignment.findFirst({
      where: {
        organizationId,
        employeeId:
          employee.id,
        effectiveFrom: {
          lte:
            end ||
            new Date("9999-12-31T00:00:00.000Z"),
        },
        OR: [
          {
            effectiveTo: null,
          },
          {
            effectiveTo: {
              gte:
                start,
            },
          },
        ],
      },
      select: {
        id: true,
      },
    });

  if (overlappingAssignment) {
    throw new Error(
      "SHIFT_ASSIGNMENT_OVERLAP"
    );
  }
return prisma.employeeShiftAssignment.create({
    data: {
      organizationId,
      employeeId:
        employee.id,
      shiftId,
      effectiveFrom:
        start,
      effectiveTo:
        end,
    },
  });
}

async function recordAttendance({
  organizationId,
  employeeNumber,
  attendanceDate,
  clockIn,
  clockOut,
  status,
  source,
  notes,
  recordedByUserId,
}) {
  return prisma.$transaction(
    async (tx) => {
      const employee =
        await tx.employee.findFirst({
          where: {
            organizationId,
            employeeNumber,
          },
          select: {
            id: true,
            status: true,
          },
        });

      if (!employee) {
        throw new Error(
          "EMPLOYEE_NOT_FOUND"
        );
      }

      const date =
        new Date(
          attendanceDate
        );

      if (
        Number.isNaN(
          date.getTime()
        )
      ) {
        throw new Error(
          "INVALID_ATTENDANCE_DATE"
        );
      }

      const dayStart =
        new Date(date);

      dayStart.setHours(
        0,
        0,
        0,
        0
      );

      const leave =
        await tx.leaveRequest.findFirst({
          where: {
            organizationId,
            employeeId:
              employee.id,
            status:
              "APPROVED",
            startDate: {
              lte:
                dayStart,
            },
            endDate: {
              gte:
                dayStart,
            },
          },
          select: {
            id: true,
          },
        });

      const assignment =
        await tx.employeeShiftAssignment.findFirst({
          where: {
            organizationId,
            employeeId:
              employee.id,
            effectiveFrom: {
              lte:
                dayStart,
            },
            OR: [
              {
                effectiveTo:
                  null,
              },
              {
                effectiveTo: {
                  gte:
                    dayStart,
                },
              },
            ],
          },
          include: {
            shift: true,
          },
          orderBy: {
            effectiveFrom:
              "desc",
          },
        });

      const finalStatus =
        leave
          ? "ON_LEAVE"
          : String(
              status ||
              "PRESENT"
            )
              .trim()
              .toUpperCase();

      const inTime =
        clockIn
          ? new Date(
              clockIn
            )
          : null;

      const outTime =
        clockOut
          ? new Date(
              clockOut
            )
          : null;

      const metrics =
        calculateAttendanceMetrics({
          attendanceDate:
            dayStart,
          shift:
            assignment
              ?.shift ||
            null,
          clockIn:
            inTime,
          clockOut:
            outTime,
        });

      const resolvedStatus =
        !leave &&
        finalStatus ===
          "PRESENT" &&
        metrics.lateMinutes > 0
          ? "LATE"
          : finalStatus;

      return tx.attendanceRecord.upsert({
        where: {
          organizationId_employeeId_attendanceDate:
            {
              organizationId,
              employeeId:
                employee.id,
              attendanceDate:
                dayStart,
            },
        },
        update: {
          shiftId:
            assignment
              ?.shiftId ||
            null,
          clockIn:
            inTime,
          clockOut:
            outTime,
          status:
            resolvedStatus,
          lateMinutes:
            leave
              ? 0
              : metrics.lateMinutes,
          overtimeMinutes:
            leave
              ? 0
              : metrics.overtimeMinutes,
          source:
            source ||
            "MANUAL",
          notes:
            notes ||
            null,
          recordedByUserId,
        },
        create: {
          organizationId,
          employeeId:
            employee.id,
          shiftId:
            assignment
              ?.shiftId ||
            null,
          attendanceDate:
            dayStart,
          clockIn:
            inTime,
          clockOut:
            outTime,
          status:
            resolvedStatus,
          lateMinutes:
            leave
              ? 0
              : metrics.lateMinutes,
          overtimeMinutes:
            leave
              ? 0
              : metrics.overtimeMinutes,
          source:
            source ||
            "MANUAL",
          notes:
            notes ||
            null,
          recordedByUserId,
        },
      });
    }
  );
}

async function getAttendanceReport({
  organizationId,
  from,
  to,
  employeeNumber,
}) {
  const start =
    from
      ? new Date(from)
      : null;

  const end =
    to
      ? new Date(to)
      : null;

  const where = {
    organizationId,
  };

  if (start || end) {
    where.attendanceDate =
      {};

    if (start) {
      where.attendanceDate.gte =
        start;
    }

    if (end) {
      where.attendanceDate.lte =
        end;
    }
  }

  if (employeeNumber) {
    where.employee = {
      employeeNumber,
    };
  }

  const records =
    await prisma.attendanceRecord.findMany({
      where,
      include: {
        employee: {
          select: {
            employeeNumber:
              true,
            firstName:
              true,
            middleName:
              true,
            lastName:
              true,
          },
        },
        shift: true,
      },
      orderBy: [
        {
          attendanceDate:
            "desc",
        },
        {
          employee: {
            employeeNumber:
              "asc",
          },
        },
      ],
    });

  const totals =
    records.reduce(
      (acc, record) => {
        acc.records += 1;
        acc.lateMinutes +=
          record.lateMinutes;
        acc.overtimeMinutes +=
          record.overtimeMinutes;

        acc.byStatus[
          record.status
        ] =
          (
            acc.byStatus[
              record.status
            ] ||
            0
          ) + 1;

        return acc;
      },
      {
        records: 0,
        lateMinutes: 0,
        overtimeMinutes: 0,
        byStatus: {},
      }
    );

  return {
    from:
      start,
    to:
      end,
    totals,
    records,
  };
}

module.exports = {
  parseTime,
  combineDateAndTime,
  calculateAttendanceMetrics,
  getActiveShiftAssignment,
  hasApprovedLeave,
  createWorkShift,
  assignShift,
  recordAttendance,
  getAttendanceReport,
};
