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
const {
  synchronizeZermattEmployeeLevelLive,
} = require("../services/zermattEmployeeLevelLiveService");

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
        "EMPLOYEE_OUTSIDE_ACTIVE_BRANCH",
        "ANNUAL_ENTITLEMENT_BELOW_USED",
      ].includes(code)
      ? code === "EMPLOYEE_OUTSIDE_ACTIVE_BRANCH" ? 403 : 409
      : 400;
  const messages = {
    EMPLOYEE_NOT_FOUND: "Employee not found in this organization.",
    EMPLOYEE_NOT_CURRENT: "Employment Level changes can only be made for a current employee.",
    EMPLOYEE_OUTSIDE_ACTIVE_BRANCH: "The selected employee does not belong to the active branch. Switch branch or return to HEAD OFFICE.",
    INVALID_EMPLOYMENT_LEVEL: "Select a valid Employment Level.",
    EMPLOYMENT_LEVEL_NOT_ACTIVE: "Select an active Employment Level from the tenant catalogue.",
    EMPLOYMENT_LEVEL_MAPPING_REQUIRED: "The employee's designation must have a valid default Employment Level before an override can be managed.",
    EMPLOYEE_LEVEL_OVERRIDE_INACTIVE: "The employee's active override points to an inactive Employment Level and requires HR review.",
    EMPLOYMENT_LEVEL_REASON_REQUIRED: "A reason is required for an employee-specific Employment Level change.",
    INVALID_EFFECTIVE_DATE: "The effective date would corrupt Employment Level history.",
    FUTURE_EFFECTIVE_DATE: "Future-dated Employment Level changes are not yet supported.",
    CURRENT_EMPLOYMENT_LEVEL_OVERRIDE_NOT_FOUND: "This employee has no current Employment Level override to remove.",
    DESIGNATION_REQUIRED: "Assign a controlled designation before managing the employee's Employment Level.",
    ZERMATT_V2_EMPLOYMENT_LEVEL_REQUIRED: "Select one of ZERMATT's active L1-L7 Employment Levels.",
    ZERMATT_ANNUAL_LEAVE_TYPE_NOT_CONFIGURED: "ZERMATT Annual Leave is not configured; the Employment Level change was not activated.",
    ZERMATT_ANNUAL_LEAVE_POLICY_NOT_CONFIGURED: "ZERMATT's active Annual Leave policy is not configured; the Employment Level change was not activated.",
    ANNUAL_ENTITLEMENT_BELOW_USED: "This Employment Level would reduce Annual Leave below leave already used. The level change was rolled back and requires HR review.",
  };
  return res.status(status).json({
    status: "error",
    code: code || "EMPLOYMENT_ASSIGNMENT_FAILED",
    message: messages[code] || error?.message || fallback,
    details: error?.details || undefined,
  });
}

async function assertEmployeeInActiveBranch(req, employeeNumber) {
  if (!req.auth.activeLocationId) return null;
  const employee = await prisma.employee.findFirst({
    where: {
      organizationId: req.auth.organizationId,
      employeeNumber: String(employeeNumber || "").trim().toUpperCase(),
    },
    select: { id: true, employeeNumber: true, locationId: true },
  });
  if (!employee) throw new Error("EMPLOYEE_NOT_FOUND");
  if (employee.locationId !== req.auth.activeLocationId) {
    throw new Error("EMPLOYEE_OUTSIDE_ACTIVE_BRANCH");
  }
  return employee;
}

function effectiveAuditSummary(state) {
  const effective = state?.effective || null;
  return effective
    ? {
        source: effective.source || null,
        levelNumber: effective.levelNumber ?? null,
        code: effective.code || null,
        name: effective.name || null,
      }
    : null;
}

async function activateLevelLive(req, input, mode = "SET") {
  return prisma.$transaction(async (tx) => {
    const previous = await employmentLevelService.getEmploymentLevelState(tx, {
      organizationId: req.auth.organizationId,
      employeeNumber: req.params.employeeNumber,
    });

    const state = mode === "REMOVE"
      ? await employmentLevelService.applyRemoveEmploymentLevelOverride(tx, input)
      : await employmentLevelService.applyEmploymentLevelOverride(tx, input);

    const liveActivation = await synchronizeZermattEmployeeLevelLive(tx, {
      organizationId: req.auth.organizationId,
      employeeNumber: req.params.employeeNumber,
      actorUserId: req.auth.userId,
      leaveYear: new Date().getFullYear(),
      previousEffective: effectiveAuditSummary(previous),
      reason: input.reason,
    });

    return { state, liveActivation };
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
      await assertEmployeeInActiveBranch(req, req.params.employeeNumber);
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
      await assertEmployeeInActiveBranch(req, req.params.employeeNumber);
      const effectiveFrom = employmentLevelService.parseEffectiveDate(req.body?.effectiveFrom);
      if (!effectiveFrom) {
        return res.status(400).json({
          status: "error",
          code: "INVALID_EFFECTIVE_DATE",
          message: "A valid effective date is required.",
        });
      }

      const input = {
        organizationId: req.auth.organizationId,
        employeeNumber: req.params.employeeNumber,
        levelNumber: req.body?.levelNumber,
        effectiveFrom,
        reason: req.body?.reason,
        notes: req.body?.notes,
        performedByUserId: req.auth.userId,
      };
      const result = await activateLevelLive(req, input, "SET");
      const live = result.liveActivation;
      const annual = live?.annualLeave;
      const message = live?.applied
        ? `Employment Level ${result.state?.effective?.code || ""} activated live for ${req.params.employeeNumber}.${annual?.eligible ? ` Current-year Annual Leave entitlement is ${annual.openingBalance} working days.` : ""}`
        : "Employee-specific Employment Level assignment saved.";

      return res.json({
        status: "success",
        message,
        data: result.state,
        liveActivation: live,
      });
    } catch (error) {
      return sendError(res, error, "Unable to activate employee Employment Level live.");
    }
  }
);

router.delete(
  "/employment-level/:employeeNumber",
  requirePermission("employees.update"),
  async (req, res) => {
    try {
      await assertEmployeeInActiveBranch(req, req.params.employeeNumber);
      const effectiveTo = employmentLevelService.parseEffectiveDate(req.body?.effectiveTo);
      if (!effectiveTo) {
        return res.status(400).json({
          status: "error",
          code: "INVALID_EFFECTIVE_DATE",
          message: "A valid effective date is required.",
        });
      }

      const input = {
        organizationId: req.auth.organizationId,
        employeeNumber: req.params.employeeNumber,
        effectiveTo,
        reason: req.body?.reason,
        notes: req.body?.notes,
        performedByUserId: req.auth.userId,
      };
      const result = await activateLevelLive(req, input, "REMOVE");
      const annual = result.liveActivation?.annualLeave;
      return res.json({
        status: "success",
        message: result.liveActivation?.applied
          ? `Designation default ${result.state?.effective?.code || ""} restored live.${annual?.eligible ? ` Current-year Annual Leave entitlement is ${annual.openingBalance} working days.` : ""}`
          : "Employment Level override removed; designation default is effective again.",
        data: result.state,
        liveActivation: result.liveActivation,
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
      await assertEmployeeInActiveBranch(req, req.params.employeeNumber);
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
