const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");

const prisma = require("../config/prisma");
const {
  requireAuth,
  requirePermission,
} = require("../middleware/authMiddleware");
const {
  closeLineManagerAssignmentsForExit,
} = require("../services/lineManagerService");

const { getExitRegister } = require("../services/exitRegisterService");
const { assertTerminationReady } = require("../services/terminationGovernanceService");
const settlements = require("../services/exitSettlementService");

const router = express.Router();
router.use(requireAuth);
const EXIT_DOCUMENT_TYPES = {
  RESIGNATION_LETTER: "Resignation Letter",
  TERMINATION_LETTER: "Termination Letter",
  RETIREMENT_NOTICE: "Retirement Notice",
  END_OF_CONTRACT_NOTICE: "End of Contract Notice",
  REDUNDANCY_NOTICE: "Redundancy Notice",
  EXIT_ACCEPTANCE_LETTER: "Exit / Resignation Acceptance Letter",
  CLEARANCE_DOCUMENT: "Exit Clearance Document",
  HANDOVER_DOCUMENT: "Handover Document",
  OTHER_EXIT_DOCUMENT: "Other Exit Document",
};

const exitUploadRoot = path.join(process.cwd(), "uploads", "exit-documents");
fs.mkdirSync(exitUploadRoot, { recursive: true });

const exitDocumentUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, callback) => callback(null, exitUploadRoot),
    filename: (req, file, callback) => {
      const safeOriginal = String(file.originalname || "exit-document")
        .replace(/[^A-Za-z0-9._-]+/g, "_")
        .slice(-120);
      callback(
        null,
        `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${safeOriginal}`
      );
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function mapExitDocument(document) {
  return {
    ...document,
    categoryLabel: EXIT_DOCUMENT_TYPES[document.category] || document.category,
  };
}


router.get(
  "/:id/documents",
  requirePermission("employees.view"),
  async (req, res) => {
    try {
      const exitProcess = await prisma.employeeExitProcess.findFirst({
        where: {
          id: req.params.id,
          organizationId: req.auth.organizationId,
        },
        select: { id: true },
      });
      if (!exitProcess) {
        return res.status(404).json({ status: "error", message: "Exit process not found." });
      }

      const documents = await prisma.employeeDocument.findMany({
        where: {
          organizationId: req.auth.organizationId,
          exitProcessId: exitProcess.id,
        },
        orderBy: { createdAt: "desc" },
      });

      return res.json({
        status: "success",
        data: documents.map(mapExitDocument),
        documentTypes: EXIT_DOCUMENT_TYPES,
      });
    } catch (error) {
      console.error("Load exit documents error:", error);
      return res.status(500).json({ status: "error", message: "Unable to load exit documents." });
    }
  }
);

router.post(
  "/:id/documents",
  requirePermission("employees.update"),
  exitDocumentUpload.single("document"),
  async (req, res) => {
    try {
      const exitProcess = await prisma.employeeExitProcess.findFirst({
        where: {
          id: req.params.id,
          organizationId: req.auth.organizationId,
        },
        select: {
          id: true,
          employeeId: true,
          exitType: true,
          status: true,
        },
      });

      if (!exitProcess) {
        if (req.file?.path) fs.unlink(req.file.path, () => {});
        return res.status(404).json({ status: "error", message: "Exit process not found." });
      }

      const category = String(req.body?.category || "").trim().toUpperCase();
      if (!EXIT_DOCUMENT_TYPES[category]) {
        if (req.file?.path) fs.unlink(req.file.path, () => {});
        return res.status(400).json({ status: "error", message: "Select a valid exit document type." });
      }
      if (!req.file) {
        return res.status(400).json({ status: "error", message: "Choose an exit document to upload." });
      }

      const document = await prisma.$transaction(async (tx) => {
        const created = await tx.employeeDocument.create({
          data: {
            organizationId: req.auth.organizationId,
            employeeId: exitProcess.employeeId,
            exitProcessId: exitProcess.id,
            category,
            originalName: req.file.originalname,
            storedName: req.file.filename,
            mimeType: req.file.mimetype,
            sizeBytes: req.file.size,
            storagePath: req.file.path,
            notes: req.body?.notes ? String(req.body.notes).trim() : null,
            uploadedByUserId: req.auth.userId || null,
          },
        });

        await tx.organizationAudit.create({
          data: {
            organizationId: req.auth.organizationId,
            actorUserId: req.auth.userId || null,
            entityType: "EmployeeExitProcess",
            entityId: exitProcess.id,
            action: "EXIT_DOCUMENT_UPLOADED",
            newValue: {
              documentId: created.id,
              category,
              originalName: created.originalName,
              employeeId: exitProcess.employeeId,
            },
            reason: "Exit supporting document uploaded",
          },
        });

        return created;
      });

      return res.status(201).json({
        status: "success",
        message: "Exit document uploaded successfully.",
        data: mapExitDocument(document),
      });
    } catch (error) {
      if (req.file?.path) fs.unlink(req.file.path, () => {});
      console.error("Upload exit document error:", error);
      return res.status(500).json({ status: "error", message: "Unable to upload exit document." });
    }
  }
);

router.delete(
  "/:id/documents/:documentId",
  requirePermission("employees.update"),
  async (req, res) => {
    try {
      const document = await prisma.employeeDocument.findFirst({
        where: {
          id: req.params.documentId,
          organizationId: req.auth.organizationId,
          exitProcessId: req.params.id,
        },
      });
      if (!document) {
        return res.status(404).json({ status: "error", message: "Exit document not found." });
      }

      await prisma.$transaction(async (tx) => {
        await tx.employeeDocument.delete({ where: { id: document.id } });
        await tx.organizationAudit.create({
          data: {
            organizationId: req.auth.organizationId,
            actorUserId: req.auth.userId || null,
            entityType: "EmployeeExitProcess",
            entityId: req.params.id,
            action: "EXIT_DOCUMENT_DELETED",
            previousValue: {
              documentId: document.id,
              category: document.category,
              originalName: document.originalName,
            },
            reason: "Exit supporting document deleted",
          },
        });
      });

      if (document.storagePath && fs.existsSync(document.storagePath)) {
        fs.unlink(document.storagePath, () => {});
      }

      return res.json({ status: "success", message: "Exit document deleted." });
    } catch (error) {
      console.error("Delete exit document error:", error);
      return res.status(500).json({ status: "error", message: "Unable to delete exit document." });
    }
  }
);

router.get("/register", requirePermission("employees.view"), async (req, res) => {
  try {
    const data = await getExitRegister(prisma, req.auth.organizationId);
    return res.json({ status: "success", data });
  } catch (error) {
    console.error("Load exit register error:", error);
    return res.status(500).json({ status: "error", message: "Unable to load the exit register." });
  }
});

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
      const noticeStatus = text(req.body?.noticeStatus) || "IN_PROGRESS";
      const entitledNoticeDaysRaw = req.body?.entitledNoticeDays;
      const entitledNoticeDays =
        entitledNoticeDaysRaw === "" || entitledNoticeDaysRaw == null
          ? null
          : Number(entitledNoticeDaysRaw);
      const reason = text(req.body?.reason);
      const terminationReasonClass = text(req.body?.terminationReasonClass)?.toUpperCase() || null;
      const terminationAuthorityUserId = text(req.body?.terminationAuthorityUserId);
      const disciplinaryCaseId = text(req.body?.disciplinaryCaseId);

      if (!employeeId) {
        return res.status(400).json({ status: "error", message: "Select an employee." });
      }

      if (!Object.prototype.hasOwnProperty.call(EXIT_TYPES, exitType)) {
        return res.status(400).json({ status: "error", message: "Select a valid exit type." });
      }

      if (!lastWorkingDay) {
        return res.status(400).json({ status: "error", message: "Enter the last working day." });
      }

      if (
        entitledNoticeDays != null &&
        (!Number.isInteger(entitledNoticeDays) || entitledNoticeDays < 0)
      ) {
        return res.status(400).json({
          status: "error",
          message: "Entitled notice period must be a whole number of days.",
        });
      }

      if (
        !["WAIVED", "NOT_REQUIRED"].includes(String(noticeStatus).toUpperCase()) &&
        (!Number.isInteger(entitledNoticeDays) || entitledNoticeDays <= 0)
      ) {
        return res.status(400).json({
          status: "error",
          message: "Enter the employee's entitled notice period in days.",
        });
      }

      if (!reason) {
        return res.status(400).json({ status: "error", message: "Enter the reason for exit." });
      }
      if (EXIT_TYPES[exitType] === "TERMINATED" && (!terminationReasonClass || !terminationAuthorityUserId)) {
        return res.status(400).json({ status: "error", code: "TERMINATION_GOVERNANCE_INPUT_REQUIRED", message: "Termination reason class and approving authority are required." });
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
          noticeStatus,
          entitledNoticeDays,
          lastWorkingDay,
          reason,
          notes: text(req.body?.notes),
          clearance: DEFAULT_CLEARANCE,
          status: "IN_PROGRESS",
          initiatedByUserId: req.auth.userId || null,
          terminationReasonClass,
          terminationAuthorityUserId,
          disciplinaryCaseId,
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
        if (exitProcess.targetStatus === "TERMINATED") {
          await assertTerminationReady(tx, {
            organizationId,
            employeeId: employee.id,
            reasonClass: exitProcess.terminationReasonClass,
            authorityUserId: exitProcess.terminationAuthorityUserId,
            disciplinaryCaseId: exitProcess.disciplinaryCaseId,
            effectiveDate: exitProcess.lastWorkingDay,
          });
        }

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

        await closeLineManagerAssignmentsForExit(tx, {
          organizationId,
          employeeId: employee.id,
          effectiveTo: exitProcess.lastWorkingDay,
          performedByUserId: req.auth.userId || null,
        });

        return tx.employeeExitProcess.update({
          where: { id: exitProcess.id },
          data: {
            status: "COMPLETED",
            financialStatus: "PENDING",
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
      if (error?.code) return res.status(error.statusCode || 409).json({ status: "error", code: error.code, message: error.message, details: error.details });
      console.error("Complete exit process error:", error);
      return res.status(500).json({
        status: "error",
        message: error?.message || "Unable to complete employee exit.",
      });
    }
  }
);

router.get("/:id/settlement/preview", requirePermission("employees.view"), async (req, res) => {
  try {
    return res.json({
      status: "success",
      data: await settlements.getSettlementPreview({
        organizationId: req.auth.organizationId,
        exitProcessId: req.params.id,
        input: {
          bonusGift: req.query?.bonusGift,
          noticePayDays: req.query?.noticePayDays,
          previousSalaryShortPaid: req.query?.previousSalaryShortPaid,
          entitledNoticeDays: req.query?.entitledNoticeDays,
          unreturnedUniform: req.query?.unreturnedUniform,
          previousSalaryOverpaid: req.query?.previousSalaryOverpaid,
        },
      }),
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      status: "error",
      code: error.code,
      message: error.message,
      details: error.details,
    });
  }
});

router.get("/:id/settlement", requirePermission("employees.view"), async (req, res) => {
  try { return res.json({ status: "success", data: await settlements.getSettlement({ organizationId: req.auth.organizationId, exitProcessId: req.params.id }) }); }
  catch (error) { return res.status(error.statusCode || 500).json({ status: "error", code: error.code, message: error.message }); }
});
router.post("/:id/settlement/calculate", requirePermission("employees.update"), async (req, res) => {
  try { return res.json({ status: "success", data: await settlements.calculateSettlement({ organizationId: req.auth.organizationId, actorUserId: req.auth.userId, exitProcessId: req.params.id, input: req.body || {} }) }); }
  catch (error) { return res.status(error.statusCode || 500).json({ status: "error", code: error.code, message: error.message, details: error.details }); }
});
router.post("/:id/settlement/submit", requirePermission("employees.update"), async (req, res) => {
  try { return res.json({ status: "success", data: await settlements.submitSettlement({ organizationId: req.auth.organizationId, actorUserId: req.auth.userId, exitProcessId: req.params.id }) }); }
  catch (error) { return res.status(error.statusCode || 500).json({ status: "error", code: error.code, message: error.message }); }
});
router.post("/:id/settlement/approve", requirePermission("payroll.manage"), async (req, res) => {
  try { return res.json({ status: "success", data: await settlements.approveSettlement({ organizationId: req.auth.organizationId, actorUserId: req.auth.userId, exitProcessId: req.params.id, notes: req.body?.notes }) }); }
  catch (error) { return res.status(error.statusCode || 500).json({ status: "error", code: error.code, message: error.message }); }
});
router.post("/:id/settlement/payment", requirePermission("payroll.manage"), async (req, res) => {
  try { return res.json({ status: "success", data: await settlements.recordSettlementPayment({ organizationId: req.auth.organizationId, actorUserId: req.auth.userId, exitProcessId: req.params.id, amount: req.body?.amount, notes: req.body?.notes }) }); }
  catch (error) { return res.status(error.statusCode || 500).json({ status: "error", code: error.code, message: error.message }); }
});
router.post("/:id/settlement/waive", requirePermission("payroll.manage"), async (req, res) => {
  try { return res.json({ status: "success", data: await settlements.waiveSettlement({ organizationId: req.auth.organizationId, actorUserId: req.auth.userId, exitProcessId: req.params.id, reason: req.body?.reason }) }); }
  catch (error) { return res.status(error.statusCode || 500).json({ status: "error", code: error.code, message: error.message }); }
});

module.exports = router;
