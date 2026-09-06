const express = require("express");
const prisma = require("../config/prisma");
const { requireAuth, requireAnyPermission, requirePermission } = require("../middleware/authMiddleware");
const { provisionAllCurrentFullTimeEmployees } = require("../services/zermattLeaveEntitlementService");
const { getEmployeeLeaveProfile } = require("../services/employeeLeaveProfileService");
const { createManualPayrollInput } = require("../services/attendancePayrollService");
const { markDraftRunsRecalculationRequired } = require("../services/payrollDraftFreshnessService");
const {
  previewAnnualCarryover,
  applyAnnualCarryover,
  forfeitExpiredCarryover,
} = require("../services/zermattAnnualLeaveCarryoverService");

const router = express.Router();
router.use(requireAuth);

function normalizedRole(value) {
  return String(value || "").trim().toUpperCase().replace(/[\s_-]+/g, "");
}

function isZermattSuperUser(req) {
  if (req.auth?.organization?.slug !== "zermatt-liquor-limited") return false;
  const roles = (req.auth?.roles || []).map(normalizedRole);
  if (roles.some((role) => ["SUPERUSER", "SUPERADMIN", "ORGANIZATIONSUPERUSER"].includes(role))) return true;
  const permissions = new Set(req.auth?.permissions || []);
  return ["payroll.manage", "users.manage", "roles.manage", "settings.manage"].every((permission) => permissions.has(permission));
}

function requireZermattSuperUser(req, res, next) {
  if (!isZermattSuperUser(req)) {
    return res.status(403).json({
      status: "error",
      code: "ZERMATT_SUPER_USER_REQUIRED",
      message: "Only the ZERMATT Super User can perform this operation.",
    });
  }
  next();
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
  if (!employee) throw Object.assign(new Error("EMPLOYEE_NOT_FOUND"), { statusCode: 404 });
  if (employee.locationId !== req.auth.activeLocationId) {
    throw Object.assign(new Error("EMPLOYEE_OUTSIDE_ACTIVE_BRANCH"), {
      statusCode: 403,
      safeMessage: "The selected employee does not belong to the active branch context.",
    });
  }
  return employee;
}

router.get("/employee-options", requireAnyPermission("leave.view", "attendance.view", "attendance.manage", "payroll.view"), async (req, res) => {
  try {
    const employees = await prisma.employee.findMany({
      where: {
        organizationId: req.auth.organizationId,
        status: { in: ["ACTIVE", "PROBATION", "LEAVE", "SUSPENDED"] },
        ...(req.auth.activeLocationId ? { locationId: req.auth.activeLocationId } : {}),
      },
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        middleName: true,
        lastName: true,
        employmentType: true,
        status: true,
        location: { select: { id: true, name: true, code: true } },
        department: { select: { name: true } },
        designation: { select: { name: true, careerLevel: true } },
      },
      orderBy: { employeeNumber: "asc" },
    });
    return res.json({
      status: "success",
      data: employees.map((employee) => ({
        id: employee.id,
        employeeNumber: employee.employeeNumber,
        employeeName: [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(" "),
        employmentType: employee.employmentType,
        status: employee.status,
        department: employee.department?.name || null,
        designation: employee.designation?.name || null,
        careerLevel: employee.designation?.careerLevel || null,
        location: employee.location?.name || null,
        locationId: employee.location?.id || null,
        locationCode: employee.location?.code || null,
      })),
    });
  } catch (error) {
    return res.status(500).json({ status: "error", message: "Unable to load ZERMATT employee options." });
  }
});

router.post("/leave-entitlements/apply", requirePermission("leave.manage"), requireZermattSuperUser, async (req, res) => {
  try {
    const leaveYear = Number(req.body?.leaveYear || new Date().getFullYear());
    const data = await provisionAllCurrentFullTimeEmployees({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      leaveYear,
    });
    return res.json({
      status: "success",
      message: `ZERMATT Full-Time leave entitlements applied for ${data.fullTimeEmployees} current employee(s).`,
      data,
    });
  } catch (error) {
    return res.status(400).json({ status: "error", code: error.code || error.message, message: error.message || "Unable to apply ZERMATT leave entitlements." });
  }
});

router.get("/leave-carryover/preview", requirePermission("leave.view"), requireZermattSuperUser, async (req, res) => {
  try {
    const sourceYear = Number(req.query.sourceYear || new Date().getFullYear());
    const data = await previewAnnualCarryover({
      organizationId: req.auth.organizationId,
      sourceYear,
      targetYear: sourceYear + 1,
    });
    return res.json({ status: "success", data });
  } catch (error) {
    return res.status(400).json({ status: "error", code: error.code || error.message, message: error.message || "Unable to preview Annual Leave carryover.", details: error.details || null });
  }
});

router.post("/leave-carryover/apply", requirePermission("leave.manage"), requireZermattSuperUser, async (req, res) => {
  try {
    const sourceYear = Number(req.body?.sourceYear);
    const data = await applyAnnualCarryover({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      sourceYear,
      targetYear: sourceYear + 1,
    });
    return res.json({
      status: "success",
      message: `${data.appliedCount} employee Annual Leave carryover balance(s) moved from ${data.sourceYear} to ${data.targetYear}. Carryover must be used by 31 March ${data.targetYear} or forfeited.`,
      data,
    });
  } catch (error) {
    const messageByCode = {
      CARRYOVER_SOURCE_YEAR_NOT_CLOSED: "Annual Leave carryover can only be applied after the source operational year has closed.",
      CARRYOVER_PENDING_ANNUAL_REQUESTS: "Resolve all pending Annual Leave requests in the source year before carrying balances forward.",
      CARRYOVER_TARGET_YEAR_ALREADY_IN_USE: "The target-year Annual Leave balance is already in use and cannot be silently rewritten.",
    };
    return res.status(409).json({
      status: "error",
      code: error.code || error.message,
      message: messageByCode[error.message] || error.message || "Unable to apply Annual Leave carryover.",
      details: error.details || null,
    });
  }
});

router.post("/leave-carryover/forfeit-expired", requirePermission("leave.manage"), requireZermattSuperUser, async (req, res) => {
  try {
    const leaveYear = Number(req.body?.leaveYear || new Date().getFullYear());
    const data = await forfeitExpiredCarryover({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      leaveYear,
    });
    return res.json({
      status: "success",
      message: `Expired Annual Leave carryover processed for ${leaveYear}. ${data.forfeitedEmployees} employee(s) forfeited ${data.totalForfeited} unused day(s).`,
      data,
    });
  } catch (error) {
    return res.status(409).json({
      status: "error",
      code: error.code || error.message,
      message: error.message === "CARRYOVER_Q1_NOT_EXPIRED"
        ? "Carryover cannot be forfeited before the end of 31 March."
        : error.message || "Unable to forfeit expired Annual Leave carryover.",
      details: error.details || null,
    });
  }
});

router.get("/leave-profile/:employeeNumber", requirePermission("leave.view"), async (req, res) => {
  try {
    await assertEmployeeInActiveBranch(req, req.params.employeeNumber);
    const data = await getEmployeeLeaveProfile({
      organizationId: req.auth.organizationId,
      employeeNumber: String(req.params.employeeNumber || "").trim().toUpperCase(),
      selectedPolicyId: req.query.policyId || null,
      actorUserId: req.auth.userId,
    });
    return res.json({ status: "success", data });
  } catch (error) {
    return res.status(error.statusCode || 400).json({ status: "error", code: error.code || error.message, message: error.safeMessage || error.message || "Unable to load employee leave profile." });
  }
});

router.post("/attendance/worked-days", requirePermission("attendance.manage"), requireZermattSuperUser, async (req, res) => {
  try {
    await assertEmployeeInActiveBranch(req, req.body?.employeeNumber);
    const data = await createManualPayrollInput({
      organizationId: req.auth.organizationId,
      employeeNumber: req.body?.employeeNumber,
      periodStart: req.body?.periodStart,
      periodEnd: req.body?.periodEnd,
      workedDays: req.body?.workedDays,
      workedHours: req.body?.workedHours,
      notes: req.body?.notes || "Manual worked days entered by ZERMATT Super User because clocking is not configured/complete.",
      recordedByUserId: req.auth.userId,
    });
    const freshness = await markDraftRunsRecalculationRequired({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      reason: `Manual worked days for ${req.body?.employeeNumber || "employee"} were updated; payroll must be recalculated.`,
    });
    return res.json({
      status: "success",
      message: "Worked days saved. Payroll drafts were marked for recalculation; the next payroll calculation and payslip will reflect the manual attendance basis.",
      data: { attendancePayrollInput: data, payrollDraftFreshness: freshness },
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({ status: "error", code: error.code || error.message, message: error.safeMessage || error.message || "Unable to save worked days." });
  }
});

router.get("/branch-context", requireZermattSuperUser, (req, res) => {
  return res.json({
    status: "success",
    data: {
      organizationId: req.auth.organizationId,
      locationScope: req.auth.locationScope,
      activeLocationId: req.auth.activeLocationId,
      consolidatedHeadOffice: req.auth.consolidatedHeadOffice,
      availableLocations: req.auth.availableLocations || [],
      instruction: "Use X-CHRiS-Location-Id for a branch-specific session context; omit it for consolidated Head Office context.",
    },
  });
});

module.exports = router;
