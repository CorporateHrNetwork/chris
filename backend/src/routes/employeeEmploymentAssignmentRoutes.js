const express = require("express");
const multer = require("multer");

const prisma = require("../config/prisma");
const { requireAuth, requirePermission } = require("../middleware/authMiddleware");
const {
  listAssignmentCatalog,
  buildAssignmentTemplateWorkbook,
  prepareAssignmentRows,
  assignEmployee,
} = require("../services/employeeEmploymentAssignmentService");

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

router.use(requireAuth);

function sendError(res, error, fallback) {
  const status = ["EMPLOYEE_NOT_FOUND"].includes(error?.code) ? 404 : 400;
  return res.status(status).json({
    status: "error",
    code: error?.code || "EMPLOYMENT_ASSIGNMENT_FAILED",
    message: error?.message || fallback,
  });
}

router.get(
  "/catalog",
  requirePermission("employees.view"),
  async (req, res) => {
    try {
      return res.json({
        status: "success",
        data: await listAssignmentCatalog(prisma, req.auth.organizationId),
      });
    } catch (error) {
      return sendError(res, error, "Unable to load employment assignment catalogue.");
    }
  }
);

router.get(
  "/template",
  requirePermission("employees.update"),
  async (req, res) => {
    try {
      const catalog = await listAssignmentCatalog(prisma, req.auth.organizationId);
      const buffer = buildAssignmentTemplateWorkbook({
        employmentTypes: catalog.employmentTypes,
      });
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="CHRIS_Existing_Employee_Assignment_Template.xlsx"'
      );
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      return res.send(buffer);
    } catch (error) {
      return sendError(res, error, "Unable to prepare employment assignment template.");
    }
  }
);

router.post(
  "/preview",
  requirePermission("employees.update"),
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file?.buffer) {
        return res.status(400).json({
          status: "error",
          code: "ASSIGNMENT_FILE_REQUIRED",
          message: "Select an Excel assignment file to validate.",
        });
      }
      const rows = await prepareAssignmentRows(prisma, {
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
      return sendError(res, error, "Unable to validate employee assignments.");
    }
  }
);

router.post(
  "/bulk",
  requirePermission("employees.update"),
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file?.buffer) {
        return res.status(400).json({
          status: "error",
          code: "ASSIGNMENT_FILE_REQUIRED",
          message: "Select an Excel assignment file to apply.",
        });
      }
      const rows = await prepareAssignmentRows(prisma, {
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
          const employee = await assignEmployee(prisma, {
            organizationId: req.auth.organizationId,
            actorUserId: req.auth.userId,
            ...row.input,
          });
          results.push({
            rowNumber: row.rowNumber,
            success: true,
            employee,
            errors: [],
          });
        } catch (error) {
          results.push({
            rowNumber: row.rowNumber,
            success: false,
            employee: row.display,
            errors: [error.message || "Unable to apply employee assignment."],
          });
        }
      }
      return res.status(207).json({
        status: "success",
        message: "Employment assignment upload completed with row-level results.",
        data: {
          results,
          updated: results.filter((row) => row.success && row.employee?.changed).length,
          unchanged: results.filter((row) => row.success && !row.employee?.changed).length,
          failed: results.filter((row) => !row.success).length,
          total: results.length,
        },
      });
    } catch (error) {
      return sendError(res, error, "Unable to apply employee assignments.");
    }
  }
);

router.patch(
  "/:employeeNumber",
  requirePermission("employees.update"),
  async (req, res) => {
    try {
      const employee = await assignEmployee(prisma, {
        organizationId: req.auth.organizationId,
        actorUserId: req.auth.userId,
        employeeNumber: req.params.employeeNumber,
        employmentType: req.body?.employmentType,
        costCentreId: req.body?.costCentreId,
        costCentre: req.body?.costCentre,
        reason: req.body?.reason,
      });
      return res.json({
        status: "success",
        message: employee.changed
          ? "Employee Employment Type / Cost Centre assignment updated."
          : "Employee assignment already matches the requested values.",
        data: employee,
      });
    } catch (error) {
      return sendError(res, error, "Unable to update employee assignment.");
    }
  }
);

module.exports = router;
