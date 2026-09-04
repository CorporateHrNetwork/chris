const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const prisma = require("../config/prisma");
const { requireAuth, requirePermission } = require("../middleware/authMiddleware");
const { createEmployee } = require("../services/employeeCreationService");
const {
  EXPORT_COLUMN_CATALOG,
  DEFAULT_EXPORT_COLUMNS,
  buildTemplateWorkbook,
  prepareBulkRows,
  createEmployeeExport,
  createInviteToken,
  hashInviteToken,
} = require("../services/employeeDataOperationsService");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(req, file, callback) {
    const name = String(file.originalname || "").toLowerCase();
    if (!name.endsWith(".xlsx") && !name.endsWith(".xls")) {
      return callback(new Error("Upload an Excel .xlsx or .xls file."));
    }
    callback(null, true);
  },
});
const exportRoot = path.resolve(__dirname, "../../exports");

router.use(requireAuth);

function sendOperationalError(res, error, fallback) {
  if (error?.isEmployeeCreationError) {
    return res.status(error.statusCode || 400).json({
      status: "error",
      code: error.code,
      message: error.safeMessage,
    });
  }
  if (error?.code === "P2002") {
    return res.status(409).json({
      status: "error",
      code: "EMPLOYEE_UNIQUE_CONFLICT",
      message: "A unique employee record already exists.",
    });
  }
  return res.status(400).json({
    status: "error",
    code: error?.code || "EMPLOYEE_DATA_OPERATION_FAILED",
    message: error?.message || fallback,
  });
}

router.get(
  "/bulk/template",
  requirePermission("employees.create"),
  async (req, res) => {
    const buffer = buildTemplateWorkbook();
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="CHRIS_Bulk_Employee_Import_Template.xlsx"'
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    return res.send(buffer);
  }
);

router.post(
  "/bulk/preview",
  requirePermission("employees.create"),
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file?.buffer) {
        return res.status(400).json({
          status: "error",
          code: "IMPORT_FILE_REQUIRED",
          message: "Select an Excel file to validate.",
        });
      }
      const rows = await prepareBulkRows(prisma, {
        organizationId: req.auth.organizationId,
        buffer: req.file.buffer,
      });
      return res.json({
        status: "success",
        data: {
          rows,
          totalRows: rows.length,
          validRows: rows.filter((row) => row.valid).length,
          invalidRows: rows.filter((row) => !row.valid).length,
        },
      });
    } catch (error) {
      return sendOperationalError(res, error, "Unable to validate employee import.");
    }
  }
);

router.post(
  "/bulk/import",
  requirePermission("employees.create"),
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file?.buffer) {
        return res.status(400).json({
          status: "error",
          code: "IMPORT_FILE_REQUIRED",
          message: "Select an Excel file to import.",
        });
      }
      const rows = await prepareBulkRows(prisma, {
        organizationId: req.auth.organizationId,
        buffer: req.file.buffer,
      });

      const results = [];
      for (const row of rows) {
        if (!row.valid) {
          results.push({
            rowNumber: row.rowNumber,
            success: false,
            employee: row.display,
            errors: row.errors,
          });
          continue;
        }
        try {
          const employee = await createEmployee({
            organizationId: req.auth.organizationId,
            actorUserId: req.auth.userId,
            input: row.input,
          });
          results.push({
            rowNumber: row.rowNumber,
            success: true,
            employee: {
              employeeNumber: employee.employeeNumber,
              name: [employee.firstName, employee.middleName, employee.lastName]
                .filter(Boolean)
                .join(" "),
              email: employee.email,
            },
            errors: [],
          });
        } catch (error) {
          results.push({
            rowNumber: row.rowNumber,
            success: false,
            employee: row.display,
            errors: [error.safeMessage || error.message || "Unable to create employee."],
          });
        }
      }

      return res.status(207).json({
        status: "success",
        message: "Bulk import completed with row-level results.",
        data: {
          results,
          created: results.filter((row) => row.success).length,
          failed: results.filter((row) => !row.success).length,
          total: results.length,
        },
      });
    } catch (error) {
      return sendOperationalError(res, error, "Unable to import employees.");
    }
  }
);

router.get(
  "/exports/catalog",
  requirePermission("employees.update"),
  async (req, res) => {
    return res.json({
      status: "success",
      data: {
        columns: EXPORT_COLUMN_CATALOG,
        defaultColumns: DEFAULT_EXPORT_COLUMNS,
      },
    });
  }
);

router.post(
  "/exports",
  requirePermission("employees.update"),
  async (req, res) => {
    try {
      const job = await createEmployeeExport(prisma, {
        organizationId: req.auth.organizationId,
        requestedByUserId: req.auth.userId,
        filters: req.body?.filters || {},
        columns: req.body?.columns,
        exportRoot,
      });
      return res.status(201).json({
        status: "success",
        message: "Employee export completed and added to the export queue.",
        data: job,
      });
    } catch (error) {
      console.error("Employee export error:", error);
      return res.status(500).json({
        status: "error",
        message: "Unable to generate employee export.",
      });
    }
  }
);

router.get(
  "/exports",
  requirePermission("employees.update"),
  async (req, res) => {
    const jobs = await prisma.employeeExportJob.findMany({
      where: { organizationId: req.auth.organizationId },
      include: {
        requestedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return res.json({ status: "success", data: jobs });
  }
);

router.get(
  "/exports/:id/download",
  requirePermission("employees.update"),
  async (req, res) => {
    const job = await prisma.employeeExportJob.findFirst({
      where: {
        id: req.params.id,
        organizationId: req.auth.organizationId,
        status: "COMPLETED",
      },
    });
    if (!job?.storagePath || !job.fileName) {
      return res.status(404).json({
        status: "error",
        message: "The completed export file could not be found.",
      });
    }
    const candidate = path.resolve(job.storagePath);
    const allowedRoot = path.resolve(exportRoot);
    if (!candidate.startsWith(`${allowedRoot}${path.sep}`) || !fs.existsSync(candidate)) {
      return res.status(404).json({
        status: "error",
        message: "The export file is unavailable.",
      });
    }
    return res.download(candidate, job.fileName);
  }
);

router.post(
  "/invites",
  requirePermission("employees.create"),
  async (req, res) => {
    try {
      const {
        recipientEmail,
        departmentId,
        designationId,
        locationId,
        hireDate,
        employmentStatus = "PROBATION",
        expiresInHours = 72,
      } = req.body || {};

      if (!recipientEmail || !departmentId || !designationId || !locationId) {
        return res.status(400).json({
          status: "error",
          message: "Email, Department, Designation and Location are required.",
        });
      }

      const [department, designation, location] = await Promise.all([
        prisma.department.findFirst({
          where: { id: departmentId, organizationId: req.auth.organizationId, isActive: true },
          select: { id: true },
        }),
        prisma.designation.findFirst({
          where: {
            id: designationId,
            organizationId: req.auth.organizationId,
            departmentId,
            isActive: true,
          },
          select: { id: true, careerLevel: true },
        }),
        prisma.organizationLocation.findFirst({
          where: { id: locationId, organizationId: req.auth.organizationId, isActive: true },
          select: { id: true },
        }),
      ]);
      if (!department || !designation || !location || !Number.isInteger(designation.careerLevel)) {
        return res.status(400).json({
          status: "error",
          message: "Select a valid Department, Employment-Level-mapped Designation and Location.",
        });
      }

      const normalizedStatus = String(employmentStatus || "PROBATION").toUpperCase();
      if (!["ACTIVE", "PROBATION"].includes(normalizedStatus)) {
        return res.status(400).json({
          status: "error",
          message: "Invitation employment status must be Active or Probation.",
        });
      }

      const hours = Math.max(1, Math.min(Number(expiresInHours) || 72, 24 * 30));
      const rawToken = createInviteToken();
      const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);

      const invite = await prisma.employeeSelfOnboardingInvite.create({
        data: {
          organizationId: req.auth.organizationId,
          createdByUserId: req.auth.userId,
          tokenHash: hashInviteToken(rawToken),
          recipientEmail: String(recipientEmail).trim().toLowerCase(),
          departmentId,
          designationId,
          locationId,
          employmentStatus: normalizedStatus,
          hireDate: hireDate ? new Date(`${hireDate}T00:00:00.000Z`) : null,
          expiresAt,
        },
      });

      const appBase = String(process.env.CHRIS_PUBLIC_APP_URL || "http://localhost:5173").replace(/\/+$/, "");
      return res.status(201).json({
        status: "success",
        message: "Secure employee self-onboarding invitation created.",
        data: {
          ...invite,
          invitationUrl: `${appBase}/employee-invite/${rawToken}`,
        },
      });
    } catch (error) {
      return sendOperationalError(res, error, "Unable to create employee invitation.");
    }
  }
);

router.get(
  "/invites",
  requirePermission("employees.create"),
  async (req, res) => {
    const now = new Date();
    const rows = await prisma.employeeSelfOnboardingInvite.findMany({
      where: { organizationId: req.auth.organizationId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const data = rows.map((row) => ({
      ...row,
      status:
        ["PENDING", "OPENED"].includes(row.status) && row.expiresAt < now
          ? "EXPIRED"
          : row.status,
    }));
    return res.json({ status: "success", data });
  }
);

router.post(
  "/invites/:id/revoke",
  requirePermission("employees.create"),
  async (req, res) => {
    const invite = await prisma.employeeSelfOnboardingInvite.findFirst({
      where: { id: req.params.id, organizationId: req.auth.organizationId },
    });
    if (!invite) {
      return res.status(404).json({ status: "error", message: "Invitation not found." });
    }
    if (["COMPLETED", "REVOKED"].includes(invite.status)) {
      return res.status(409).json({ status: "error", message: "This invitation can no longer be revoked." });
    }
    const updated = await prisma.employeeSelfOnboardingInvite.update({
      where: { id: invite.id },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    return res.json({ status: "success", data: updated });
  }
);

router.post(
  "/invites/:id/approve",
  requirePermission("employees.create"),
  async (req, res) => {
    try {
      const invite = await prisma.employeeSelfOnboardingInvite.findFirst({
        where: { id: req.params.id, organizationId: req.auth.organizationId },
      });
      if (!invite) {
        return res.status(404).json({ status: "error", message: "Invitation not found." });
      }
      if (invite.status !== "SUBMITTED") {
        return res.status(409).json({
          status: "error",
          message: "Only a submitted employee invitation can be approved.",
        });
      }
      if (invite.expiresAt < new Date()) {
        return res.status(409).json({ status: "error", message: "This invitation has expired." });
      }
      const data = invite.submittedData || {};
      const employee = await createEmployee({
        organizationId: invite.organizationId,
        actorUserId: req.auth.userId,
        input: {
          name: data.fullName,
          email: invite.recipientEmail,
          phone: data.phone,
          gender: data.gender,
          status: invite.employmentStatus === "ACTIVE" ? "Active" : "Probation",
          hireDate: invite.hireDate?.toISOString().slice(0, 10) || "",
          departmentId: invite.departmentId,
          designationId: invite.designationId,
          locationId: invite.locationId,
          nationalIdentificationNumber: data.nationalIdentificationNumber || "",
        },
      });
      const updated = await prisma.employeeSelfOnboardingInvite.update({
        where: { id: invite.id },
        data: {
          status: "COMPLETED",
          employeeId: employee.id,
          completedAt: new Date(),
        },
      });
      return res.json({
        status: "success",
        message: `Employee ${employee.employeeNumber} created from the approved invitation.`,
        data: { invite: updated, employee },
      });
    } catch (error) {
      return sendOperationalError(res, error, "Unable to approve employee invitation.");
    }
  }
);

module.exports = router;
