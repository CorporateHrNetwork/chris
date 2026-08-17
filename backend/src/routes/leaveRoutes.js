const express =
  require("express");

const {
  requireAuth,
  requirePermission,
  requireAnyPermission,
} = require(
  "../middleware/authMiddleware"
);

const {
  submitLeaveRequest,
  reviewLeaveRequest,
  cancelLeaveRequest,
  getEmployeeBalances,
} = require(
  "../services/leaveService"
);

const prisma =
  require("../config/prisma");

const router =
  express.Router();

router.use(
  requireAuth
);

router.get(
  "/types",

  requirePermission(
    "employees.view"
  ),

  async (req, res) => {
    const types =
      await prisma.leaveType.findMany({
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
        types,
    });
  }
);

router.get(
  "/policies",

  requirePermission(
    "employees.view"
  ),

  async (req, res) => {
    const policies =
      await prisma.leavePolicy.findMany({
        where: {
          organizationId:
            req.auth
              .organizationId,
        },
        include: {
          leaveType: true,
        },
        orderBy: {
          effectiveFrom:
            "desc",
        },
      });

    return res.json({
      status:
        "success",
      data:
        policies,
    });
  }
);

router.get(
  "/balances/:employeeNumber",

  requirePermission(
    "employees.view"
  ),

  async (req, res) => {
    try {
      const result =
        await getEmployeeBalances({
          organizationId:
            req.auth
              .organizationId,
          employeeNumber:
            req.params
              .employeeNumber,
          leaveYear:
            req.query
              .leaveYear,
        });

      if (!result) {
        return res
          .status(404)
          .json({
            status:
              "error",
            message:
              "Employee not found.",
          });
      }

      return res.json({
        status:
          "success",
        data:
          result,
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
  "/requests",

  requireAnyPermission(
    "employees.view",
    "employees.edit"
  ),

  async (req, res) => {
    try {
      const request =
        await submitLeaveRequest({
          organizationId:
            req.auth
              .organizationId,
          employeeNumber:
            req.body
              .employeeNumber,
          leaveTypeId:
            req.body
              .leaveTypeId,
          startDate:
            req.body
              .startDate,
          endDate:
            req.body
              .endDate,
          requestedUnits:
            req.body
              .requestedUnits,
          reason:
            req.body
              .reason,
          attachmentUrl:
            req.body
              .attachmentUrl,
        });

      return res
        .status(201)
        .json({
          status:
            "success",
          data:
            request,
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
  "/requests/:id/review",

  requirePermission(
    "employees.edit"
  ),

  async (req, res) => {
    try {
      const result =
        await reviewLeaveRequest({
          organizationId:
            req.auth
              .organizationId,
          leaveRequestId:
            req.params.id,
          reviewerUserId:
            req.auth.userId,
          decision:
            req.body
              .decision,
          reviewNotes:
            req.body
              .reviewNotes,
        });

      return res.json({
        status:
          "success",
        data:
          result,
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
  "/requests/:id/cancel",

  requireAnyPermission(
    "employees.view",
    "employees.edit"
  ),

  async (req, res) => {
    try {
      const result =
        await cancelLeaveRequest({
          organizationId:
            req.auth
              .organizationId,
          leaveRequestId:
            req.params.id,
          cancellationReason:
            req.body
              .cancellationReason,
        });

      return res.json({
        status:
          "success",
        data:
          result,
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
    "Leave operation error:",
    error
  );

  const validationErrors =
    new Set([
      "EMPLOYEE_NOT_FOUND",
      "LEAVE_TYPE_NOT_FOUND",
      "LEAVE_POLICY_NOT_FOUND",
      "INVALID_LEAVE_DATES",
      "INVALID_REQUESTED_UNITS",
      "LEAVE_NOT_ELIGIBLE",
      "ATTACHMENT_REQUIRED",
      "LEAVE_REQUEST_OVERLAP",
      "INSUFFICIENT_LEAVE_BALANCE",
      "MAX_NEGATIVE_BALANCE_EXCEEDED",
      "INVALID_REVIEW_DECISION",
      "LEAVE_REQUEST_NOT_FOUND",
      "LEAVE_REQUEST_NOT_PENDING",
      "LEAVE_REQUEST_ALREADY_CANCELLED",
      "LEAVE_REQUEST_NOT_CANCELLABLE",
      "LEAVE_BALANCE_NOT_FOUND",
      "LEAVE_BALANCE_INTEGRITY_ERROR",
    ]);

  if (
    validationErrors.has(
      error.message
    )
  ) {
    return res
      .status(
        error.message ===
          "EMPLOYEE_NOT_FOUND" ||
        error.message ===
          "LEAVE_TYPE_NOT_FOUND" ||
        error.message ===
          "LEAVE_REQUEST_NOT_FOUND"
          ? 404
          : 400
      )
      .json({
        status:
          "error",
        code:
          error.message,
        message:
          error.message
            .replace(
              /_/g,
              " "
            )
            .toLowerCase(),
        details:
          error.details ||
          undefined,
      });
  }

  return res
    .status(500)
    .json({
      status:
        "error",
      message:
        "Unable to process leave operation.",
    });
}

module.exports =
  router;
