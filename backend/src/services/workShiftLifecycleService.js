const prisma = require("../config/prisma");

function validateTime(value) {
  const match =
    /^(\d{2}):(\d{2})$/.exec(
      String(value || "").trim()
    );

  if (!match) {
    throw new Error("INVALID_SHIFT_TIME");
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    throw new Error("INVALID_SHIFT_TIME");
  }
}

function normalizePatch(payload) {
  const data = {};

  if ("name" in payload) {
    data.name = String(payload.name || "").trim();
    if (!data.name) throw new Error("INVALID_SHIFT_NAME");
  }

  if ("code" in payload) {
    data.code = String(payload.code || "").trim().toUpperCase();
    if (!data.code) throw new Error("INVALID_SHIFT_CODE");
  }

  if ("startTime" in payload) {
    validateTime(payload.startTime);
    data.startTime = payload.startTime;
  }

  if ("endTime" in payload) {
    validateTime(payload.endTime);
    data.endTime = payload.endTime;
  }

  if ("breakMinutes" in payload) {
    const value = Number(payload.breakMinutes);
    if (!Number.isFinite(value) || value < 0) {
      throw new Error("INVALID_SHIFT_BREAK");
    }
    data.breakMinutes = Math.trunc(value);
  }

  if ("graceMinutes" in payload) {
    const value = Number(payload.graceMinutes);
    if (!Number.isFinite(value) || value < 0) {
      throw new Error("INVALID_SHIFT_GRACE");
    }
    data.graceMinutes = Math.trunc(value);
  }

  if ("crossesMidnight" in payload) {
    data.crossesMidnight = Boolean(payload.crossesMidnight);
  }

  if ("isActive" in payload) {
    data.isActive = Boolean(payload.isActive);
  }

  return data;
}

async function updateWorkShift({
  organizationId,
  id,
  payload,
}) {
  const existing = await prisma.workShift.findFirst({
    where: {
      id,
      organizationId,
    },
    select: {
      id: true,
    },
  });

  if (!existing) throw new Error("SHIFT_NOT_FOUND");

  const data = normalizePatch(payload || {});
  if (!Object.keys(data).length) {
    throw new Error("EMPTY_SHIFT_UPDATE");
  }

  return prisma.workShift.update({
    where: {
      id: existing.id,
    },
    data,
  });
}

async function deleteWorkShiftSafely({
  organizationId,
  id,
}) {
  const existing = await prisma.workShift.findFirst({
    where: {
      id,
      organizationId,
    },
    select: {
      id: true,
    },
  });

  if (!existing) throw new Error("SHIFT_NOT_FOUND");

  const [assignmentCount, attendanceCount] =
    await prisma.$transaction([
      prisma.employeeShiftAssignment.count({
        where: {
          organizationId,
          shiftId: existing.id,
        },
      }),
      prisma.attendanceRecord.count({
        where: {
          organizationId,
          shiftId: existing.id,
        },
      }),
    ]);

  if (assignmentCount > 0 || attendanceCount > 0) {
    throw new Error("SHIFT_HAS_HISTORY");
  }

  return prisma.workShift.delete({
    where: {
      id: existing.id,
    },
  });
}

module.exports = {
  updateWorkShift,
  deleteWorkShiftSafely,
};
