const prisma = require("../config/prisma");

function parseDate(value, code) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(code);
  }

  return date;
}

function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

async function getPayrollAttendanceBasis({
  organizationId,
}) {
  const setting =
    await prisma.attendancePayrollSetting.findUnique({
      where: {
        organizationId,
      },
    });

  return {
    basis:
      setting?.basis ||
      "SYSTEM",
  };
}

async function setPayrollAttendanceBasis({
  organizationId,
  basis,
  updatedByUserId,
}) {
  const normalized =
    String(basis || "")
      .trim()
      .toUpperCase();

  if (
    ![
      "SYSTEM",
      "ADMIN_ENTERED",
    ].includes(normalized)
  ) {
    throw new Error(
      "INVALID_PAYROLL_ATTENDANCE_BASIS"
    );
  }

  return prisma.attendancePayrollSetting.upsert({
    where: {
      organizationId,
    },
    create: {
      organizationId,
      basis:
        normalized,
      updatedByUserId:
        updatedByUserId ||
        null,
    },
    update: {
      basis:
        normalized,
      updatedByUserId:
        updatedByUserId ||
        null,
    },
  });
}

async function getWorkedHours({
  organizationId,
  from,
  to,
  employeeNumber,
}) {
  const where = {
    organizationId,
  };

  if (from || to) {
    where.attendanceDate = {};

    if (from) {
      where.attendanceDate.gte =
        parseDate(
          from,
          "INVALID_ATTENDANCE_DATE"
        );
    }

    if (to) {
      where.attendanceDate.lte =
        parseDate(
          to,
          "INVALID_ATTENDANCE_DATE"
        );
    }
  }

  if (employeeNumber) {
    where.employee = {
      employeeNumber:
        String(
          employeeNumber
        ).trim(),
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
        shift:
          true,
      },
      orderBy: [
        {
          attendanceDate:
            "desc",
        },
        {
          createdAt:
            "desc",
        },
      ],
    });

  let totalHours = 0;
  let workedDays = 0;

  const calculated =
    records.map((record) => {
      let grossMinutes = 0;

      if (
        record.clockIn &&
        record.clockOut
      ) {
        const start =
          new Date(
            record.clockIn
          );

        const end =
          new Date(
            record.clockOut
          );

        if (
          !Number.isNaN(
            start.getTime()
          ) &&
          !Number.isNaN(
            end.getTime()
          ) &&
          end > start
        ) {
          grossMinutes =
            Math.max(
              0,
              Math.floor(
                (
                  end.getTime() -
                  start.getTime()
                ) /
                  60000
              )
            );
        }
      }

      const breakMinutes =
        grossMinutes > 0
          ? Math.min(
              grossMinutes,
              Math.max(
                0,
                Number(
                  record.shift
                    ?.breakMinutes ||
                    0
                )
              )
            )
          : 0;

      const netMinutes =
        Math.max(
          0,
          grossMinutes -
            breakMinutes
        );

      const status =
        String(
          record.status || ""
        ).toUpperCase();

      const workedDay =
        [
          "PRESENT",
          "LATE",
        ].includes(
          status
        );

      const grossWorkedHours =
        round2(
          grossMinutes /
            60
        );

      const breakHours =
        round2(
          breakMinutes /
            60
        );

      const netWorkedHours =
        round2(
          netMinutes /
            60
        );

      totalHours +=
        netWorkedHours;

      if (workedDay) {
        workedDays +=
          1;
      }

      return {
        id:
          record.id,
        attendanceDate:
          record.attendanceDate,
        employee: {
          employeeNumber:
            record.employee
              ?.employeeNumber ||
            "",
          name: [
            record.employee
              ?.firstName,
            record.employee
              ?.middleName,
            record.employee
              ?.lastName,
          ]
            .filter(Boolean)
            .join(" "),
        },
        shift:
          record.shift,
        clockIn:
          record.clockIn,
        clockOut:
          record.clockOut,
        status:
          record.status,
        grossWorkedHours,
        breakHours,
        netWorkedHours,
        workedDay,
      };
    });

  return {
    records:
      calculated,
    totals: {
      workedHours:
        round2(
          totalHours
        ),
      workedDays,
      recordCount:
        calculated.length,
    },
  };
}

async function createManualPayrollInput({
  organizationId,
  employeeNumber,
  periodStart,
  periodEnd,
  workedHours,
  workedDays,
  notes,
  recordedByUserId,
}) {
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
      },
    });

  if (!employee) {
    throw new Error(
      "EMPLOYEE_NOT_FOUND"
    );
  }

  const start =
    parseDate(
      periodStart,
      "INVALID_PAYROLL_ATTENDANCE_PERIOD"
    );

  const end =
    parseDate(
      periodEnd,
      "INVALID_PAYROLL_ATTENDANCE_PERIOD"
    );

  if (
    end < start
  ) {
    throw new Error(
      "INVALID_PAYROLL_ATTENDANCE_PERIOD"
    );
  }

  const hours =
    workedHours ===
      null ||
    workedHours ===
      undefined ||
    workedHours ===
      ""
      ? null
      : Number(
          workedHours
        );

  const days =
    workedDays ===
      null ||
    workedDays ===
      undefined ||
    workedDays ===
      ""
      ? null
      : Number(
          workedDays
        );

  if (
    hours === null &&
    days === null
  ) {
    throw new Error(
      "MANUAL_PAYROLL_ATTENDANCE_REQUIRED"
    );
  }

  if (
    (
      hours !== null &&
      (
        !Number.isFinite(
          hours
        ) ||
        hours < 0
      )
    ) ||
    (
      days !== null &&
      (
        !Number.isFinite(
          days
        ) ||
        days < 0
      )
    )
  ) {
    throw new Error(
      "INVALID_MANUAL_PAYROLL_ATTENDANCE"
    );
  }

  return prisma.attendancePayrollInput.upsert({
    where: {
      organizationId_employeeId_periodStart_periodEnd:
        {
          organizationId,
          employeeId:
            employee.id,
          periodStart:
            start,
          periodEnd:
            end,
        },
    },
    create: {
      organizationId,
      employeeId:
        employee.id,
      periodStart:
        start,
      periodEnd:
        end,
      workedHours:
        hours,
      workedDays:
        days,
      notes:
        notes
          ? String(
              notes
            ).trim()
          : null,
      recordedByUserId:
        recordedByUserId ||
        null,
    },
    update: {
      workedHours:
        hours,
      workedDays:
        days,
      notes:
        notes
          ? String(
              notes
            ).trim()
          : null,
      recordedByUserId:
        recordedByUserId ||
        null,
    },
  });
}

async function listManualPayrollInputs({
  organizationId,
  from,
  to,
  employeeNumber,
}) {
  const where = {
    organizationId,
  };

  if (
    from ||
    to
  ) {
    if (from) {
      where.periodEnd = {
        ...(where.periodEnd ||
          {}),
        gte:
          parseDate(
            from,
            "INVALID_PAYROLL_ATTENDANCE_PERIOD"
          ),
      };
    }

    if (to) {
      where.periodStart = {
        ...(where.periodStart ||
          {}),
        lte:
          parseDate(
            to,
            "INVALID_PAYROLL_ATTENDANCE_PERIOD"
          ),
      };
    }
  }

  if (employeeNumber) {
    where.employee = {
      employeeNumber:
        String(
          employeeNumber
        ).trim(),
    };
  }

  const rows =
    await prisma.attendancePayrollInput.findMany({
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
        recordedBy: {
          select: {
            firstName:
              true,
            lastName:
              true,
            email:
              true,
          },
        },
      },
      orderBy: {
        periodEnd:
          "desc",
      },
    });

  return rows.map(
    (row) => ({
      id:
        row.id,
      employeeNumber:
        row.employee
          .employeeNumber,
      employeeName: [
        row.employee
          .firstName,
        row.employee
          .middleName,
        row.employee
          .lastName,
      ]
        .filter(Boolean)
        .join(" "),
      periodStart:
        row.periodStart,
      periodEnd:
        row.periodEnd,
      workedHours:
        row.workedHours,
      workedDays:
        row.workedDays,
      notes:
        row.notes,
      recordedByName:
        [
          row.recordedBy
            ?.firstName,
          row.recordedBy
            ?.lastName,
        ]
          .filter(Boolean)
          .join(" ") ||
        row.recordedBy
          ?.email ||
        "",
      createdAt:
        row.createdAt,
      updatedAt:
        row.updatedAt,
    })
  );
}

module.exports = {
  getPayrollAttendanceBasis,
  setPayrollAttendanceBasis,
  getWorkedHours,
  createManualPayrollInput,
  listManualPayrollInputs,
};
