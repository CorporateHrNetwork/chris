const prisma = require("../config/prisma");

function parseDateOnly(value, code) {
  const text =
    String(value || "").trim();

  const match =
    /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);

  if (!match) {
    throw new Error(code);
  }

  const year =
    Number(match[1]);

  const month =
    Number(match[2]);

  const day =
    Number(match[3]);

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    );

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(code);
  }

  return date;
}

function normalizeStoredDate(value) {
  if (!value) {
    return null;
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate()
    )
  );
}

async function resolveAssignment({
  organizationId,
  id,
}) {
  const assignment =
    await prisma.employeeShiftAssignment.findFirst({
      where: {
        id,
        organizationId,
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeNumber: true,
          },
        },
        shift: true,
      },
    });

  if (!assignment) {
    throw new Error(
      "SHIFT_ASSIGNMENT_NOT_FOUND"
    );
  }

  return assignment;
}

async function assertShift({
  organizationId,
  shiftId,
}) {
  const shift =
    await prisma.workShift.findFirst({
      where: {
        id:
          shiftId,
        organizationId,
      },
      select: {
        id:
          true,
      },
    });

  if (!shift) {
    throw new Error(
      "SHIFT_NOT_FOUND"
    );
  }

  return shift;
}

async function assertNoOverlap({
  organizationId,
  employeeId,
  effectiveFrom,
  effectiveTo,
  excludeId,
}) {
  const upperBound =
    effectiveTo ||
    new Date(
      "9999-12-31T00:00:00.000Z"
    );

  const overlap =
    await prisma.employeeShiftAssignment.findFirst({
      where: {
        organizationId,
        employeeId,
        ...(excludeId
          ? {
              id: {
                not:
                  excludeId,
              },
            }
          : {}),
        effectiveFrom: {
          lte:
            upperBound,
        },
        OR: [
          {
            effectiveTo:
              null,
          },
          {
            effectiveTo: {
              gte:
                effectiveFrom,
            },
          },
        ],
      },
      select: {
        id:
          true,
      },
    });

  if (overlap) {
    throw new Error(
      "SHIFT_ASSIGNMENT_OVERLAP"
    );
  }
}

async function updateShiftAssignment({
  organizationId,
  id,
  payload,
}) {
  const assignment =
    await resolveAssignment({
      organizationId,
      id,
    });

  const shiftId =
    Object.prototype.hasOwnProperty.call(
      payload,
      "shiftId"
    )
      ? payload.shiftId
      : assignment.shiftId;

  const effectiveFrom =
    Object.prototype.hasOwnProperty.call(
      payload,
      "effectiveFrom"
    )
      ? parseDateOnly(
          payload.effectiveFrom,
          "INVALID_SHIFT_ASSIGNMENT_DATES"
        )
      : normalizeStoredDate(
          assignment.effectiveFrom
        );

  let effectiveTo =
    normalizeStoredDate(
      assignment.effectiveTo
    );

  if (
    Object.prototype.hasOwnProperty.call(
      payload,
      "effectiveTo"
    )
  ) {
    effectiveTo =
      payload.effectiveTo
        ? parseDateOnly(
            payload.effectiveTo,
            "INVALID_SHIFT_ASSIGNMENT_DATES"
          )
        : null;
  }

  if (
    effectiveTo &&
    effectiveTo < effectiveFrom
  ) {
    throw new Error(
      "INVALID_SHIFT_ASSIGNMENT_DATES"
    );
  }

  await assertShift({
    organizationId,
    shiftId,
  });

  await assertNoOverlap({
    organizationId,
    employeeId:
      assignment.employeeId,
    effectiveFrom,
    effectiveTo,
    excludeId:
      assignment.id,
  });

  return prisma.employeeShiftAssignment.update({
    where: {
      id:
        assignment.id,
    },
    data: {
      shiftId,
      effectiveFrom,
      effectiveTo,
    },
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
  });
}

async function endShiftAssignment({
  organizationId,
  id,
  effectiveTo,
}) {
  const assignment =
    await resolveAssignment({
      organizationId,
      id,
    });

  if (
    assignment.effectiveTo
  ) {
    throw new Error(
      "SHIFT_ASSIGNMENT_ALREADY_ENDED"
    );
  }

  const endDate =
    parseDateOnly(
      effectiveTo,
      "INVALID_SHIFT_ASSIGNMENT_DATES"
    );

  const startDate =
    normalizeStoredDate(
      assignment.effectiveFrom
    );

  if (
    !startDate ||
    endDate < startDate
  ) {
    throw new Error(
      "INVALID_SHIFT_ASSIGNMENT_DATES"
    );
  }

  return prisma.employeeShiftAssignment.update({
    where: {
      id:
        assignment.id,
    },
    data: {
      effectiveTo:
        endDate,
    },
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
  });
}

async function deleteShiftAssignmentSafely({
  organizationId,
  id,
}) {
  const assignment =
    await resolveAssignment({
      organizationId,
      id,
    });

  const attendanceCount =
    await prisma.attendanceRecord.count({
      where: {
        organizationId,
        employeeId:
          assignment.employeeId,
        shiftId:
          assignment.shiftId,
        attendanceDate: {
          gte:
            assignment.effectiveFrom,
          ...(assignment.effectiveTo
            ? {
                lte:
                  assignment.effectiveTo,
              }
            : {}),
        },
      },
    });

  if (
    attendanceCount > 0
  ) {
    throw new Error(
      "SHIFT_ASSIGNMENT_HAS_HISTORY"
    );
  }

  return prisma.employeeShiftAssignment.delete({
    where: {
      id:
        assignment.id,
    },
  });
}

module.exports = {
  assertNoOverlap,
  updateShiftAssignment,
  endShiftAssignment,
  deleteShiftAssignmentSafely,
};
