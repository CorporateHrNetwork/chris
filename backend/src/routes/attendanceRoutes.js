const express =
  require("express");

const {
  requireAuth,
  requirePermission,
} = require(
  "../middleware/authMiddleware"
);

const {
  createWorkShift,
  assignShift,
  recordAttendance,
  getAttendanceReport,
} = require(
  "../services/attendanceService"
);

const prisma =
  require("../config/prisma");

const router =
  express.Router();

router.use(
  requireAuth
);

router.get(
  "/shifts",
  requirePermission(
    "employees.view"
  ),
  async (req, res) => {
    const shifts =
      await prisma.workShift.findMany({
        where: {
          organizationId:
            req.auth
              .organizationId,
        },
        orderBy: {
          name:
            "asc",
        },
      });

    return res.json({
      status:
        "success",
      data:
        shifts,
    });
  }
);

router.post(
  "/shifts",
  requirePermission(
    "employees.edit"
  ),
  async (req, res) => {
    try {
      const shift =
        await createWorkShift({
          organizationId:
            req.auth
              .organizationId,
          payload:
            req.body || {},
        });

      return res
        .status(201)
        .json({
          status:
            "success",
          data:
            shift,
        });
    } catch (error) {
      return handleError(
        error,
        res
      );
    }
  }
);

router.post(
  "/shift-assignments",
  requirePermission(
    "employees.edit"
  ),
  async (req, res) => {
    try {
      const assignment =
        await assignShift({
          organizationId:
            req.auth
              .organizationId,
          employeeNumber:
            req.body
              .employeeNumber,
          shiftId:
            req.body
              .shiftId,
          effectiveFrom:
            req.body
              .effectiveFrom,
          effectiveTo:
            req.body
              .effectiveTo,
        });

      return res
        .status(201)
        .json({
          status:
            "success",
          data:
            assignment,
        });
    } catch (error) {
      return handleError(
        error,
        res
      );
    }
  }
);

router.post(
  "/records",
  requirePermission(
    "employees.edit"
  ),
  async (req, res) => {
    try {
      const record =
        await recordAttendance({
          organizationId:
            req.auth
              .organizationId,
          employeeNumber:
            req.body
              .employeeNumber,
          attendanceDate:
            req.body
              .attendanceDate,
          clockIn:
            req.body
              .clockIn,
          clockOut:
            req.body
              .clockOut,
          status:
            req.body
              .status,
          source:
            req.body
              .source,
          notes:
            req.body
              .notes,
          recordedByUserId:
            req.auth.userId,
        });

      return res
        .status(201)
        .json({
          status:
            "success",
          data:
            record,
        });
    } catch (error) {
      return handleError(
        error,
        res
      );
    }
  }
);

router.get(
  "/report",
  requirePermission(
    "employees.view"
  ),
  async (req, res) => {
    try {
      const report =
        await getAttendanceReport({
          organizationId:
            req.auth
              .organizationId,
          from:
            req.query.from,
          to:
            req.query.to,
          employeeNumber:
            req.query
              .employeeNumber,
        });

      return res.json({
        status:
          "success",
        data:
          report,
      });
    } catch (error) {
      return handleError(
        error,
        res
      );
    }
  }
);

function handleError(
  error,
  res
) {
  console.error(
    "Attendance operation error:",
    error
  );

  const known =
    new Set([
      "INVALID_SHIFT_TIME",
      "EMPLOYEE_NOT_FOUND",
      "SHIFT_NOT_FOUND",
      "INVALID_SHIFT_ASSIGNMENT_DATES",
      "INVALID_ATTENDANCE_DATE",
    ]);

  if (
    known.has(
      error.message
    )
  ) {
    return res
      .status(
        error.message ===
          "EMPLOYEE_NOT_FOUND" ||
        error.message ===
          "SHIFT_NOT_FOUND"
          ? 404
          : 400
      )
      .json({
        status:
          "error",
        code:
          error.message,
      });
  }

  return res
    .status(500)
    .json({
      status:
        "error",
      message:
        "Unable to process attendance operation.",
    });
}

module.exports =
  router;
