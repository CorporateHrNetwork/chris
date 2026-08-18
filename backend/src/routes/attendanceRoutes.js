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

const {
  updateWorkShift,
  deleteWorkShiftSafely,
} = require(
  "../services/workShiftLifecycleService"
);
const prisma =
  require("../config/prisma");

const {
  getShiftAssignments,
  listPublicHolidays,
  createPublicHoliday,
  deletePublicHoliday,
} = require(
  "../services/attendanceInsightsService"
);
const {
  updateShiftAssignment,
  endShiftAssignment,
  deleteShiftAssignmentSafely,
} = require(
  "../services/shiftAssignmentLifecycleService"
);
const {
  getPayrollAttendanceBasis,
  setPayrollAttendanceBasis,
  getWorkedHours,
  createManualPayrollInput,
  listManualPayrollInputs,
} = require(
  "../services/attendancePayrollService"
);
const {
  getScheduledVsActual,
  getEmployeeScheduledHourBasis,
} = require(
  "../services/attendanceScheduleComparisonService"
);
const {
  updateManualPayrollInput,
  deleteManualPayrollInput,
} = require(
  "../services/attendancePayrollInputLifecycleService"
);
const router =
  express.Router();

router.use(
  requireAuth
);

router.get(
  "/shifts",
  requirePermission(
    "attendance.view"
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
    "attendance.manage"
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

router.patch(
  "/shifts/:id",
  requirePermission(
    "attendance.manage"
  ),
  async (req, res) => {
    try {
      const shift =
        await updateWorkShift({
          organizationId:
            req.auth.organizationId,
          id:
            req.params.id,
          payload:
            req.body || {},
        });

      return res.json({
        status: "success",
        data: shift,
      });
    } catch (error) {
      return handleError(error, res);
    }
  }
);

router.delete(
  "/shifts/:id",
  requirePermission(
    "attendance.manage"
  ),
  async (req, res) => {
    try {
      await deleteWorkShiftSafely({
        organizationId:
          req.auth.organizationId,
        id:
          req.params.id,
      });

      return res.json({
        status: "success",
      });
    } catch (error) {
      return handleError(error, res);
    }
  }
);
router.post(
  "/shift-assignments",
  requirePermission(
    "attendance.manage"
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

router.patch(
  "/shift-assignments/:id",
  requirePermission(
    "attendance.manage"
  ),
  async (req, res) => {
    try {
      const assignment =
        await updateShiftAssignment({
          organizationId:
            req.auth.organizationId,
          id:
            req.params.id,
          payload:
            req.body || {},
        });

      return res.json({
        status: "success",
        data: assignment,
      });
    } catch (error) {
      return handleError(error, res);
    }
  }
);

router.post(
  "/shift-assignments/:id/end",
  requirePermission(
    "attendance.manage"
  ),
  async (req, res) => {
    try {
      const assignment =
        await endShiftAssignment({
          organizationId:
            req.auth.organizationId,
          id:
            req.params.id,
          effectiveTo:
            req.body?.effectiveTo,
        });

      return res.json({
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
router.delete(
  "/shift-assignments/:id",
  requirePermission(
    "attendance.manage"
  ),
  async (req, res) => {
    try {
      await deleteShiftAssignmentSafely({
        organizationId:
          req.auth.organizationId,
        id:
          req.params.id,
      });

      return res.json({
        status: "success",
      });
    } catch (error) {
      return handleError(error, res);
    }
  }
);
router.post(
  "/records",
  requirePermission(
    "attendance.manage"
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
    "attendance.view"
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


router.get(
  "/shift-assignments",
  requirePermission(
    "attendance.view"
  ),
  async (req, res) => {
    try {
      const assignments =
        await getShiftAssignments({
          organizationId:
            req.auth.organizationId,
          employeeNumber:
            req.query.employeeNumber,
        });

      return res.json({
        status: "success",
        data: assignments,
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
  "/public-holidays",
  requirePermission(
    "attendance.view"
  ),
  async (req, res) => {
    try {
      const holidays =
        await listPublicHolidays({
          organizationId:
            req.auth.organizationId,
        });

      return res.json({
        status: "success",
        data: holidays,
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
  "/public-holidays",
  requirePermission(
    "attendance.manage"
  ),
  async (req, res) => {
    try {
      const holiday =
        await createPublicHoliday({
          organizationId:
            req.auth.organizationId,
          payload:
            req.body || {},
        });

      return res
        .status(201)
        .json({
          status: "success",
          data: holiday,
        });
    } catch (error) {
      return handleError(
        error,
        res
      );
    }
  }
);

router.delete(
  "/public-holidays/:id",
  requirePermission(
    "attendance.manage"
  ),
  async (req, res) => {
    try {
      await deletePublicHoliday({
        organizationId:
          req.auth.organizationId,
        id:
          req.params.id,
      });

      return res.json({
        status: "success",
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
  "/worked-hours",
  requirePermission(
    "attendance.view"
  ),
  async (req, res) => {
    try {
      const data =
        await getWorkedHours({
          organizationId:
            req.auth.organizationId,
          from:
            req.query.from,
          to:
            req.query.to,
          employeeNumber:
            req.query.employeeNumber,
        });

      return res.json({
        status: "success",
        data,
      });
    } catch (error) {
      return handleError(error, res);
    }
  }
);

router.get(
  "/payroll-basis",
  requirePermission(
    "attendance.view"
  ),
  async (req, res) => {
    try {
      const data =
        await getPayrollAttendanceBasis({
          organizationId:
            req.auth.organizationId,
        });

      return res.json({
        status: "success",
        data,
      });
    } catch (error) {
      return handleError(error, res);
    }
  }
);

router.patch(
  "/payroll-basis",
  requirePermission(
    "attendance.manage"
  ),
  async (req, res) => {
    try {
      const data =
        await setPayrollAttendanceBasis({
          organizationId:
            req.auth.organizationId,
          basis:
            req.body?.basis,
          updatedByUserId:
            req.auth.userId,
        });

      return res.json({
        status: "success",
        data,
      });
    } catch (error) {
      return handleError(error, res);
    }
  }
);

router.get(
  "/manual-payroll-inputs",
  requirePermission(
    "attendance.view"
  ),
  async (req, res) => {
    try {
      const data =
        await listManualPayrollInputs({
          organizationId:
            req.auth.organizationId,
          from:
            req.query.from,
          to:
            req.query.to,
          employeeNumber:
            req.query.employeeNumber,
        });

      return res.json({
        status: "success",
        data,
      });
    } catch (error) {
      return handleError(error, res);
    }
  }
);

router.post(
  "/manual-payroll-inputs",
  requirePermission(
    "attendance.manage"
  ),
  async (req, res) => {
    try {
      const data =
        await createManualPayrollInput({
          organizationId:
            req.auth.organizationId,
          employeeNumber:
            req.body?.employeeNumber,
          periodStart:
            req.body?.periodStart,
          periodEnd:
            req.body?.periodEnd,
          workedHours:
            req.body?.workedHours,
          workedDays:
            req.body?.workedDays,
          notes:
            req.body?.notes,
          recordedByUserId:
            req.auth.userId,
        });

      return res.status(201).json({
        status: "success",
        data,
      });
    } catch (error) {
      return handleError(error, res);
    }
  }
);
router.get(
  "/scheduled-vs-actual",
  requirePermission(
    "attendance.view"
  ),
  async (req, res) => {
    try {
      const data =
        await getScheduledVsActual({
          organizationId:
            req.auth.organizationId,
          from:
            req.query.from,
          to:
            req.query.to,
          employeeNumber:
            req.query.employeeNumber,
        });

      return res.json({
        status:
          "success",
        data,
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
  "/scheduled-hour-basis",
  requirePermission(
    "attendance.view"
  ),
  async (req, res) => {
    try {
      const data =
        await getEmployeeScheduledHourBasis({
          organizationId:
            req.auth.organizationId,
          employeeNumber:
            req.query.employeeNumber,
          from:
            req.query.from,
          to:
            req.query.to,
        });

      return res.json({
        status: "success",
        data,
      });
    } catch (error) {
      return handleError(error, res);
    }
  }
);
router.patch(
  "/manual-payroll-inputs/:id",
  requirePermission(
    "attendance.manage"
  ),
  async (req, res) => {
    try {
      const data =
        await updateManualPayrollInput({
          organizationId:
            req.auth.organizationId,
          id:
            req.params.id,
          payload:
            req.body || {},
          recordedByUserId:
            req.auth.userId,
        });

      return res.json({
        status: "success",
        data,
      });
    } catch (error) {
      return handleError(error, res);
    }
  }
);

router.delete(
  "/manual-payroll-inputs/:id",
  requirePermission(
    "attendance.manage"
  ),
  async (req, res) => {
    try {
      await deleteManualPayrollInput({
        organizationId:
          req.auth.organizationId,
        id:
          req.params.id,
      });

      return res.json({
        status: "success",
      });
    } catch (error) {
      return handleError(error, res);
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
      "SHIFT_HAS_HISTORY",
      "EMPTY_SHIFT_UPDATE",
      "INVALID_SHIFT_GRACE",
      "INVALID_SHIFT_BREAK",
      "INVALID_SHIFT_CODE",
      "INVALID_SHIFT_NAME",
      "EMPLOYEE_NOT_FOUND",
      "SHIFT_NOT_FOUND",
      "INVALID_SHIFT_ASSIGNMENT_DATES",
      "SHIFT_ASSIGNMENT_HAS_HISTORY",
      "SHIFT_ASSIGNMENT_ALREADY_ENDED",
      "SHIFT_ASSIGNMENT_OVERLAP",
      "SHIFT_ASSIGNMENT_NOT_FOUND",
      "INVALID_ATTENDANCE_DATE",
      "INVALID_MANUAL_PAYROLL_ATTENDANCE",
      "MANUAL_PAYROLL_INPUT_DUPLICATE_PERIOD",
      "MANUAL_PAYROLL_INPUT_NOT_FOUND",
      "MANUAL_PAYROLL_ATTENDANCE_REQUIRED",
      "INVALID_PAYROLL_ATTENDANCE_PERIOD",
      "INVALID_PAYROLL_ATTENDANCE_BASIS",
      "INVALID_PUBLIC_HOLIDAY",
      "PUBLIC_HOLIDAY_NOT_FOUND",
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
