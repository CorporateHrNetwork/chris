const express = require("express");
const prisma = require("../config/prisma");
const { requireAuth, requirePermission } = require("../middleware/authMiddleware");

const router = express.Router();
const ENTITY_TYPE = "OrganizationSettings";

const DEFINITIONS = {
  employees: {
    label: "Employee Settings",
    defaults: {
      defaultEmploymentType: "Permanent",
      defaultEmployeeStatus: "PROBATION",
      requireNin: true,
      enforceDuplicateEmailProtection: true,
      onboardingCompletionRequired: true,
      employeeProfileChangeAudit: true,
    },
  },
  payroll: {
    label: "Payroll Settings",
    defaults: {
      currency: "NGN",
      payrollFrequency: "MONTHLY",
      requireApprovalBeforeFinalization: true,
      loansAutoRecovery: true,
      salaryAdvanceAutoRecovery: true,
      attendanceReadinessRequired: true,
    },
  },
  attendance: {
    label: "Attendance Settings",
    defaults: {
      standardDailyHours: 8,
      latenessGraceMinutes: 0,
      overtimeApprovalRequired: true,
      attendanceRequiredForPayroll: true,
      suppressAttendanceDuringActiveLeave: true,
      publicHolidayCalendarEnabled: true,
    },
  },
  leave: {
    label: "Leave Settings",
    defaults: {
      leaveYearStartMonth: 1,
      requireManagerApproval: true,
      preventNegativeBalance: true,
      returnToWorkRequired: true,
      attachmentRulesEnabled: true,
      autoCommencementEnabled: true,
    },
  },
  benefits: {
    label: "Benefits Settings",
    defaults: {
      pensionEnabled: true,
      healthInsuranceEnabled: true,
      lifeInsuranceEnabled: false,
      gratuityEnabled: false,
      benefitEligibilityAudit: true,
      effectiveDatedBenefitRules: true,
    },
  },
  recruitment: {
    label: "Recruitment Settings",
    defaults: {
      requisitionApprovalRequired: true,
      structuredInterviewEnabled: true,
      candidateConsentRequired: true,
      duplicateCandidateProtection: true,
      offerApprovalRequired: true,
      talentPoolEnabled: true,
    },
  },
  notifications: {
    label: "Notification Settings",
    defaults: {
      inAppNotifications: true,
      emailNotifications: true,
      whatsappNotifications: false,
      criticalIncidentAlerts: true,
      approvalReminders: true,
      supportCaseUpdates: true,
    },
  },
  security: {
    label: "Security Settings",
    defaults: {
      sessionHours: 8,
      passwordMinimumLength: 10,
      failedLoginLimit: 5,
      requireMfa: false,
      auditRetentionDays: 365,
      sensitiveExportConfirmation: true,
    },
  },
  system: {
    label: "System Settings",
    defaults: {
      timezone: "Africa/Lagos",
      locale: "en-NG",
      dateFormat: "DD/MM/YYYY",
      currency: "NGN",
      supportEmail: "support@crnetwork.com.ng",
      maintenanceMode: false,
    },
  },
};

function definitionFor(section) {
  return DEFINITIONS[String(section || "").trim().toLowerCase()] || null;
}

function coerceAgainstDefaults(defaults, input) {
  const next = {};
  for (const [key, defaultValue] of Object.entries(defaults)) {
    if (!Object.prototype.hasOwnProperty.call(input || {}, key)) {
      next[key] = defaultValue;
      continue;
    }
    const value = input[key];
    if (typeof defaultValue === "boolean") {
      if (typeof value !== "boolean") throw new Error(`INVALID_SETTING_TYPE:${key}`);
      next[key] = value;
      continue;
    }
    if (typeof defaultValue === "number") {
      const number = Number(value);
      if (!Number.isFinite(number)) throw new Error(`INVALID_SETTING_TYPE:${key}`);
      next[key] = number;
      continue;
    }
    next[key] = String(value ?? "").trim();
  }
  return next;
}

async function latestSettingEvent(organizationId, section) {
  return prisma.organizationAudit.findFirst({
    where: { organizationId, entityType: ENTITY_TYPE, entityId: section },
    orderBy: { createdAt: "desc" },
    include: { actor: { select: { email: true, firstName: true, lastName: true } } },
  });
}

router.use(requireAuth);

router.get("/", requirePermission("settings.view"), (req, res) => {
  const data = Object.entries(DEFINITIONS).map(([key, definition]) => ({ key, label: definition.label }));
  return res.json({ status: "success", data });
});

router.get("/:section", requirePermission("settings.view"), async (req, res) => {
  try {
    const section = String(req.params.section || "").trim().toLowerCase();
    const definition = definitionFor(section);
    if (!definition) return res.status(404).json({ status: "error", message: "Settings section not found." });

    const event = await latestSettingEvent(req.auth.organizationId, section);
    const saved = event?.newValue?.values || {};
    const values = { ...definition.defaults, ...saved };
    return res.json({
      status: "success",
      data: {
        section,
        label: definition.label,
        values,
        defaults: definition.defaults,
        updatedAt: event?.createdAt || null,
        updatedBy: event?.actor?.email || null,
      },
    });
  } catch (error) {
    console.error("Organization settings read error:", error);
    return res.status(500).json({ status: "error", message: "Unable to load organization settings." });
  }
});

router.put("/:section", requirePermission("settings.manage"), async (req, res) => {
  try {
    const section = String(req.params.section || "").trim().toLowerCase();
    const definition = definitionFor(section);
    if (!definition) return res.status(404).json({ status: "error", message: "Settings section not found." });

    const currentEvent = await latestSettingEvent(req.auth.organizationId, section);
    const previousValues = { ...definition.defaults, ...(currentEvent?.newValue?.values || {}) };
    const values = coerceAgainstDefaults(definition.defaults, req.body?.values || req.body || {});

    const event = await prisma.organizationAudit.create({
      data: {
        organizationId: req.auth.organizationId,
        actorUserId: req.auth.userId,
        entityType: ENTITY_TYPE,
        entityId: section,
        action: "ORGANIZATION_SETTINGS_UPDATED",
        previousValue: { values: previousValues },
        newValue: { values },
        reason: String(req.body?.reason || `${definition.label} updated`).trim(),
      },
    });

    return res.json({
      status: "success",
      message: `${definition.label} saved successfully.`,
      data: { section, label: definition.label, values, updatedAt: event.createdAt, updatedBy: req.auth.email },
    });
  } catch (error) {
    console.error("Organization settings update error:", error);
    if (String(error.message || "").startsWith("INVALID_SETTING_TYPE:")) {
      return res.status(400).json({ status: "error", message: "One or more setting values are invalid.", code: error.message });
    }
    return res.status(500).json({ status: "error", message: "Unable to save organization settings." });
  }
});

module.exports = router;
