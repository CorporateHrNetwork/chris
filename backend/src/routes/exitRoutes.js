const express = require("express");

const prisma = require("../config/prisma");
const {
  requireAuth,
  requirePermission,
} = require("../middleware/authMiddleware");

const router = express.Router();
router.use(requireAuth);

const EXIT_TYPES = {
  RESIGNATION: "RESIGNED",
  TERMINATION: "TERMINATED",
  RETIREMENT: "RETIRED",
  END_OF_CONTRACT: "INACTIVE",
  REDUNDANCY: "TERMINATED",
  OTHER: "INACTIVE",
};

const DEFAULT_CLEARANCE = {
  assetsReturned: false,
  accessDisabled: false,
  handoverCompleted: false,
  financeCleared: false,
  payrollCleared: false,
  hrCleared: false,
};

function text(value) {
  const result = String(value || "").trim();
  return result || null;
}

function date(value) {
  if (!value) return null;
  const result = new Date(value);
  return Number.isNaN(result.getTime()) ? null : result;
}

function clearance(value) {
  return {
    ...DEFAULT_CLEARANCE,
    ...(value && typeof value === "object" ? value : {}),
  };
}

function isClear(value) {
  return Object.values(clearance(value)).every(Boolean);
}

function serialize(record) {
  return {
    ...record,
    clearance: clearance(record.clearance),
    clearanceComplete: isClear(record.clearance),
  };
}

router.get(
  "/",
  requirePermission("employees.view"),
  async (req, res) => {
    try {
      const data = await prisma.employeeExitProcess.findMany({
        where: { organizationId: req.auth.organizationId },
        include: {
          employee: {
            include: {
              department: true,
              designation: true,
              location: true,
            },
          },
          initiatedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          completedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
        orderBy: [{ status: "asc" }, { lastWorkingDay: "asc" }],
      });

      return res.json({
        status: "success",
        data: data.map(serialize),
      });
    } catch (error) {
      console.error("Load exit processes error:", error);
      return res.status(500).json({
        status: "error",
        message: "Unable to load employee exits.",
      });
    }
  }
);

router.post(
  "/",
  requirePermission("employees.update"),
  async (req, res) => {
    try {
      const organizationId = req.auth.organizationId;
      const employeeId = text(req.body?.employeeId);
      const exitType = String(req.body?.exitType || "").trim().toUpperCase();
      const lastWorkingDay = date(req.body?.lastWorkingDay);
      const reason = text(req.body?.reason);

      if (!employeeId) {
        return res.status(400).json({ status: "error", message: "Select an employee." });
      }

      if (!Object.prototype.hasOwnProperty.call(EXIT_TYPES, exitType)) {
        return res.status(400).json({ status: "error", message: "Select a valid exit type." });
      }

      if (!lastWorkingDay) {
        return res.status(400).json({ status: "error", message: "Enter the last working day." });
      }

      if (!reason) {
        return res.status(400).json({ status: "error", message: "Enter the reason for exit." });
      }

      const employee = await prisma.employee.findFirst({
        where: { id: employeeId, organizationId },
      });

      if (!employee) {
        return res.status(404).json({ status: "error", message: "Employee not found." });
      }

      if (["RESIGNED","TERMINATED","RETIRED","INACTIVE"].includes(employee.status)) {
        return res.status(409).json({
          status: "error",
          message: "This employee is already in an exited or inactive status.",
        });
      }

      const existing = await prisma.employeeExitProcess.findFirst({
        where: {
          organizationId,
          employeeId,
          status: { notIn: ["COMPLETED", "CANCELLED"] },
        },
      });

      if (existing) {
        return res.status(409).json({
          status: "error",
          message: "This employee already has an active exit process.",
        });
      }

      const data = await prisma.employeeExitProcess.create({
        data: {
          organizationId,
          employeeId,
          exitType,
          targetStatus: EXIT_TYPES[exitType],
          noticeDate: date(req.body?.noticeDate),
          noticeStatus: text(req.body?.noticeStatus) || "IN_PROGRESS",
          lastWorkingDay,
          reason,
          notes: text(req.body?.notes),
          clearance: DEFAULT_CLEARANCE,
          status: "IN_PROGRESS",
          initiatedByUserId: req.auth.userId || null,
        },
        include: {
          employee: {
            include: {
              department: true,
              designation: true,
              location: true,
            },
          },
        },
      });

      return res.status(201).json({
        status: "success",
        message: "Employee exit process initiated successfully.",
        data: serialize(data),
      });
    } catch (error) {
      console.error("Create exit process error:", error);
      return res.status(500).json({
        status: "error",
        message: "Unable to initiate employee exit.",
      });
    }
  }
);

router.patch(
  "/:id",
  requirePermission("employees.update"),
  async (req, res) => {
    try {
      const organizationId = req.auth.organizationId;
      const existing = await prisma.employeeExitProcess.findFirst({
        where: { id: req.params.id, organizationId },
      });

      if (!existing) {
        return res.status(404).json({ status: "error", message: "Exit process not found." });
      }

      if (["COMPLETED", "CANCELLED"].includes(existing.status)) {
        return res.status(409).json({
          status: "error",
          message: "Completed or cancelled exit processes cannot be edited.",
        });
      }

      const nextClearance = clearance({
        ...clearance(existing.clearance),
        ...(req.body?.clearance || {}),
      });

      const data = await prisma.employeeExitProcess.update({
        where: { id: existing.id },
        data: {
          clearance: nextClearance,
          status: isClear(nextClearance) ? "READY_TO_COMPLETE" : "IN_PROGRESS",
        },
        include: {
          employee: {
            include: {
              department: true,
              designation: true,
              location: true,
            },
          },
        },
      });

      return res.json({
        status: "success",
        message: "Exit clearance updated successfully.",
        data: serialize(data),
      });
    } catch (error) {
      console.error("Update exit process error:", error);
      return res.status(500).json({
        status: "error",
        message: "Unable to update exit process.",
      });
    }
  }
);

router.post(
  "/:id/cancel",
  requirePermission("employees.update"),
  async (req, res) => {
    try {
      const organizationId =
        req.auth.organizationId;

      const cancellationReason =
        String(
          req.body?.cancellationReason ||
            ""
        ).trim();

      if (!cancellationReason) {
        return res.status(400).json({
          status: "error",
          message:
            "A cancellation reason is required.",
        });
      }

      const exitProcess =
        await prisma.employeeExitProcess.findFirst({
          where: {
            id: req.params.id,
            organizationId,
          },
        });

      if (!exitProcess) {
        return res.status(404).json({
          status: "error",
          message:
            "Exit process not found.",
        });
      }

      if (
        exitProcess.status ===
        "COMPLETED"
      ) {
        return res.status(409).json({
          status: "error",
          message:
            "A completed exit cannot be cancelled.",
        });
      }

      if (
        exitProcess.status ===
        "CANCELLED"
      ) {
        return res.status(409).json({
          status: "error",
          message:
            "This exit process is already cancelled.",
        });
      }

      const cancelled =
        await prisma.employeeExitProcess.update({
          where: {
            id:
              exitProcess.id,
          },
          data: {
            status:
              "CANCELLED",
            cancellationReason,
            cancelledAt:
              new Date(),
            cancelledByUserId:
              req.auth.userId ||
              null,
          },
          include: {
            employee: {
              include: {
                department: true,
                designation: true,
                location: true,
              },
            },
          },
        });

      return res.json({
        status: "success",
        message:
          "Exit processing cancelled successfully.",
        data:
          serialize(cancelled),
      });
    } catch (error) {
      console.error(
        "Cancel exit process error:",
        error
      );

      return res.status(500).json({
        status: "error",
        message:
          "Unable to cancel exit processing.",
      });
    }
  }
);
router.post(
  "/:id/complete",
  requirePermission("employees.update"),
  async (req, res) => {
    try {
      const organizationId = req.auth.organizationId;

      const exitProcess = await prisma.employeeExitProcess.findFirst({
        where: { id: req.params.id, organizationId },
        include: {
          employee: { include: { user: true } },
        },
      });

      if (!exitProcess) {
        return res.status(404).json({ status: "error", message: "Exit process not found." });
      }

      if (exitProcess.status === "CANCELLED") {
        return res.status(409).json({
          status: "error",
          message: "A cancelled exit process cannot be completed.",
        });
      }

      if (exitProcess.status === "COMPLETED") {
        return res.status(409).json({
          status: "error",
          message: "This exit process is already completed.",
        });
      }

      if (!isClear(exitProcess.clearance)) {
        return res.status(409).json({
          status: "error",
          message: "Complete all exit clearance items before finalizing the exit.",
        });
      }

      if (exitProcess.lastWorkingDay > new Date()) {
        return res.status(409).json({
          status: "error",
          message: "The exit cannot be finalized before the employee's last working day.",
        });
      }

      const completed = await prisma.$transaction(async (tx) => {
        const employee = await tx.employee.findFirst({
          where: { id: exitProcess.employeeId, organizationId },
        });

        const episode = await tx.employeeEmploymentEpisode.findFirst({
          where: {
            organizationId,
            employeeId: employee.id,
            endDate: null,
          },
          orderBy: { sequenceNumber: "desc" },
        });

        await tx.employee.update({
          where: { id: employee.id },
          data: {
            status: exitProcess.targetStatus,
            exitDate: exitProcess.lastWorkingDay,
          },
        });

        if (episode) {
          await tx.employeeEmploymentEpisode.update({
            where: { id: episode.id },
            data: {
              endDate: exitProcess.lastWorkingDay,
              endStatus: exitProcess.targetStatus,
              endReason: exitProcess.reason,
              endDepartmentId: employee.departmentId,
              endDesignationId: employee.designationId,
              endLocationId: employee.locationId,
              notes: exitProcess.notes,
            },
          });
        }

        await tx.employeeLifecycleEvent.create({
          data: {
            organizationId,
            employeeId: employee.id,
            eventType: "EXITED",
            effectiveDate: exitProcess.lastWorkingDay,
            previousStatus: employee.status,
            newStatus: exitProcess.targetStatus,
            previousDepartmentId: employee.departmentId,
            newDepartmentId: employee.departmentId,
            previousDesignationId: employee.designationId,
            newDesignationId: employee.designationId,
            fromLocationId: employee.locationId,
            toLocationId: employee.locationId,
            reason: exitProcess.reason,
            notes: exitProcess.notes,
            performedByUserId: req.auth.userId || null,
          },
        });

        if (exitProcess.employee?.user?.id) {
          await tx.user.update({
            where: { id: exitProcess.employee.user.id },
            data: { isActive: false },
          });
        }

        return tx.employeeExitProcess.update({
          where: { id: exitProcess.id },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
            completedByUserId: req.auth.userId || null,
          },
          include: {
            employee: {
              include: {
                department: true,
                designation: true,
                location: true,
              },
            },
          },
        });
      });

      return res.json({
        status: "success",
        message: "Employee exit completed successfully.",
        data: serialize(completed),
      });
    } catch (error) {
      console.error("Complete exit process error:", error);
      return res.status(500).json({
        status: "error",
        message: error?.message || "Unable to complete employee exit.",
      });
    }
  }
);

module.exports = router;