const prisma = require("../config/prisma");

function parseDate(value) {
  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    throw new Error(
      "INVALID_PAYROLL_ATTENDANCE_PERIOD"
    );
  }

  return date;
}

async function resolveInput({
  organizationId,
  id,
}) {
  const row =
    await prisma.attendancePayrollInput.findFirst({
      where: {
        id,
        organizationId,
      },
      include: {
        employee: {
          select: {
            employeeNumber:
              true,
          },
        },
      },
    });

  if (!row) {
    throw new Error(
      "MANUAL_PAYROLL_INPUT_NOT_FOUND"
    );
  }

  return row;
}

async function updateManualPayrollInput({
  organizationId,
  id,
  payload,
  recordedByUserId,
}) {
  const existing =
    await resolveInput({
      organizationId,
      id,
    });

  let employeeId =
    existing.employeeId;

  if (
    Object.prototype.hasOwnProperty.call(
      payload,
      "employeeNumber"
    )
  ) {
    const employee =
      await prisma.employee.findFirst({
        where: {
          organizationId,
          employeeNumber:
            String(
              payload.employeeNumber || ""
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

    employeeId =
      employee.id;
  }

  const periodStart =
    Object.prototype.hasOwnProperty.call(
      payload,
      "periodStart"
    )
      ? parseDate(
          payload.periodStart
        )
      : existing.periodStart;

  const periodEnd =
    Object.prototype.hasOwnProperty.call(
      payload,
      "periodEnd"
    )
      ? parseDate(
          payload.periodEnd
        )
      : existing.periodEnd;

  if (
    periodEnd <
    periodStart
  ) {
    throw new Error(
      "INVALID_PAYROLL_ATTENDANCE_PERIOD"
    );
  }

  const workedHours =
    Object.prototype.hasOwnProperty.call(
      payload,
      "workedHours"
    )
      ? (
          payload.workedHours ===
            null ||
          payload.workedHours ===
            ""
            ? null
            : Number(
                payload.workedHours
              )
        )
      : existing.workedHours;

  const workedDays =
    Object.prototype.hasOwnProperty.call(
      payload,
      "workedDays"
    )
      ? (
          payload.workedDays ===
            null ||
          payload.workedDays ===
            ""
            ? null
            : Number(
                payload.workedDays
              )
        )
      : existing.workedDays;

  if (
    workedHours ===
      null &&
    workedDays ===
      null
  ) {
    throw new Error(
      "MANUAL_PAYROLL_ATTENDANCE_REQUIRED"
    );
  }

  if (
    (
      workedHours !==
        null &&
      (
        !Number.isFinite(
          workedHours
        ) ||
        workedHours <
          0
      )
    ) ||
    (
      workedDays !==
        null &&
      (
        !Number.isFinite(
          workedDays
        ) ||
        workedDays <
          0
      )
    )
  ) {
    throw new Error(
      "INVALID_MANUAL_PAYROLL_ATTENDANCE"
    );
  }

  const duplicate =
    await prisma.attendancePayrollInput.findFirst({
      where: {
        organizationId,
        employeeId,
        periodStart,
        periodEnd,
        id: {
          not:
            existing.id,
        },
      },
      select: {
        id:
          true,
      },
    });

  if (duplicate) {
    throw new Error(
      "MANUAL_PAYROLL_INPUT_DUPLICATE_PERIOD"
    );
  }

  return prisma.attendancePayrollInput.update({
    where: {
      id:
        existing.id,
    },
    data: {
      employeeId,
      periodStart,
      periodEnd,
      workedHours,
      workedDays,
      notes:
        Object.prototype.hasOwnProperty.call(
          payload,
          "notes"
        )
          ? (
              payload.notes
                ? String(
                    payload.notes
                  ).trim()
                : null
            )
          : existing.notes,
      recordedByUserId:
        recordedByUserId ||
        existing.recordedByUserId ||
        null,
    },
  });
}

async function deleteManualPayrollInput({
  organizationId,
  id,
}) {
  const existing =
    await resolveInput({
      organizationId,
      id,
    });

  return prisma.attendancePayrollInput.delete({
    where: {
      id:
        existing.id,
    },
  });
}

module.exports = {
  updateManualPayrollInput,
  deleteManualPayrollInput,
};
