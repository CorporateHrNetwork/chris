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
const employmentLevelService = require("../services/employeeEmploymentLevelAssignmentService");

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
  const code = error?.code || error?.message;
  const status = ["EMPLOYEE_NOT_FOUND", "CURRENT_EMPLOYMENT_LEVEL_OVERRIDE_NOT_FOUND"].includes(code)
    ? 404
    : [
        "EMPLOYEE_NOT_CURRENT",
        "EMPLOYMENT_LEVEL_MAPPING_REQUIRED",
        "EMPLOYEE_LEVEL_OVERRIDE_INACTIVE",
        "FUTURE_EFFECTIVE_DATE",
        "INVALID_EFFECTIVE_DATE",
      ].includes(code)
      ? 409
      : 400;
  const messages = {
    EMPLOYEE_NOT_FOUND: "Employee not found in this organization.",
    EMPLOYEE_NOT_CURRENT: "Employment Level changes can only be made for a current employee.",
    INVALID_EMPLOYMENT_LEVEL: "Select a valid Employment Level.",
    EMPLOYMENT_LEVEL_NOT_ACTIVE: "Select an active Employment Level from the tenant catalogue.",
    EMPLOYMENT_LEVEL_MAPPING_REQUIRED: "The employee's designation must have a valid default Employment Level before an override can be managed.",
    EMPLOYEE_LEVEL_OVERRIDE_INACTIVE: "The employee's active override points to an inactive Employment Level and requires HR review.",
    EMPLOYMENT_LEVEL_REASON_REQUIRED: "A reason is required for an employee-specific Employment Level change.",
    INVALID_EFFECTIVE_DATE: "The effective date would corrupt Employment Level history.",
    FUTURE_EFFECTIVE_DATE: "Future-dated Employment Level changes are not yet supported.",
    CURRENT_EMPLOYMENT_LEVEL_OVERRIDE_NOT_FOUND: "This employee has no current Employment Level override to remove.",
    DESIGNATION_REQUIRED: "Assign a controlled designation before managing the employee's Employment Level.",
  };
  return res.status(status).json({
    status: "error",
    code: code || "EMPLOYMENT_ASSIGNMENT_FAILED",
    message: messages[code] || error?.message || fallback,
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
  "/employment-level/:employeeNumber",
  requirePermission("employees.view"),
  async (req, res) => {
    try {
      const data = await employmentLevelService.getEmploymentLevelState(prisma, {
        organizationId: req.auth.organizationId,
        employeeNumber: req.params.employeeNumber,
      });
      return res.json({ status: "success", data });
    } catch (error) {
      return sendError(res, error, "Unable to load employee Employment Level state.");
    }
  }
);

router.put(
  "/employment-level/:employeeNumber",
  requirePermission("employees.update"),
  async (req, res) => {
    try {
      const effectiveFrom = employmentLevelService.parseEffectiveDate(req.body?.effectiveFrom);
      if (!effectiveFrom) {
        return res.status(400).json({
          status: "error",
          code: "INVALID_EFFECTIVE_DATE",
          message: "A valid effective date is required.",
        });
      }
      const data = await employmentLevelService.setEmploymentLevelOverride(prisma, {
        organizationId: req.auth.organizationId,
        employeeNumber: req.params.employeeNumber,
        levelNumber: req.body?.levelNumber,
        effectiveFrom,
        reason: req.body?.reason,
        notes: req.body?.notes,
        performedByUserId: req.auth.userId,
      });
      return res.json({
        status: "success",
        message: "Employee-specific Employment Level assignment saved.",
        data,
      });
    } catch (error) {
      return sendError(res, error, "Unable to save employee Employment Level assignment.");
    }
  }
);

router.delete(
  "/employment-level/:employeeNumber",
  requirePermission("employees.update"),
  async (req, res) => {
    try {
      const effectiveTo = employmentLevelService.parseEffectiveDate(req.body?.effectiveTo);
      if (!effectiveTo) {
        return res.status(400).json({
          status: "error",
          code: "INVALID_EFFECTIVE_DATE",
          message: "A valid effective date is required.",
        });
      }
      const data = await employmentLevelService.removeEmploymentLevelOverride(prisma, {
        organizationId: req.auth.organizationId,
        employeeNumber: req.params.employeeNumber,
        effectiveTo,
        reason: req.body?.reason,
        notes: req.body?.notes,
        performedByUserId: req.auth.userId,
      });
      return res.json({
        status: "success",
        message: "Employment Level override removed; designation default is effective again.",
        data,
      });
    } catch (error) {
      return sendError(res, error, "Unable to remove employee Employment Level override.");
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
