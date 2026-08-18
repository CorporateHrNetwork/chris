const prisma = require("../config/prisma");

async function getShiftAssignments({
  organizationId,
  employeeNumber,
}) {
  const where = {
    organizationId,
  };

  if (employeeNumber) {
    where.employee = {
      employeeNumber:
        String(employeeNumber).trim(),
    };
  }

  return prisma.employeeShiftAssignment.findMany({
    where,
    include: {
      employee: {
        select: {
          employeeNumber: true,
          firstName: true,
          middleName: true,
          lastName: true,
        },
      },
      shift: true,
    },
    orderBy: [
      {
        effectiveFrom:
          "desc",
      },
      {
        createdAt:
          "desc",
      },
    ],
  });
}

async function listPublicHolidays({
  organizationId,
}) {
  return prisma.publicHoliday.findMany({
    where: {
      organizationId,
    },
    orderBy: {
      holidayDate:
        "asc",
    },
  });
}

async function createPublicHoliday({
  organizationId,
  payload,
}) {
  const name =
    String(
      payload.name || ""
    ).trim();

  const holidayDate =
    new Date(
      payload.holidayDate
    );

  if (
    !name ||
    Number.isNaN(
      holidayDate.getTime()
    )
  ) {
    throw new Error(
      "INVALID_PUBLIC_HOLIDAY"
    );
  }

  holidayDate.setHours(
    0,
    0,
    0,
    0
  );

  return prisma.publicHoliday.create({
    data: {
      organizationId,
      name,
      holidayDate,
      isRecurring:
        Boolean(
          payload.isRecurring
        ),
      notes:
        payload.notes
          ? String(
              payload.notes
            ).trim()
          : null,
    },
  });
}

async function deletePublicHoliday({
  organizationId,
  id,
}) {
  const holiday =
    await prisma.publicHoliday.findFirst({
      where: {
        id,
        organizationId,
      },
      select: {
        id: true,
      },
    });

  if (!holiday) {
    throw new Error(
      "PUBLIC_HOLIDAY_NOT_FOUND"
    );
  }

  return prisma.publicHoliday.delete({
    where: {
      id:
        holiday.id,
    },
  });
}

module.exports = {
  getShiftAssignments,
  listPublicHolidays,
  createPublicHoliday,
  deletePublicHoliday,
};
