const express = require("express");
const prisma = require("../config/prisma");
const {
  requireAuth,
  requirePermission,
} = require("../middleware/authMiddleware");
const {
  resolveEffectiveEmploymentLevel,
  levelSummary,
} = require("../services/employeeEmploymentLevelAssignmentService");

const router = express.Router();

router.use(requireAuth);

const PROFILE_LEVEL_NON_FATAL_CODES = new Set([
  "EMPLOYMENT_LEVEL_MAPPING_REQUIRED",
  "EMPLOYEE_LEVEL_OVERRIDE_INACTIVE",
]);

function errorCode(error) {
  return error?.code || error?.message || "UNKNOWN_ERROR";
}

function normalizeStructureName(value) {
  return String(value || "").trim().toLocaleLowerCase();
}

function employeeOutsideActiveBranch(req, employee) {
  return Boolean(
    req.auth?.activeLocationId &&
      employee?.locationId !== req.auth.activeLocationId
  );
}

function activeLocationContext(req) {
  return req.auth?.activeLocationId
    ? { mode: "BRANCH", locationId: req.auth.activeLocationId }
    : { mode: "ALL_BRANCHES_CONSOLIDATED", locationId: null };
}

async function loadEmployeeProfile(organizationId, employeeNumber) {
  return prisma.employee.findFirst({
    where: {
      organizationId,
      employeeNumber,
    },
    include: {
      department: true,
      designation: { include: { employmentLevel: true } },
      location: true,
      user: true,
      leaveRequests: {
        where: { status: "ACTIVE" },
        orderBy: { commencementDate: "desc" },
        take: 1,
        include: { leaveType: true },
      },
      lineManagerAssignments: {
        where: { effectiveTo: null },
        take: 1,
        include: {
          manager: { include: { department: true, designation: true } },
        },
      },
    },
  });
}

/*
============================================================
EMPLOYEE DIRECTORY — ACTIVE BRANCH CONTEXT
============================================================

The authenticated CHRiS operating context is authoritative for
employee browsing. Super Users may switch between branches or
clear the branch header for the consolidated organization view.
============================================================
*/
router.get(
  "/",
  requirePermission("employees.view"),
  async (req, res) => {
    try {
      const employees = await prisma.employee.findMany({
        where: {
          organizationId: req.auth.organizationId,
          ...(req.auth.activeLocationId
            ? { locationId: req.auth.activeLocationId }
            : {}),
        },
        include: {
          department: true,
          designation: { include: { employmentLevel: true } },
          location: true,
          lineManagerAssignments: {
            where: { effectiveTo: null },
            take: 1,
            include: {
              manager: { include: { department: true, designation: true } },
            },
          },
          user: {
            select: {
              id: true,
              isActive: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      return res.status(200).json({
        status: "success",
        results: employees.length,
        locationContext: activeLocationContext(req),
        data: employees,
      });
    } catch (error) {
      console.error("Branch-scoped employee directory fetch error:", error);
      return res.status(500).json({
        status: "error",
        message: "Unable to fetch employees.",
      });
    }
  }
);

/*
============================================================
EMPLOYEE SUBROUTE — ACTIVE BRANCH SECURITY GUARD
============================================================

Every employee-specific route mounted after this router inherits
the selected branch context. This prevents direct navigation to
lifecycle, employment-history, job-change or other employee URLs
outside the active branch. Non-employee route prefixes simply fall
through to their owning router.
============================================================
*/
router.use("/:employeeNumber", async (req, res, next) => {
  if (!req.auth.activeLocationId) return next();

  try {
    const employeeNumber = String(req.params.employeeNumber || "")
      .trim()
      .toUpperCase();

    const employee = await prisma.employee.findFirst({
      where: {
        organizationId: req.auth.organizationId,
        employeeNumber,
      },
      select: {
        id: true,
        locationId: true,
      },
    });

    if (!employee) return next();

    if (employee.locationId !== req.auth.activeLocationId) {
      return res.status(403).json({
        status: "error",
        code: "EMPLOYEE_OUTSIDE_ACTIVE_BRANCH",
        message:
          "The selected employee does not belong to the active CHRiS branch context.",
      });
    }

    return next();
  } catch (error) {
    console.error("Employee active-branch guard error:", error);
    return res.status(500).json({
      status: "error",
      message: "Unable to validate the active branch context.",
    });
  }
});

/*
============================================================
EMPLOYEE PROFILE — EFFECTIVE EMPLOYMENT LEVEL
============================================================

This route deliberately runs before the legacy employee profile
route. It preserves the existing profile response shape while
making designation.employmentLevel represent the employee's
CURRENT EFFECTIVE level:

  employee-specific override -> designation default

The designation's configured default is preserved separately as
`designation.defaultEmploymentLevel`, so structural configuration
is never lost or rewritten for an individual employee.
============================================================
*/
router.get(
  "/:employeeNumber",
  requirePermission("employees.view"),
  async (req, res, next) => {
    try {
      const organizationId = req.auth.organizationId;
      const employeeNumber = String(req.params.employeeNumber || "").trim();
      const employee = await loadEmployeeProfile(organizationId, employeeNumber);

      if (!employee) return next();

      if (employeeOutsideActiveBranch(req, employee)) {
        return res.status(403).json({
          status: "error",
          code: "EMPLOYEE_OUTSIDE_ACTIVE_BRANCH",
          message:
            "The selected employee does not belong to the active CHRiS branch context.",
        });
      }

      const designationDefault = employee.designation?.employmentLevel || null;
      let effective = null;
      let employmentLevelWarning = null;

      try {
        effective = await resolveEffectiveEmploymentLevel(prisma, {
          organizationId,
          employeeId: employee.id,
        });
      } catch (error) {
        const code = errorCode(error);
        if (!PROFILE_LEVEL_NON_FATAL_CODES.has(code)) throw error;
        employmentLevelWarning = code;
      }

      const effectiveEmploymentLevel = effective?.employmentLevel || null;
      const effectiveSummary = effectiveEmploymentLevel
        ? {
            ...levelSummary(effectiveEmploymentLevel),
            source: effective.source,
            override: effective.override || null,
          }
        : null;

      const data = {
        ...employee,
        designation: employee.designation
          ? {
              ...employee.designation,
              defaultEmploymentLevel: designationDefault,
              employmentLevel: effectiveEmploymentLevel,
            }
          : null,
        effectiveEmploymentLevel: effectiveSummary,
        employmentLevelSource: effective?.source || null,
        employmentLevelWarning,
        locationContext: activeLocationContext(req),
      };

      return res.status(200).json({
        status: "success",
        data,
      });
    } catch (error) {
      console.error("Employee governed profile fetch error:", error);
      return res.status(500).json({
        status: "error",
        message: "Unable to fetch employee profile.",
      });
    }
  }
);

/*
============================================================
EMPLOYEE MASTER-DATA STRUCTURE GUARD
============================================================

The legacy Edit Employee form can continue to update ordinary
master data, but Department and Designation may no longer be
changed through free text. Structural movement must use the
controlled Designation / Job Change workflow.
============================================================
*/
router.put(
  "/:employeeNumber",
  requirePermission("employees.update"),
  async (req, res, next) => {
    try {
      const organizationId = req.auth.organizationId;
      const employeeNumber = String(req.params.employeeNumber || "").trim();
      const employee = await prisma.employee.findFirst({
        where: { organizationId, employeeNumber },
        select: {
          id: true,
          locationId: true,
          department: { select: { id: true, name: true } },
          designation: { select: { id: true, name: true } },
        },
      });

      if (!employee) return next();

      if (employeeOutsideActiveBranch(req, employee)) {
        return res.status(403).json({
          status: "error",
          code: "EMPLOYEE_OUTSIDE_ACTIVE_BRANCH",
          message:
            "The selected employee does not belong to the active CHRiS branch context.",
        });
      }

      const submittedDepartment = req.body?.department;
      const submittedDesignation = req.body?.designation;
      const departmentChanged =
        submittedDepartment != null &&
        normalizeStructureName(submittedDepartment) !==
          normalizeStructureName(employee.department?.name);
      const designationChanged =
        submittedDesignation != null &&
        normalizeStructureName(submittedDesignation) !==
          normalizeStructureName(employee.designation?.name);

      if (departmentChanged || designationChanged) {
        return res.status(409).json({
          status: "error",
          code: "STRUCTURE_CHANGE_REQUIRES_CONTROLLED_JOB_CHANGE",
          message:
            "Department and Designation are controlled employment-structure fields. Use Employee Employment Governance / Job Change to change them.",
          details: {
            currentDepartment: employee.department?.name || null,
            currentDesignation: employee.designation?.name || null,
          },
        });
      }

      return next();
    } catch (error) {
      console.error("Employee master-data structure guard error:", error);
      return res.status(500).json({
        status: "error",
        message: "Unable to validate employee structure fields.",
      });
    }
  }
);

module.exports = router;
