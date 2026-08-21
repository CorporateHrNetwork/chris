const express = require("express");
const prisma = require("../config/prisma");
const { requireAuth, requirePermission } = require("../middleware/authMiddleware");
const service = require("../services/lineManagerService");

const router = express.Router();
router.use(requireAuth);

async function employeeForTenant(organizationId, employeeNumber) {
  return prisma.employee.findFirst({
    where: { organizationId, employeeNumber },
    select: { id: true, employeeNumber: true, firstName: true, middleName: true, lastName: true },
  });
}

function knownError(res, error) {
  const map = {
    EMPLOYEE_NOT_FOUND: [404, "Employee not found."],
    EMPLOYEE_NOT_CURRENT: [409, "Line managers can only be assigned to current employees."],
    MANAGER_NOT_FOUND: [400, "Select a valid manager from your organization."],
    SELF_MANAGER: [409, "An employee cannot be their own line manager."],
    MANAGER_NOT_CURRENT: [409, "Exited or inactive employees cannot be assigned as line managers."],
    MANAGEMENT_CYCLE: [409, "This assignment would create a reporting-line cycle."],
    INVALID_EFFECTIVE_DATE: [409, "The effective date would corrupt manager history."],
    FUTURE_EFFECTIVE_DATE: [409, "Future-dated manager changes are not yet supported."],
    CHANGE_REASON_REQUIRED: [400, "A reason is required when changing line manager."],
    CURRENT_ASSIGNMENT_NOT_FOUND: [404, "This employee has no current line manager assignment."],
  };
  if (!map[error.message]) return false;
  const [statusCode, message] = map[error.message];
  res.status(statusCode).json({ status: "error", code: error.message, message });
  return true;
}

router.get("/eligible", requirePermission("employees.view"), async (req, res) => {
  const data = await prisma.employee.findMany({
    where: {
      organizationId: req.auth.organizationId,
      status: { in: service.CURRENT_STATUSES },
      exitDate: null,
    },
    include: { department: true, designation: true },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  });
  res.json({ status: "success", data });
});

router.get("/my-team", requirePermission("employees.view"), async (req, res) => {
  const user = await prisma.user.findFirst({
    where: { id: req.auth.userId, organizationId: req.auth.organizationId },
    select: { employeeId: true },
  });
  if (!user?.employeeId) {
    return res.status(409).json({ status: "error", message: "Your account is not linked to an employee record." });
  }
  const assignments = await prisma.employeeLineManagerAssignment.findMany({
    where: {
      organizationId: req.auth.organizationId,
      managerEmployeeId: user.employeeId,
      effectiveTo: null,
    },
    include: service.assignmentInclude,
  });
  return res.json({ status: "success", data: assignments.map((item) => item.employee) });
});

router.get("/managers/:managerEmployeeNumber/reports", requirePermission("employees.view"), async (req, res) => {
  const manager = await employeeForTenant(req.auth.organizationId, req.params.managerEmployeeNumber);
  if (!manager) return res.status(404).json({ status: "error", message: "Manager not found." });
  const assignments = await prisma.employeeLineManagerAssignment.findMany({
    where: {
      organizationId: req.auth.organizationId,
      managerEmployeeId: manager.id,
      effectiveTo: null,
    },
    include: service.assignmentInclude,
  });
  return res.json({ status: "success", manager, data: assignments.map((item) => item.employee) });
});

router.get("/employees/:employeeNumber", requirePermission("employees.view"), async (req, res) => {
  const employee = await employeeForTenant(req.auth.organizationId, req.params.employeeNumber);
  if (!employee) return res.status(404).json({ status: "error", message: "Employee not found." });
  const history = await prisma.employeeLineManagerAssignment.findMany({
    where: { organizationId: req.auth.organizationId, employeeId: employee.id },
    include: service.assignmentInclude,
    orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
  });
  return res.json({
    status: "success",
    employee,
    current: history.find((item) => item.effectiveTo === null) || null,
    history,
  });
});

router.put("/employees/:employeeNumber", requirePermission("employees.update"), async (req, res) => {
  try {
    const organizationId = req.auth.organizationId;
    const employee = await employeeForTenant(organizationId, req.params.employeeNumber);
    if (!employee) throw new Error("EMPLOYEE_NOT_FOUND");
    const effectiveFrom = service.parseEffectiveDate(req.body?.effectiveFrom);
    if (!effectiveFrom) return res.status(400).json({ status: "error", message: "A valid effective date is required." });
    const data = await service.setLineManager(prisma, {
      organizationId,
      employeeId: employee.id,
      managerEmployeeId: String(req.body?.managerEmployeeId || "").trim(),
      effectiveFrom,
      reason: req.body?.reason,
      notes: req.body?.notes,
      performedByUserId: req.auth.userId,
    });
    return res.json({ status: "success", message: "Line manager assignment saved.", data });
  } catch (error) {
    if (knownError(res, error)) return;
    console.error("Set line manager error:", error);
    return res.status(500).json({ status: "error", message: "Unable to save line manager assignment." });
  }
});

router.delete("/employees/:employeeNumber", requirePermission("employees.update"), async (req, res) => {
  try {
    const organizationId = req.auth.organizationId;
    const employee = await employeeForTenant(organizationId, req.params.employeeNumber);
    if (!employee) throw new Error("EMPLOYEE_NOT_FOUND");
    const effectiveTo = service.parseEffectiveDate(req.body?.effectiveTo);
    const reason = String(req.body?.reason || "").trim();
    if (!effectiveTo) return res.status(400).json({ status: "error", message: "A valid effective date is required." });
    if (!reason) return res.status(400).json({ status: "error", message: "A reason is required when removing a line manager." });
    const data = await service.removeLineManager(prisma, {
      organizationId,
      employeeId: employee.id,
      effectiveTo,
      reason,
      notes: req.body?.notes,
      performedByUserId: req.auth.userId,
    });
    return res.json({ status: "success", message: "Line manager removed.", data });
  } catch (error) {
    if (knownError(res, error)) return;
    console.error("Remove line manager error:", error);
    return res.status(500).json({ status: "error", message: "Unable to remove line manager." });
  }
});

module.exports = router;
