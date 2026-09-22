const express = require("express");
const prisma = require("../config/prisma");
const { requireAuth, requirePermission } = require("../middleware/authMiddleware");
const {
  listAssignmentCatalog,
  assignEmployee,
} = require("../services/employeeEmploymentAssignmentService");

const router = express.Router();
router.use(requireAuth);

async function employeeInScope(req, employeeNumber) {
  const employee = await prisma.employee.findFirst({
    where: {
      organizationId: req.auth.organizationId,
      employeeNumber: String(employeeNumber || "").trim().toUpperCase(),
      ...(req.auth.activeLocationId ? { locationId: req.auth.activeLocationId } : {}),
    },
    select: {
      id: true,
      employeeNumber: true,
      firstName: true,
      middleName: true,
      lastName: true,
      employmentType: true,
      locationId: true,
      status: true,
      location: { select: { id: true, name: true, code: true } },
    },
  });
  if (!employee) {
    const error = new Error("Employee not found in the active organization / branch context.");
    error.code = "EMPLOYEE_NOT_FOUND_OR_OUT_OF_SCOPE";
    error.statusCode = 404;
    throw error;
  }
  return employee;
}

router.get("/employment-types/catalog", requirePermission("employees.view"), async (req, res) => {
  try {
    const catalog = await listAssignmentCatalog(prisma, req.auth.organizationId);
    return res.json({ status: "success", data: { employmentTypes: catalog.employmentTypes } });
  } catch (error) {
    return res.status(400).json({ status: "error", code: error.code || "EMPLOYMENT_TYPE_CATALOG_FAILED", message: error.message });
  }
});

router.put("/:employeeNumber/employment-type", requirePermission("employees.update"), async (req, res) => {
  try {
    const employee = await employeeInScope(req, req.params.employeeNumber);
    const employmentType = String(req.body?.employmentType || "").trim();
    const reason = String(req.body?.reason || "").trim();
    if (!employmentType) {
      return res.status(400).json({ status: "error", code: "EMPLOYMENT_TYPE_REQUIRED", message: "Select the employee's new Employment Type." });
    }
    if (!reason) {
      return res.status(400).json({ status: "error", code: "EMPLOYMENT_TYPE_CHANGE_REASON_REQUIRED", message: "Enter a reason for the Employment Type change." });
    }

    const updated = await assignEmployee(prisma, {
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      employeeNumber: employee.employeeNumber,
      employmentType,
      reason: `Employment Type change: ${reason}`,
    });

    return res.json({
      status: "success",
      message: updated.changed
        ? `${employee.employeeNumber} Employment Type changed from ${employee.employmentType || "Not set"} to ${updated.employmentType}.`
        : `${employee.employeeNumber} is already assigned to ${updated.employmentType}.`,
      data: {
        employeeNumber: employee.employeeNumber,
        employeeName: [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(" "),
        previousEmploymentType: employee.employmentType,
        employmentType: updated.employmentType,
        changed: updated.changed,
        location: employee.location,
      },
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      status: "error",
      code: error.code || "EMPLOYMENT_TYPE_CHANGE_FAILED",
      message: error.message || "Unable to change Employment Type.",
    });
  }
});

module.exports = router;
