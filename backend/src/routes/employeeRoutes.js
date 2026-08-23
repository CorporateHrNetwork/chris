const {
  CAREER_STRUCTURE_TEMPLATES,
  getCareerStructureTemplate,
} = require("../config/careerStructureTemplates");
const express = require("express");
const prisma = require("../config/prisma");

const {
  requireAuth,
  requirePermission,
} = require("../middleware/authMiddleware");

const router = express.Router();

router.use(requireAuth);

/*
============================================================
HELPERS
============================================================
*/

const STATUS_MAP = {
  Active: "ACTIVE",
  Probation: "PROBATION",
  Leave: "LEAVE",
  Suspended: "SUSPENDED",
  Terminated: "TERMINATED",
  Resigned: "RESIGNED",
  Retired: "RETIRED",
  Inactive: "INACTIVE",
};

const EXIT_STATUSES = [
  "RESIGNED",
  "TERMINATED",
  "RETIRED",
];

const REHIRE_STATUSES = [
  ...EXIT_STATUSES,
  "INACTIVE",
];

function normalizeEmployeeGender(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return ["MALE", "FEMALE", "OTHER", "UNSPECIFIED"].includes(normalized)
    ? normalized
    : "UNSPECIFIED";
}
function normalizeEmployeeName(name) {
  const nameParts = name
    .trim()
    .split(/\s+/);

  if (nameParts.length < 2) {
    return null;
  }

  return {
    firstName: nameParts[0],

    middleName:
      nameParts.length > 2
        ? nameParts
            .slice(1, -1)
            .join(" ")
        : null,

    lastName:
      nameParts[
        nameParts.length - 1
      ],
  };
}

async function getEmployee(
  organizationId,
  employeeNumber
) {
  return prisma.employee.findFirst({
    where: {
      organizationId,
      employeeNumber,
    },

    include: {
      department: true,
      designation: true,
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
GET ALL EMPLOYEES
Permission: employees.view
============================================================
*/

router.get(
  "/",
  requirePermission("employees.view"),
  async (req, res) => {
    try {
      const organizationId =
        req.auth.organizationId;

      const employees =
        await prisma.employee.findMany({
          where: {
            organizationId,
          },

          include: {
            department: true,
            designation: true,
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

          orderBy: {
            createdAt: "desc",
          },
        });

      return res.status(200).json({
        status: "success",
        results: employees.length,
        data: employees,
      });
    } catch (error) {
      console.error(
        "Employee fetch error:",
        error
      );

      return res.status(500).json({
        status: "error",
        message:
          "Unable to fetch employees.",
      });
    }
  }
);

/*
============================================================
GET ONE EMPLOYEE
Permission: employees.view
============================================================
*/

router.get(
  "/:employeeNumber",
  requirePermission("employees.view"),
  async (req, res) => {
    try {
      const organizationId =
        req.auth.organizationId;

      const {
        employeeNumber,
      } = req.params;

      const employee =
        await getEmployee(
          organizationId,
          employeeNumber
        );

      if (!employee) {
        return res.status(404).json({
          status: "error",
          message:
            "Employee not found.",
        });
      }

      return res.status(200).json({
        status: "success",
        data: employee,
      });
    } catch (error) {
      console.error(
        "Employee profile fetch error:",
        error
      );

      return res.status(500).json({
        status: "error",
        message:
          "Unable to fetch employee profile.",
      });
    }
  }
);

/*
============================================================
GET EMPLOYEE EMPLOYMENT EPISODES
Permission: employees.view
============================================================

Returns the employee's distinct service periods.

Employment Episodes answer:
- how many separate periods of employment exist;
- when each period started and ended;
- the starting and ending employment structure;
- whether an episode is CURRENT or CLOSED.

The permanent Employee ID is not recreated between episodes.
============================================================
*/

router.get(
  "/:employeeNumber/employment-episodes",
  requirePermission(
    "employees.view"
  ),
  async (req, res) => {
    try {
      const organizationId =
        req.auth.organizationId;

      const {
        employeeNumber,
      } = req.params;

      const employee =
        await prisma.employee.findFirst({
          where: {
            organizationId,
            employeeNumber,
          },

          select: {
            id: true,
            employeeNumber: true,
            firstName: true,
            middleName: true,
            lastName: true,
          },
        });

      if (!employee) {
        return res.status(404).json({
          status:
            "error",

          message:
            "Employee not found.",
        });
      }

      const episodes =
        await prisma.employeeEmploymentEpisode.findMany({
          where: {
            organizationId,

            employeeId:
              employee.id,
          },

          include: {
            startDepartment: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },

            startDesignation: {
              select: {
                id: true,
                name: true,
                code: true,
                careerTrack: true,
                careerLevel: true,
              },
            },

            startLocation: {
              select: {
                id: true,
                name: true,
                code: true,
                type: true,
                city: true,
                state: true,
                country: true,
              },
            },

            endDepartment: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },

            endDesignation: {
              select: {
                id: true,
                name: true,
                code: true,
                careerTrack: true,
                careerLevel: true,
              },
            },

            endLocation: {
              select: {
                id: true,
                name: true,
                code: true,
                type: true,
                city: true,
                state: true,
                country: true,
              },
            },
          },

          orderBy: {
            sequenceNumber:
              "desc",
          },
        });

      return res.status(200).json({
        status:
          "success",

        results:
          episodes.length,

        employee: {
          id:
            employee.id,

          employeeNumber:
            employee.employeeNumber,

          name: [
            employee.firstName,
            employee.middleName,
            employee.lastName,
          ]
            .filter(Boolean)
            .join(" "),
        },

        data:
          episodes,
      });
    } catch (error) {
      console.error(
        "Employee employment episodes fetch error:",
        error
      );

      return res.status(500).json({
        status:
          "error",

        message:
          "Unable to fetch employee employment episodes.",
      });
    }
  }
);

/*
============================================================
GET EMPLOYEE LIFECYCLE / EMPLOYMENT HISTORY
Permission: employees.view
============================================================

Returns the permanent employment history recorded for an
employee, including:

- lifecycle event
- effective date
- previous and new status
- source and destination location
- reason / notes
- CHRIS user who performed the transaction

The employee and lifecycle events are restricted to the
authenticated organization.
============================================================
*/

router.get(
  "/:employeeNumber/lifecycle",
  requirePermission(
    "employees.view"
  ),
  async (req, res) => {
    try {
      const organizationId =
        req.auth.organizationId;

      const {
        employeeNumber,
      } = req.params;

      /*
      ----------------------------------------------------------
      Confirm employee belongs to authenticated organization.
      ----------------------------------------------------------
      */

      const employee =
        await prisma.employee.findFirst({
          where: {
            organizationId,
            employeeNumber,
          },

          select: {
            id: true,
            employeeNumber: true,
            firstName: true,
            middleName: true,
            lastName: true,
            status: true,
            exitDate: true,
          },
        });

      if (!employee) {
        return res.status(404).json({
          status:
            "error",

          message:
            "Employee not found.",
        });
      }

      /*
      ----------------------------------------------------------
      Load permanent lifecycle history.
      ----------------------------------------------------------
      */

      const lifecycleEvents =
        await prisma.employeeLifecycleEvent.findMany({
          where: {
            organizationId,

            employeeId:
              employee.id,
          },

          include: {
            fromLocation: {
              select: {
                id: true,
                name: true,
                code: true,
                type: true,
                city: true,
                state: true,
                country: true,
              },
            },

            toLocation: {
              select: {
                id: true,
                name: true,
                code: true,
                type: true,
                city: true,
                state: true,
                country: true,
              },
            },

            previousDepartment: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },

            newDepartment: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },

            previousDesignation: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },

            newDesignation: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
            performedBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },

          orderBy: [
            {
              effectiveDate:
                "desc",
            },

            {
              createdAt:
                "desc",
            },
          ],
        });

      return res.status(200).json({
        status:
          "success",

        results:
          lifecycleEvents.length,

        employee: {
          id:
            employee.id,

          employeeNumber:
            employee.employeeNumber,

          name: [
            employee.firstName,
            employee.middleName,
            employee.lastName,
          ]
            .filter(Boolean)
            .join(" "),

          currentStatus:
            employee.status,

          exitDate:
            employee.exitDate,
        },

        data:
          lifecycleEvents,
      });
    } catch (error) {
      console.error(
        "Employee lifecycle history fetch error:",
        error
      );

      return res.status(500).json({
        status:
          "error",

        message:
          "Unable to fetch employee employment history.",
      });
    }
  }
);
/*
============================================================
UPDATE EMPLOYEE MASTER RECORD
Permission: employees.update
============================================================
*/

router.put(
  "/:employeeNumber",
  requirePermission(
    "employees.update"
  ),
  async (req, res) => {
    try {
      const organizationId =
        req.auth.organizationId;

      const {
        employeeNumber,
      } = req.params;

      const {
        name,
        department,
        designation,
        email,
        phone,
        status,
        gender,
        hireDate,
        confirmationDate,
        exitDate,
        locationId,
      } = req.body;

      if (
        !name?.trim() ||
        !department?.trim() ||
        !designation?.trim() ||
        !email?.trim() ||
        !phone?.trim()
      ) {
        return res.status(400).json({
          status: "error",

          message:
            "Please complete all required employee fields.",
        });
      }

      const existingEmployee =
        await prisma.employee.findFirst({
          where: {
            organizationId,
            employeeNumber,
          },

          include: {
            user: true,
            location: true,
          },
        });

      if (!existingEmployee) {
        return res.status(404).json({
          status: "error",
          message:
            "Employee not found.",
        });
      }

      const normalizedEmail =
        email
          .trim()
          .toLowerCase();

      const duplicateEmail =
        await prisma.employee.findFirst({
          where: {
            organizationId,

            email:
              normalizedEmail,

            NOT: {
              id:
                existingEmployee.id,
            },
          },
        });

      if (duplicateEmail) {
        return res.status(409).json({
          status: "error",

          message:
            "Another employee already uses this email address.",
        });
      }

      const normalizedName =
        normalizeEmployeeName(
          name
        );

      if (!normalizedName) {
        return res.status(400).json({
          status: "error",

          message:
            "Please enter at least a first and last name.",
        });
      }

      const departmentRecord =
        await prisma.department.upsert({
          where: {
            organizationId_name: {
              organizationId,

              name:
                department.trim(),
            },
          },

          update: {},

          create: {
            organizationId,

            name:
              department.trim(),
          },
        });

      const designationRecord =
        await prisma.designation.upsert({
          where: {
            organizationId_name: {
              organizationId,

              name:
                designation.trim(),
            },
          },

          update: {},

          create: {
            organizationId,

            name:
              designation.trim(),
          },
        });

      /*
      ------------------------------------------------------------
      INITIAL / CORRECTIVE WORK LOCATION ASSIGNMENT
      ------------------------------------------------------------

      Employee master-data editing may assign a work location only
      when the employee currently has no location.

      Once a location is established, changing it through this PUT
      route is prohibited. Genuine location movement must use the
      controlled Transfer Employee workflow so CHRIS preserves the
      employment lifecycle transaction.
      ------------------------------------------------------------
      */

      let resolvedLocationId =
        existingEmployee.locationId ||
        null;

      if (
        existingEmployee.locationId
      ) {
        if (
          locationId &&
          String(locationId).trim() &&
          String(locationId).trim() !==
            existingEmployee.locationId
        ) {
          return res.status(409).json({
            status:
              "error",

            code:
              "LOCATION_CHANGE_REQUIRES_TRANSFER",

            message:
              "This employee already has a work location. Use Transfer Employee to move the employee to another location.",
          });
        }
      } else {
        if (
          !locationId ||
          !String(locationId).trim()
        ) {
          return res.status(400).json({
            status:
              "error",

            code:
              "INITIAL_EMPLOYEE_LOCATION_REQUIRED",

            message:
              "Select the employee's initial work location before saving.",
          });
        }

        const locationRecord =
          await prisma.organizationLocation.findFirst({
            where: {
              id:
                String(
                  locationId
                ).trim(),

              organizationId,

              isActive:
                true,
            },

            select: {
              id:
                true,

              name:
                true,

              code:
                true,
            },
          });

        if (!locationRecord) {
          return res.status(400).json({
            status:
              "error",

            code:
              "INVALID_EMPLOYEE_LOCATION",

            message:
              "Select an active work location from your organization's CHRIS location catalogue.",
          });
        }

        resolvedLocationId =
          locationRecord.id;
      }


      const nextStatus =
        STATUS_MAP[status] ||
        existingEmployee.status;

      const employee =
        await prisma.$transaction(
          async (tx) => {
            const updatedEmployee =
              await tx.employee.update({
                where: {
                  id:
                    existingEmployee.id,
                },

                data: {
                  departmentId:
                    departmentRecord.id,

                  designationId:
                    designationRecord.id,

                  locationId:
                    resolvedLocationId,

                  firstName:
                    normalizedName.firstName,

                  middleName:
                    normalizedName.middleName,

                  lastName:
                    normalizedName.lastName,

                  email:
                    normalizedEmail,

                  phone:
                    phone.trim(),

                  gender:
                    normalizeEmployeeGender(gender),

                  status:
                    nextStatus,

                  hireDate:
                    hireDate
                      ? new Date(
                          hireDate
                        )
                      : null,

                  confirmationDate:
                    confirmationDate
                      ? new Date(
                          confirmationDate
                        )
                      : null,

                  exitDate:
                    exitDate
                      ? new Date(
                          exitDate
                        )
                      : null,
                },

                include: {
                  department: true,
                  designation: true,
                  location: true,
                },
              });

            /*
            Keep linked User identity
            synchronized with Employee
            master data.
            */

            if (
              existingEmployee.user
            ) {
              await tx.user.update({
                where: {
                  id:
                    existingEmployee
                      .user.id,
                },

                data: {
                  firstName:
                    normalizedName.firstName,

                  lastName:
                    normalizedName.lastName,

                  email:
                    normalizedEmail,
                },
              });
            }

            return updatedEmployee;
          }
        );

      return res.status(200).json({
        status: "success",

        message:
          existingEmployee.locationId
            ? "Employee updated successfully."
            : "Employee updated successfully. Initial work location has been assigned.",

        data: employee,
      });
    } catch (error) {
      console.error(
        "Employee update error:",
        error
      );

      if (
        error.code === "P2002"
      ) {
        return res.status(409).json({
          status: "error",

          message:
            "The employee or linked CHRIS user already uses one of the submitted unique values.",
        });
      }

      return res.status(500).json({
        status: "error",

        message:
          "Unable to update employee.",
      });
    }
  }
);

/*
============================================================
CONFIRM EMPLOYEE EMPLOYMENT
Permission: employees.update
============================================================

Employment confirmation:
- applies only to employees currently on PROBATION
- changes employee status from PROBATION to ACTIVE
- records confirmationDate
- preserves department, designation and location
- creates a permanent CONFIRMED lifecycle event
============================================================
*/

router.patch(
  "/:employeeNumber/confirm",
  requirePermission(
    "employees.update"
  ),
  async (req, res) => {
    try {
      const organizationId =
        req.auth.organizationId;

      const {
        employeeNumber,
      } = req.params;

      const {
        effectiveDate,
        reason,
        notes,
      } = req.body || {};


      /*
      --------------------------------------------------------
      REQUIRED EFFECTIVE DATE
      --------------------------------------------------------
      */

      if (
        !effectiveDate ||
        !String(effectiveDate).trim()
      ) {
        return res.status(400).json({
          status: "error",
          code:
            "EFFECTIVE_DATE_REQUIRED",
          message:
            "A confirmation effective date is required.",
        });
      }


      const parsedEffectiveDate =
        new Date(effectiveDate);

      if (
        Number.isNaN(
          parsedEffectiveDate.getTime()
        )
      ) {
        return res.status(400).json({
          status: "error",
          code:
            "INVALID_EFFECTIVE_DATE",
          message:
            "The supplied confirmation date is invalid.",
        });
      }


      /*
      --------------------------------------------------------
      FUTURE DATE PROTECTION
      --------------------------------------------------------

      Confirmation changes the employee's live status
      immediately. Scheduled future confirmations will be
      handled separately when CHRIS supports pending HR
      transactions.
      --------------------------------------------------------
      */

      const confirmationDateOnly =
        new Date(parsedEffectiveDate);

      confirmationDateOnly.setHours(
        0,
        0,
        0,
        0
      );

      const today =
        new Date();

      today.setHours(
        0,
        0,
        0,
        0
      );

      if (
        confirmationDateOnly >
        today
      ) {
        return res.status(409).json({
          status: "error",
          code:
            "FUTURE_CONFIRMATION_NOT_SUPPORTED",
          message:
            "Future-dated employment confirmation is not yet supported. Select today or an earlier effective date.",
        });
      }


      /*
      --------------------------------------------------------
      LOAD CURRENT EMPLOYEE
      --------------------------------------------------------
      */

      const existingEmployee =
        await getEmployee(
          organizationId,
          employeeNumber
        );

      if (!existingEmployee) {
        return res.status(404).json({
          status: "error",
          code:
            "EMPLOYEE_NOT_FOUND",
          message:
            "Employee not found.",
        });
      }


      /*
      --------------------------------------------------------
      CONFIRMATION ELIGIBILITY
      --------------------------------------------------------
      */

      if (
        existingEmployee.status !==
        "PROBATION"
      ) {
        return res.status(409).json({
          status: "error",
          code:
            "EMPLOYEE_NOT_ON_PROBATION",
          message:
            existingEmployee.status ===
            "ACTIVE"
              ? "Employee is already active and cannot be confirmed again."
              : "Only an employee currently on probation can be confirmed.",
        });
      }


      /*
      --------------------------------------------------------
      TRANSACTION
      --------------------------------------------------------
      */

      const employee =
        await prisma.$transaction(
          async (tx) => {

            const updatedEmployee =
              await tx.employee.update({
                where: {
                  id:
                    existingEmployee.id,
                },

                data: {
                  status:
                    "ACTIVE",

                  confirmationDate:
                    parsedEffectiveDate,
                },

                include: {
                  department: true,
                  designation: true,
                  location: true,

                  user: {
                    select: {
                      id: true,
                      isActive: true,
                    },
                  },
                },
              });


            await tx.employeeLifecycleEvent.create({
              data: {
                organizationId,

                employeeId:
                  existingEmployee.id,

                eventType:
                  "CONFIRMED",

                effectiveDate:
                  parsedEffectiveDate,

                previousStatus:
                  existingEmployee.status,

                newStatus:
                  "ACTIVE",

                fromLocationId:
                  existingEmployee.locationId,

                toLocationId:
                  existingEmployee.locationId,

                previousDepartmentId:
                  existingEmployee.departmentId,

                newDepartmentId:
                  existingEmployee.departmentId,

                previousDesignationId:
                  existingEmployee.designationId,

                newDesignationId:
                  existingEmployee.designationId,

                reason:
                  reason &&
                  String(reason).trim()
                    ? String(reason).trim()
                    : "Employment confirmed",

                notes:
                  notes &&
                  String(notes).trim()
                    ? String(notes).trim()
                    : null,

                performedByUserId:
                  req.auth.userId || null,
              },
            });


            return updatedEmployee;
          }
        );


      return res.status(200).json({
        status: "success",

        message:
          "Employment confirmed successfully. Employee status is now Active.",

        data: employee,
      });
    } catch (error) {
      console.error(
        "Employee confirmation error:",
        error
      );

      return res.status(500).json({
        status: "error",

        message:
          "Unable to confirm employee employment.",
      });
    }
  }
);



/*
============================================================
SUSPEND EMPLOYEE
Permission: employees.update
============================================================

Suspension:
- preserves employee history
- sets Employee to SUSPENDED
- disables linked CHRIS User
- records effective date
- records suspension end date
- records reason / notes
- preserves department, designation and location
============================================================
*/

router.patch(
  "/:employeeNumber/suspend",
  requirePermission(
    "employees.update"
  ),
  async (req, res) => {
    try {
      const organizationId =
        req.auth.organizationId;

      const {
        employeeNumber,
      } = req.params;

      const {
        effectiveDate,
        suspensionEndDate,
        reason,
        notes,
      } = req.body || {};


      /*
      --------------------------------------------------------
      REQUIRED FIELDS
      --------------------------------------------------------
      */

      if (
        !effectiveDate ||
        !String(effectiveDate).trim()
      ) {
        return res.status(400).json({
          status: "error",
          code:
            "EFFECTIVE_DATE_REQUIRED",
          message:
            "A suspension effective date is required.",
        });
      }


      if (
        !suspensionEndDate ||
        !String(suspensionEndDate).trim()
      ) {
        return res.status(400).json({
          status: "error",
          code:
            "SUSPENSION_END_DATE_REQUIRED",
          message:
            "A suspension end date is required.",
        });
      }


      if (
        !reason ||
        !String(reason).trim()
      ) {
        return res.status(400).json({
          status: "error",
          code:
            "SUSPENSION_REASON_REQUIRED",
          message:
            "A reason is required to suspend an employee.",
        });
      }


      /*
      --------------------------------------------------------
      DATE VALIDATION
      --------------------------------------------------------
      */

      const parsedEffectiveDate =
        new Date(effectiveDate);

      const parsedSuspensionEndDate =
        new Date(suspensionEndDate);


      if (
        Number.isNaN(
          parsedEffectiveDate.getTime()
        )
      ) {
        return res.status(400).json({
          status: "error",
          code:
            "INVALID_EFFECTIVE_DATE",
          message:
            "The supplied suspension effective date is invalid.",
        });
      }


      if (
        Number.isNaN(
          parsedSuspensionEndDate.getTime()
        )
      ) {
        return res.status(400).json({
          status: "error",
          code:
            "INVALID_SUSPENSION_END_DATE",
          message:
            "The supplied suspension end date is invalid.",
        });
      }


      const effectiveDateOnly =
        new Date(parsedEffectiveDate);

      effectiveDateOnly.setHours(
        0,
        0,
        0,
        0
      );


      const suspensionEndDateOnly =
        new Date(parsedSuspensionEndDate);

      suspensionEndDateOnly.setHours(
        0,
        0,
        0,
        0
      );


      if (
        suspensionEndDateOnly <
        effectiveDateOnly
      ) {
        return res.status(409).json({
          status: "error",
          code:
            "INVALID_SUSPENSION_PERIOD",
          message:
            "Suspension end date cannot be earlier than the effective date.",
        });
      }


      /*
      --------------------------------------------------------
      FUTURE START DATE PROTECTION
      --------------------------------------------------------
      */

      const today =
        new Date();

      today.setHours(
        0,
        0,
        0,
        0
      );


      if (
        effectiveDateOnly >
        today
      ) {
        return res.status(409).json({
          status: "error",
          code:
            "FUTURE_SUSPENSION_NOT_SUPPORTED",
          message:
            "Future-dated employee suspension is not yet supported. Select today or an earlier effective date.",
        });
      }


      /*
      --------------------------------------------------------
      LOAD CURRENT EMPLOYEE
      --------------------------------------------------------
      */

      const existingEmployee =
        await getEmployee(
          organizationId,
          employeeNumber
        );

      if (!existingEmployee) {
        return res.status(404).json({
          status: "error",
          code:
            "EMPLOYEE_NOT_FOUND",
          message:
            "Employee not found.",
        });
      }


      /*
      --------------------------------------------------------
      SUSPENSION ELIGIBILITY
      --------------------------------------------------------
      */

      if (
        EXIT_STATUSES.includes(
          existingEmployee.status
        )
      ) {
        return res.status(409).json({
          status: "error",
          code:
            "EMPLOYEE_EXITED",
          message:
            "An exited employee cannot be suspended.",
        });
      }


      if (
        existingEmployee.status ===
        "SUSPENDED"
      ) {
        return res.status(409).json({
          status: "error",
          code:
            "EMPLOYEE_ALREADY_SUSPENDED",
          message:
            "Employee is already suspended.",
        });
      }


      /*
      --------------------------------------------------------
      TRANSACTION
      --------------------------------------------------------
      */

      const employee =
        await prisma.$transaction(
          async (tx) => {

            const updatedEmployee =
              await tx.employee.update({
                where: {
                  id:
                    existingEmployee.id,
                },

                data: {
                  status:
                    "SUSPENDED",

                  suspensionEndDate:
                    parsedSuspensionEndDate,
                },

                include: {
                  department: true,
                  designation: true,
                  location: true,

                  user: {
                    select: {
                      id: true,
                      isActive: true,
                    },
                  },
                },
              });


            /*
            Disable linked CHRIS access while suspended.
            */

            if (
              existingEmployee.user
            ) {
              await tx.user.update({
                where: {
                  id:
                    existingEmployee.user.id,
                },

                data: {
                  isActive:
                    false,
                },
              });
            }


            /*
            Permanent employment lifecycle audit record.
            */

            await tx.employeeLifecycleEvent.create({
              data: {
                organizationId,

                employeeId:
                  existingEmployee.id,

                eventType:
                  "SUSPENDED",

                effectiveDate:
                  parsedEffectiveDate,

                suspensionEndDate:
                  parsedSuspensionEndDate,

                previousStatus:
                  existingEmployee.status,

                newStatus:
                  "SUSPENDED",

                fromLocationId:
                  existingEmployee.locationId,

                toLocationId:
                  existingEmployee.locationId,

                previousDepartmentId:
                  existingEmployee.departmentId,

                newDepartmentId:
                  existingEmployee.departmentId,

                previousDesignationId:
                  existingEmployee.designationId,

                newDesignationId:
                  existingEmployee.designationId,

                reason:
                  String(reason).trim(),

                notes:
                  notes &&
                  String(notes).trim()
                    ? String(notes).trim()
                    : null,

                performedByUserId:
                  req.auth.userId || null,
              },
            });


            return updatedEmployee;
          }
        );


      return res.status(200).json({
        status: "success",

        message:
          "Employee suspended successfully. Linked CHRIS access has been disabled.",

        data:
          employee,
      });
    } catch (error) {
      console.error(
        "Employee suspension error:",
        error
      );

      return res.status(500).json({
        status: "error",

        message:
          "Unable to suspend employee.",
      });
    }
  }
);

/*
============================================================
DEACTIVATE EMPLOYEE
Permission: employees.update
============================================================

Deactivation:
- applies to employees still in employment
- changes employee status to INACTIVE
- disables linked CHRIS access
- records effective date
- records reason / notes
- preserves department, designation and location
- creates a permanent DEACTIVATED lifecycle event

This is not an employee exit transaction.
Resignation, termination and retirement remain separate.
============================================================
*/

router.patch(
  "/:employeeNumber/deactivate",
  requirePermission(
    "employees.update"
  ),
  async (req, res) => {
    try {
      const organizationId =
        req.auth.organizationId;

      const {
        employeeNumber,
      } = req.params;

      const {
        effectiveDate,
        reason,
        notes,
      } = req.body || {};


      /*
      --------------------------------------------------------
      REQUIRED EFFECTIVE DATE
      --------------------------------------------------------
      */

      if (
        !effectiveDate ||
        !String(effectiveDate).trim()
      ) {
        return res.status(400).json({
          status: "error",

          code:
            "EFFECTIVE_DATE_REQUIRED",

          message:
            "A deactivation effective date is required.",
        });
      }


      /*
      --------------------------------------------------------
      REQUIRED REASON
      --------------------------------------------------------
      */

      if (
        !reason ||
        !String(reason).trim()
      ) {
        return res.status(400).json({
          status: "error",

          code:
            "DEACTIVATION_REASON_REQUIRED",

          message:
            "A reason is required to deactivate an employee.",
        });
      }


      /*
      --------------------------------------------------------
      EFFECTIVE DATE VALIDATION
      --------------------------------------------------------
      */

      const parsedEffectiveDate =
        new Date(effectiveDate);

      if (
        Number.isNaN(
          parsedEffectiveDate.getTime()
        )
      ) {
        return res.status(400).json({
          status: "error",

          code:
            "INVALID_EFFECTIVE_DATE",

          message:
            "The supplied deactivation effective date is invalid.",
        });
      }


      /*
      --------------------------------------------------------
      FUTURE DATE PROTECTION

      Deactivation changes the employee's live status and
      disables linked CHRIS access immediately.

      Future-dated deactivation will require the scheduled
      HR transaction engine.
      --------------------------------------------------------
      */

      const effectiveDateOnly =
        new Date(parsedEffectiveDate);

      effectiveDateOnly.setHours(
        0,
        0,
        0,
        0
      );

      const today =
        new Date();

      today.setHours(
        0,
        0,
        0,
        0
      );

      if (
        effectiveDateOnly >
        today
      ) {
        return res.status(409).json({
          status: "error",

          code:
            "FUTURE_DEACTIVATION_NOT_SUPPORTED",

          message:
            "Future-dated employee deactivation is not yet supported. Select today or an earlier effective date.",
        });
      }


      /*
      --------------------------------------------------------
      LOAD CURRENT EMPLOYEE
      --------------------------------------------------------
      */

      const existingEmployee =
        await getEmployee(
          organizationId,
          employeeNumber
        );

      if (!existingEmployee) {
        return res.status(404).json({
          status: "error",

          code:
            "EMPLOYEE_NOT_FOUND",

          message:
            "Employee not found.",
        });
      }


      /*
      --------------------------------------------------------
      EXITED EMPLOYEE PROTECTION
      --------------------------------------------------------
      */

      if (
        EXIT_STATUSES.includes(
          existingEmployee.status
        )
      ) {
        return res.status(409).json({
          status: "error",

          code:
            "EMPLOYEE_EXITED",

          message:
            "An exited employee cannot be deactivated through this action.",
        });
      }


      /*
      --------------------------------------------------------
      ALREADY INACTIVE PROTECTION
      --------------------------------------------------------
      */

      if (
        existingEmployee.status ===
        "INACTIVE"
      ) {
        return res.status(409).json({
          status: "error",

          code:
            "EMPLOYEE_ALREADY_INACTIVE",

          message:
            "Employee is already inactive.",
        });
      }


      /*
      --------------------------------------------------------
      SUSPENDED EMPLOYEE PROTECTION

      Suspended employees should normally be reactivated or
      otherwise resolved through the suspension workflow
      before a separate deactivation transaction is recorded.
      --------------------------------------------------------
      */

      if (
        existingEmployee.status ===
        "SUSPENDED"
      ) {
        return res.status(409).json({
          status: "error",

          code:
            "EMPLOYEE_SUSPENDED",

          message:
            "A suspended employee cannot be deactivated directly. Resolve the suspension first.",
        });
      }


      /*
      --------------------------------------------------------
      TRANSACTION
      --------------------------------------------------------
      */

      const employee =
        await prisma.$transaction(
          async (tx) => {

            const updatedEmployee =
              await tx.employee.update({
                where: {
                  id:
                    existingEmployee.id,
                },

                data: {
                  status:
                    "INACTIVE",
                },

                include: {
                  department:
                    true,

                  designation:
                    true,

                  location:
                    true,

                  user: {
                    select: {
                      id:
                        true,

                      isActive:
                        true,
                    },
                  },
                },
              });


            /*
            ----------------------------------------------------
            DISABLE LINKED CHRIS ACCESS
            ----------------------------------------------------
            */

            if (
              existingEmployee.user
            ) {
              await tx.user.update({
                where: {
                  id:
                    existingEmployee.user.id,
                },

                data: {
                  isActive:
                    false,
                },
              });
            }


            /*
            ----------------------------------------------------
            PERMANENT EMPLOYMENT LIFECYCLE RECORD
            ----------------------------------------------------
            */

            await tx.employeeLifecycleEvent.create({
              data: {
                organizationId,

                employeeId:
                  existingEmployee.id,

                eventType:
                  "DEACTIVATED",

                effectiveDate:
                  parsedEffectiveDate,

                previousStatus:
                  existingEmployee.status,

                newStatus:
                  "INACTIVE",

                fromLocationId:
                  existingEmployee.locationId,

                toLocationId:
                  existingEmployee.locationId,

                previousDepartmentId:
                  existingEmployee.departmentId,

                newDepartmentId:
                  existingEmployee.departmentId,

                previousDesignationId:
                  existingEmployee.designationId,

                newDesignationId:
                  existingEmployee.designationId,

                reason:
                  String(reason).trim(),

                notes:
                  notes &&
                  String(notes).trim()
                    ? String(notes).trim()
                    : null,

                performedByUserId:
                  req.auth.userId ||
                  null,
              },
            });


            return updatedEmployee;
          }
        );


      /*
      --------------------------------------------------------
      SUCCESS RESPONSE
      --------------------------------------------------------
      */

      return res.status(200).json({
        status:
          "success",

        message:
          "Employee deactivated successfully. Linked CHRIS access has been disabled.",

        data:
          employee,
      });
    } catch (error) {
      console.error(
        "Employee deactivation error:",
        error
      );

      return res.status(500).json({
        status:
          "error",

        message:
          "Unable to deactivate employee.",
      });
    }
  }
);

/*
============================================================
EXIT EMPLOYEE
Permission: employees.update
============================================================

Controlled employee exit supports:

- RESIGNED
- TERMINATED
- RETIRED

The transaction:
- requires an exit type
- requires an exit effective date / last working day
- requires a reason
- accepts optional notes
- prevents future-dated exit transactions for now
- prevents duplicate exit processing
- changes the employee's live status
- records exitDate
- disables linked CHRIS access
- preserves department, designation and location
- creates a permanent EXITED lifecycle event

Future-dated exits will be supported later through CHRIS'
scheduled HR transaction engine.
============================================================
*/

router.patch(
  "/:employeeNumber/exit",
  requirePermission(
    "employees.update"
  ),
  async (req, res) => {
    try {
      const organizationId =
        req.auth.organizationId;

      const {
        employeeNumber,
      } = req.params;

      const {
        exitStatus,
        exitDate,
        reason,
        notes,
      } = req.body || {};


      /*
      --------------------------------------------------------
      EXIT TYPE
      --------------------------------------------------------
      */

      if (
        !EXIT_STATUSES.includes(
          exitStatus
        )
      ) {
        return res.status(400).json({
          status:
            "error",

          code:
            "INVALID_EXIT_STATUS",

          message:
            "Select a valid exit type: Resigned, Terminated or Retired.",
        });
      }


      /*
      --------------------------------------------------------
      REQUIRED EXIT DATE
      --------------------------------------------------------
      */

      if (
        !exitDate ||
        !String(exitDate).trim()
      ) {
        return res.status(400).json({
          status:
            "error",

          code:
            "EXIT_DATE_REQUIRED",

          message:
            "Exit effective date is required.",
        });
      }


      /*
      --------------------------------------------------------
      REQUIRED REASON
      --------------------------------------------------------
      */

      if (
        !reason ||
        !String(reason).trim()
      ) {
        return res.status(400).json({
          status:
            "error",

          code:
            "EXIT_REASON_REQUIRED",

          message:
            "A reason is required to process an employee exit.",
        });
      }


      /*
      --------------------------------------------------------
      DATE VALIDATION
      --------------------------------------------------------
      */

      const parsedExitDate =
        new Date(exitDate);

      if (
        Number.isNaN(
          parsedExitDate.getTime()
        )
      ) {
        return res.status(400).json({
          status:
            "error",

          code:
            "INVALID_EXIT_DATE",

          message:
            "The supplied exit effective date is invalid.",
        });
      }


      /*
      --------------------------------------------------------
      FUTURE DATE PROTECTION

      Exit changes the live employment status immediately and
      disables linked CHRIS access.

      Until CHRIS supports scheduled HR transactions, only
      today's date or an earlier effective date may be used.
      --------------------------------------------------------
      */

      const exitDateOnly =
        new Date(parsedExitDate);

      exitDateOnly.setHours(
        0,
        0,
        0,
        0
      );

      const today =
        new Date();

      today.setHours(
        0,
        0,
        0,
        0
      );

      if (
        exitDateOnly >
        today
      ) {
        return res.status(409).json({
          status:
            "error",

          code:
            "FUTURE_EXIT_NOT_SUPPORTED",

          message:
            "Future-dated employee exits are not yet supported. Select today or an earlier effective date.",
        });
      }


      /*
      --------------------------------------------------------
      LOAD CURRENT EMPLOYEE
      --------------------------------------------------------
      */

      const existingEmployee =
        await getEmployee(
          organizationId,
          employeeNumber
        );

      if (!existingEmployee) {
        return res.status(404).json({
          status:
            "error",

          code:
            "EMPLOYEE_NOT_FOUND",

          message:
            "Employee not found.",
        });
      }


      /*
      --------------------------------------------------------
      ALREADY EXITED PROTECTION
      --------------------------------------------------------
      */

      if (
        EXIT_STATUSES.includes(
          existingEmployee.status
        )
      ) {
        return res.status(409).json({
          status:
            "error",

          code:
            "EMPLOYEE_ALREADY_EXITED",

          message:
            "This employee has already been exited from employment.",
        });
      }


      /*
      --------------------------------------------------------
      SUSPENDED EMPLOYEE PROTECTION

      Suspension should first be resolved before a separate
      final exit transaction is processed.

      This preserves a clear and auditable lifecycle sequence.
      --------------------------------------------------------
      */

      if (
        existingEmployee.status ===
        "SUSPENDED"
      ) {
        return res.status(409).json({
          status:
            "error",

          code:
            "EMPLOYEE_SUSPENDED",

          message:
            "A suspended employee cannot be exited directly. Resolve the suspension first.",
        });
      }


      /*
      --------------------------------------------------------
      TRANSACTION
      --------------------------------------------------------
      */

      const employee =
        await prisma.$transaction(
          async (tx) => {

            /*
            ----------------------------------------------------
            LOAD CURRENT OPEN EMPLOYMENT EPISODE
            ----------------------------------------------------

            Exit must close the employee's current service period.
            There should be exactly one open episode.
            ----------------------------------------------------
            */

            const openEpisode =
              await tx.employeeEmploymentEpisode.findFirst({
                where: {
                  organizationId,

                  employeeId:
                    existingEmployee.id,

                  endDate:
                    null,
                },

                orderBy: {
                  sequenceNumber:
                    "desc",
                },
              });

            if (!openEpisode) {
              throw new Error(
                "OPEN_EMPLOYMENT_EPISODE_NOT_FOUND"
              );
            }

            if (
              parsedExitDate <
              openEpisode.startDate
            ) {
              throw new Error(
                "EXIT_BEFORE_EPISODE_START"
              );
            }


            /*
            ----------------------------------------------------
            UPDATE EMPLOYEE MASTER RECORD
            ----------------------------------------------------
            */

            const updatedEmployee =
              await tx.employee.update({
                where: {
                  id:
                    existingEmployee.id,
                },

                data: {
                  status:
                    exitStatus,

                  exitDate:
                    parsedExitDate,

                  /*
                  Any current suspension expiry is irrelevant
                  once employment has ended.
                  */

                  suspensionEndDate:
                    null,
                },

                include: {
                  department:
                    true,

                  designation:
                    true,

                  location:
                    true,

                  user: {
                    select: {
                      id:
                        true,

                      isActive:
                        true,
                    },
                  },
                },
              });


            /*
            ----------------------------------------------------
            DISABLE LINKED CHRIS ACCESS
            ----------------------------------------------------
            */

            if (
              existingEmployee.user
            ) {
              await tx.user.update({
                where: {
                  id:
                    existingEmployee.user.id,
                },

                data: {
                  isActive:
                    false,
                },
              });
            }


            /*
            ----------------------------------------------------
            CLOSE CURRENT EMPLOYMENT EPISODE
            ----------------------------------------------------
            */

            await tx.employeeEmploymentEpisode.update({
              where: {
                id:
                  openEpisode.id,
              },

              data: {
                endDate:
                  parsedExitDate,

                endStatus:
                  exitStatus,

                endDepartmentId:
                  existingEmployee.departmentId,

                endDesignationId:
                  existingEmployee.designationId,

                endLocationId:
                  existingEmployee.locationId,

                endReason:
                  String(reason).trim(),
              },
            });


            /*
            ----------------------------------------------------
            PERMANENT EMPLOYMENT LIFECYCLE RECORD
            ----------------------------------------------------
            */

            await tx.employeeLifecycleEvent.create({
              data: {
                organizationId,

                employeeId:
                  existingEmployee.id,

                eventType:
                  "EXITED",

                effectiveDate:
                  parsedExitDate,

                previousStatus:
                  existingEmployee.status,

                newStatus:
                  exitStatus,

                fromLocationId:
                  existingEmployee.locationId,

                toLocationId:
                  existingEmployee.locationId,

                previousDepartmentId:
                  existingEmployee.departmentId,

                newDepartmentId:
                  existingEmployee.departmentId,

                previousDesignationId:
                  existingEmployee.designationId,

                newDesignationId:
                  existingEmployee.designationId,

                reason:
                  String(reason).trim(),

                notes:
                  notes &&
                  String(notes).trim()
                    ? String(notes).trim()
                    : null,

                performedByUserId:
                  req.auth.userId ||
                  null,
              },
            });


            return updatedEmployee;
          }
        );


      /*
      --------------------------------------------------------
      SUCCESS RESPONSE
      --------------------------------------------------------
      */

      return res.status(200).json({
        status:
          "success",

        message:
          "Employee exit recorded successfully. Linked CHRIS access has been disabled.",

        data:
          employee,
      });
    } catch (error) {
      console.error(
        "Employee exit error:",
        error
      );

      if (
        error.message ===
        "OPEN_EMPLOYMENT_EPISODE_NOT_FOUND"
      ) {
        return res.status(409).json({
          status:
            "error",

          code:
            "OPEN_EMPLOYMENT_EPISODE_NOT_FOUND",

          message:
            "CHRIS could not find the employee's current open employment episode. Resolve the employment history before processing the exit.",
        });
      }

      if (
        error.message ===
        "EXIT_BEFORE_EPISODE_START"
      ) {
        return res.status(409).json({
          status:
            "error",

          code:
            "EXIT_BEFORE_EPISODE_START",

          message:
            "The exit effective date cannot be earlier than the start date of the current employment episode.",
        });
      }

      return res.status(500).json({
        status:
          "error",

        message:
          "Unable to process employee exit.",
      });
    }
  }
);

/*
============================================================
REACTIVATE EMPLOYEE
Permission: employees.update
============================================================

Reactivation:
- applies only to SUSPENDED or INACTIVE employees
- restores employee status to ACTIVE
- restores linked CHRIS access
- clears current suspensionEndDate
- records effective date
- records reason / notes
- preserves department, designation and location
- creates a permanent REACTIVATED lifecycle event

Exited employees are intentionally excluded.
Rehire remains a separate future process.
============================================================
*/

router.patch(
  "/:employeeNumber/reactivate",
  requirePermission(
    "employees.update"
  ),
  async (req, res) => {
    try {
      const organizationId =
        req.auth.organizationId;

      const {
        employeeNumber,
      } = req.params;

      const {
        effectiveDate,
        reason,
        notes,
      } = req.body || {};


      /*
      --------------------------------------------------------
      REQUIRED EFFECTIVE DATE
      --------------------------------------------------------
      */

      if (
        !effectiveDate ||
        !String(effectiveDate).trim()
      ) {
        return res.status(400).json({
          status: "error",

          code:
            "EFFECTIVE_DATE_REQUIRED",

          message:
            "A reactivation effective date is required.",
        });
      }


      /*
      --------------------------------------------------------
      REQUIRED REASON
      --------------------------------------------------------
      */

      if (
        !reason ||
        !String(reason).trim()
      ) {
        return res.status(400).json({
          status: "error",

          code:
            "REACTIVATION_REASON_REQUIRED",

          message:
            "A reason is required to reactivate an employee.",
        });
      }


      /*
      --------------------------------------------------------
      EFFECTIVE DATE VALIDATION
      --------------------------------------------------------
      */

      const parsedEffectiveDate =
        new Date(effectiveDate);

      if (
        Number.isNaN(
          parsedEffectiveDate.getTime()
        )
      ) {
        return res.status(400).json({
          status: "error",

          code:
            "INVALID_EFFECTIVE_DATE",

          message:
            "The supplied reactivation effective date is invalid.",
        });
      }


      /*
      --------------------------------------------------------
      FUTURE DATE PROTECTION

      Reactivation immediately changes the employee's live
      employment status and restores linked CHRIS access.

      Future-dated reactivation will require CHRIS'
      scheduled HR transaction engine.
      --------------------------------------------------------
      */

      const effectiveDateOnly =
        new Date(parsedEffectiveDate);

      effectiveDateOnly.setHours(
        0,
        0,
        0,
        0
      );

      const today =
        new Date();

      today.setHours(
        0,
        0,
        0,
        0
      );

      if (
        effectiveDateOnly >
        today
      ) {
        return res.status(409).json({
          status: "error",

          code:
            "FUTURE_REACTIVATION_NOT_SUPPORTED",

          message:
            "Future-dated employee reactivation is not yet supported. Select today or an earlier effective date.",
        });
      }


      /*
      --------------------------------------------------------
      LOAD CURRENT EMPLOYEE
      --------------------------------------------------------
      */

      const existingEmployee =
        await getEmployee(
          organizationId,
          employeeNumber
        );

      if (!existingEmployee) {
        return res.status(404).json({
          status: "error",

          code:
            "EMPLOYEE_NOT_FOUND",

          message:
            "Employee not found.",
        });
      }


      /*
      --------------------------------------------------------
      EXITED EMPLOYEE PROTECTION
      --------------------------------------------------------
      */

      if (
        EXIT_STATUSES.includes(
          existingEmployee.status
        )
      ) {
        return res.status(409).json({
          status: "error",

          code:
            "EMPLOYEE_EXITED",

          message:
            "Exited employees cannot be reactivated here. Use the future Rehire process.",
        });
      }


      /*
      --------------------------------------------------------
      REACTIVATION ELIGIBILITY

      Reactivation is distinct from:
      - Confirmation
      - Reinstatement
      - Rehire

      Only suspended or inactive employees may use this
      transaction.
      --------------------------------------------------------
      */

      if (
        ![
          "SUSPENDED",
          "INACTIVE",
        ].includes(
          existingEmployee.status
        )
      ) {
        return res.status(409).json({
          status: "error",

          code:
            "EMPLOYEE_NOT_REACTIVATABLE",

          message:
            "Only suspended or inactive employees can be reactivated.",
        });
      }


      /*
      --------------------------------------------------------
      TRANSACTION
      --------------------------------------------------------
      */

      const employee =
        await prisma.$transaction(
          async (tx) => {

            /*
            ----------------------------------------------------
            RESTORE EMPLOYEE
            ----------------------------------------------------
            */

            const updatedEmployee =
              await tx.employee.update({
                where: {
                  id:
                    existingEmployee.id,
                },

                data: {
                  status:
                    "ACTIVE",

                  /*
                  Current suspension period is no longer active.

                  Historical suspensionEndDate remains permanently
                  preserved on the earlier SUSPENDED lifecycle
                  event.
                  */

                  suspensionEndDate:
                    null,
                },

                include: {
                  department:
                    true,

                  designation:
                    true,

                  location:
                    true,

                  user: {
                    select: {
                      id:
                        true,

                      isActive:
                        true,
                    },
                  },
                },
              });


            /*
            ----------------------------------------------------
            RESTORE LINKED CHRIS ACCESS
            ----------------------------------------------------
            */

            if (
              existingEmployee.user
            ) {
              await tx.user.update({
                where: {
                  id:
                    existingEmployee.user.id,
                },

                data: {
                  isActive:
                    true,
                },
              });
            }


            /*
            ----------------------------------------------------
            PERMANENT EMPLOYMENT LIFECYCLE RECORD
            ----------------------------------------------------
            */

            await tx.employeeLifecycleEvent.create({
              data: {
                organizationId,

                employeeId:
                  existingEmployee.id,

                eventType:
                  "REACTIVATED",

                effectiveDate:
                  parsedEffectiveDate,

                previousStatus:
                  existingEmployee.status,

                newStatus:
                  "ACTIVE",

                /*
                Organizational assignment remains unchanged.
                */

                fromLocationId:
                  existingEmployee.locationId,

                toLocationId:
                  existingEmployee.locationId,

                previousDepartmentId:
                  existingEmployee.departmentId,

                newDepartmentId:
                  existingEmployee.departmentId,

                previousDesignationId:
                  existingEmployee.designationId,

                newDesignationId:
                  existingEmployee.designationId,

                reason:
                  String(reason).trim(),

                notes:
                  notes &&
                  String(notes).trim()
                    ? String(notes).trim()
                    : null,

                performedByUserId:
                  req.auth.userId ||
                  null,
              },
            });


            return updatedEmployee;
          }
        );


      /*
      --------------------------------------------------------
      SUCCESS RESPONSE
      --------------------------------------------------------
      */

      return res.status(200).json({
        status:
          "success",

        message:
          "Employee reactivated successfully. Linked CHRIS access has been restored.",

        data:
          employee,
      });
    } catch (error) {
      console.error(
        "Employee reactivation error:",
        error
      );

      return res.status(500).json({
        status:
          "error",

        message:
          "Unable to reactivate employee.",
      });
    }
  }
);

/*
============================================================
REINSTATE EMPLOYEE
Permission: employees.update
============================================================

Use this when an employee exit is reversed/cancelled and
the same employment relationship continues.

Allowed current statuses:
RESIGNED
TERMINATED
RETIRED

Expected body:

{
  "status": "ACTIVE",
  "effectiveDate": "2026-08-10",
  "reason": "Exit entered in error",
  "notes": "Optional notes"
}

Allowed restored statuses:
ACTIVE
PROBATION
============================================================
*/

router.patch(
  "/:employeeNumber/reinstate",
  requirePermission(
    "employees.update"
  ),
  async (req, res) => {
    try {
      const organizationId =
        req.auth.organizationId;

      const {
        employeeNumber,
      } = req.params;

      const {
        status = "ACTIVE",
        effectiveDate,
        reason,
        notes,
      } = req.body || {};

      if (
        ![
          "ACTIVE",
          "PROBATION",
        ].includes(status)
      ) {
        return res.status(400).json({
          status: "error",

          message:
            "Reinstated employee status must be Active or Probation.",
        });
      }

      const parsedEffectiveDate =
        effectiveDate
          ? new Date(
              effectiveDate
            )
          : new Date();

      if (
        Number.isNaN(
          parsedEffectiveDate.getTime()
        )
      ) {
        return res.status(400).json({
          status: "error",

          message:
            "Enter a valid reinstatement effective date.",
        });
      }

      const existingEmployee =
        await getEmployee(
          organizationId,
          employeeNumber
        );

      if (!existingEmployee) {
        return res.status(404).json({
          status: "error",

          message:
            "Employee not found.",
        });
      }

      if (
        !EXIT_STATUSES.includes(
          existingEmployee.status
        )
      ) {
        return res.status(400).json({
          status: "error",

          message:
            "Only resigned, terminated or retired employees can be reinstated.",
        });
      }

      const employee =
        await prisma.$transaction(
          async (tx) => {

            /*
            ----------------------------------------------------
            LOAD MOST RECENT EMPLOYMENT EPISODE
            ----------------------------------------------------

            Reinstatement reverses the exit and therefore reopens
            the same employment episode. It does NOT create a new
            service period.
            ----------------------------------------------------
            */

            const latestEpisode =
              await tx.employeeEmploymentEpisode.findFirst({
                where: {
                  organizationId,

                  employeeId:
                    existingEmployee.id,
                },

                orderBy: {
                  sequenceNumber:
                    "desc",
                },
              });

            if (!latestEpisode) {
              throw new Error(
                "EMPLOYMENT_EPISODE_NOT_FOUND"
              );
            }

            if (
              latestEpisode.endDate ===
              null
            ) {
              throw new Error(
                "EMPLOYMENT_EPISODE_ALREADY_OPEN"
              );
            }


            const updatedEmployee =
              await tx.employee.update({
                where: {
                  id:
                    existingEmployee.id,
                },

                data: {
                  status,

                  exitDate:
                    null,
                },

                include: {
                  department:
                    true,

                  designation:
                    true,

                  location:
                    true,

                  user: {
                    select: {
                      id:
                        true,

                      isActive:
                        true,
                    },
                  },
                },
              });

            /*
            Restore linked CHRIS access.
            */

            if (
              existingEmployee.user
            ) {
              await tx.user.update({
                where: {
                  id:
                    existingEmployee
                      .user.id,
                },

                data: {
                  isActive:
                    true,
                },
              });
            }

            /*
            Reopen the same employment episode.

            The historical exit itself remains permanently visible
            in EmployeeLifecycleEvent. Reinstatement removes the
            episode closure because the same service period continues.
            */

            await tx.employeeEmploymentEpisode.update({
              where: {
                id:
                  latestEpisode.id,
              },

              data: {
                endDate:
                  null,

                endStatus:
                  null,

                endDepartmentId:
                  null,

                endDesignationId:
                  null,

                endLocationId:
                  null,

                endReason:
                  null,
              },
            });


            /*
            Permanent lifecycle history.
            */

            await tx.employeeLifecycleEvent.create({
              data: {
                organizationId,

                employeeId:
                  existingEmployee.id,

                eventType:
                  "REINSTATED",

                effectiveDate:
                  parsedEffectiveDate,

                previousStatus:
                  existingEmployee.status,

                newStatus:
                  status,

                fromLocationId:
                  existingEmployee.locationId,

                toLocationId:
                  existingEmployee.locationId,

                reason:
                  reason?.trim() ||
                  null,

                notes:
                  notes?.trim() ||
                  null,

                performedByUserId:
                  req.auth.userId,
              },
            });

            return updatedEmployee;
          }
        );

      return res.status(200).json({
        status:
          "success",

        message:
          "Employee reinstated successfully. Exit date cleared and linked CHRIS access restored.",

        data:
          employee,
      });
    } catch (error) {
      console.error(
        "Employee reinstatement error:",
        error
      );

      if (
        error.message ===
        "EMPLOYMENT_EPISODE_NOT_FOUND"
      ) {
        return res.status(409).json({
          status:
            "error",

          code:
            "EMPLOYMENT_EPISODE_NOT_FOUND",

          message:
            "CHRIS could not find an employment episode for this employee. Resolve the employment history before reinstatement.",
        });
      }

      if (
        error.message ===
        "EMPLOYMENT_EPISODE_ALREADY_OPEN"
      ) {
        return res.status(409).json({
          status:
            "error",

          code:
            "EMPLOYMENT_EPISODE_ALREADY_OPEN",

          message:
            "The employee's latest employment episode is already open and cannot be reinstated again.",
        });
      }

      return res.status(500).json({
        status:
          "error",

        message:
          "Unable to reinstate employee.",
      });
    }
  }
);
/*
============================================================
REHIRE EMPLOYEE
Permission: employees.update
============================================================

Use this when a former employee starts a NEW employment
relationship after a completed exit.

Business rules:
- only RESIGNED, TERMINATED or RETIRED employees are eligible
- the employee keeps the same permanent CHR Employee ID
- the previous employment episode remains closed
- a NEW employment episode is created using sequenceNumber + 1
- Department, Designation and Location must be active and belong
  to the authenticated organization
- Designation must be mapped to the selected Department
- linked CHRIS access is restored
- a permanent REHIRED lifecycle event is created

Expected body:

{
  "status": "ACTIVE",
  "effectiveDate": "2026-08-16",
  "departmentId": "department-id",
  "designationId": "designation-id",
  "locationId": "location-id",
  "reason": "Returning employee",
  "notes": "Optional HR notes"
}

Allowed starting statuses:
ACTIVE
PROBATION
============================================================
*/

router.patch(
  "/:employeeNumber/rehire",
  requirePermission(
    "employees.update"
  ),
  async (req, res) => {
    try {
      const organizationId =
        req.auth.organizationId;

      const {
        employeeNumber,
      } = req.params;

      const {
        status = "ACTIVE",
        effectiveDate,
        departmentId,
        designationId,
        locationId,
        reason,
        notes,
      } = req.body || {};


      /*
      --------------------------------------------------------
      REQUIRED FIELDS
      --------------------------------------------------------
      */

      if (
        ![
          "ACTIVE",
          "PROBATION",
        ].includes(status)
      ) {
        return res.status(400).json({
          status:
            "error",

          code:
            "INVALID_REHIRE_STATUS",

          message:
            "Rehired employee status must be Active or Probation.",
        });
      }

      if (
        !effectiveDate ||
        !String(effectiveDate).trim()
      ) {
        return res.status(400).json({
          status:
            "error",

          code:
            "REHIRE_EFFECTIVE_DATE_REQUIRED",

          message:
            "A rehire effective date is required.",
        });
      }

      if (
        !departmentId ||
        !String(departmentId).trim()
      ) {
        return res.status(400).json({
          status:
            "error",

          code:
            "REHIRE_DEPARTMENT_REQUIRED",

          message:
            "Select the employee's department for the new employment episode.",
        });
      }

      if (
        !designationId ||
        !String(designationId).trim()
      ) {
        return res.status(400).json({
          status:
            "error",

          code:
            "REHIRE_DESIGNATION_REQUIRED",

          message:
            "Select the employee's designation for the new employment episode.",
        });
      }

      if (
        !locationId ||
        !String(locationId).trim()
      ) {
        return res.status(400).json({
          status:
            "error",

          code:
            "REHIRE_LOCATION_REQUIRED",

          message:
            "Select the employee's work location for the new employment episode.",
        });
      }

      const normalizedReason =
        String(
          reason || ""
        ).trim();

      if (!normalizedReason) {
        return res.status(400).json({
          status:
            "error",

          code:
            "REHIRE_REASON_REQUIRED",

          message:
            "A reason is required to rehire an employee.",
        });
      }


      /*
      --------------------------------------------------------
      EFFECTIVE DATE VALIDATION
      --------------------------------------------------------
      */

      const parsedEffectiveDate =
        new Date(
          effectiveDate
        );

      if (
        Number.isNaN(
          parsedEffectiveDate.getTime()
        )
      ) {
        return res.status(400).json({
          status:
            "error",

          code:
            "INVALID_REHIRE_EFFECTIVE_DATE",

          message:
            "The supplied rehire effective date is invalid.",
        });
      }

      const effectiveDateOnly =
        new Date(
          parsedEffectiveDate
        );

      effectiveDateOnly.setHours(
        0,
        0,
        0,
        0
      );

      const today =
        new Date();

      today.setHours(
        0,
        0,
        0,
        0
      );

      if (
        effectiveDateOnly >
        today
      ) {
        return res.status(409).json({
          status:
            "error",

          code:
            "FUTURE_REHIRE_NOT_SUPPORTED",

          message:
            "Future-dated rehire is not yet supported. Select today or an earlier effective date.",
        });
      }


      /*
      --------------------------------------------------------
      LOAD FORMER EMPLOYEE
      --------------------------------------------------------
      */

      const existingEmployee =
        await getEmployee(
          organizationId,
          employeeNumber
        );

      if (!existingEmployee) {
        return res.status(404).json({
          status:
            "error",

          code:
            "EMPLOYEE_NOT_FOUND",

          message:
            "Employee not found.",
        });
      }

      if (
        !REHIRE_STATUSES.includes(
          existingEmployee.status
        ) ||
        !existingEmployee.exitDate
      ) {
        return res.status(409).json({
          status:
            "error",

          code:
            "EMPLOYEE_NOT_ELIGIBLE_FOR_REHIRE",

          message:
            "Only employees with a completed exit can be rehired.",
        });
      }


      /*
      --------------------------------------------------------
      VALIDATE DEPARTMENT
      --------------------------------------------------------
      */

      const departmentRecord =
        await prisma.department.findFirst({
          where: {
            id:
              String(
                departmentId
              ).trim(),

            organizationId,

            isActive:
              true,
          },

          select: {
            id:
              true,

            name:
              true,

            code:
              true,

            isActive:
              true,
          },
        });

      if (!departmentRecord) {
        return res.status(400).json({
          status:
            "error",

          code:
            "INVALID_REHIRE_DEPARTMENT",

          message:
            "Select an active department from your organization's CHRIS structure.",
        });
      }


      /*
      --------------------------------------------------------
      VALIDATE DESIGNATION + DEPARTMENT MAPPING
      --------------------------------------------------------
      */

      const designationRecord =
        await prisma.designation.findFirst({
          where: {
            id:
              String(
                designationId
              ).trim(),

            organizationId,

            departmentId:
              departmentRecord.id,

            isActive:
              true,
          },

          select: {
            id:
              true,

            name:
              true,

            code:
              true,

            departmentId:
              true,

            isActive:
              true,
          },
        });

      if (!designationRecord) {
        return res.status(400).json({
          status:
            "error",

          code:
            "INVALID_REHIRE_DESIGNATION",

          message:
            "Select an active designation mapped to the selected department.",
        });
      }


      /*
      --------------------------------------------------------
      VALIDATE WORK LOCATION
      --------------------------------------------------------
      */

      const locationRecord =
        await prisma.organizationLocation.findFirst({
          where: {
            id:
              String(
                locationId
              ).trim(),

            organizationId,

            isActive:
              true,
          },

          select: {
            id:
              true,

            name:
              true,

            code:
              true,

            type:
              true,

            city:
              true,

            state:
              true,

            country:
              true,

            isActive:
              true,
          },
        });

      if (!locationRecord) {
        return res.status(400).json({
          status:
            "error",

          code:
            "INVALID_REHIRE_LOCATION",

          message:
            "Select an active work location from your organization's CHRIS location catalogue.",
        });
      }


      /*
      --------------------------------------------------------
      REHIRE TRANSACTION
      --------------------------------------------------------
      */

      const result =
        await prisma.$transaction(
          async (tx) => {

            /*
            ----------------------------------------------------
            LOAD THE MOST RECENT EMPLOYMENT EPISODE
            ----------------------------------------------------

            Rehire must start a new service period. The immediately
            preceding episode must therefore already be closed.
            ----------------------------------------------------
            */

            const latestEpisode =
              await tx.employeeEmploymentEpisode.findFirst({
                where: {
                  organizationId,

                  employeeId:
                    existingEmployee.id,
                },

                orderBy: {
                  sequenceNumber:
                    "desc",
                },
              });

            if (!latestEpisode) {
              throw new Error(
                "EMPLOYMENT_EPISODE_NOT_FOUND"
              );
            }

            if (
              latestEpisode.endDate ===
              null
            ) {
              throw new Error(
                "EMPLOYMENT_EPISODE_ALREADY_OPEN"
              );
            }

            if (
              parsedEffectiveDate <
              latestEpisode.endDate
            ) {
              throw new Error(
                "REHIRE_BEFORE_PREVIOUS_EPISODE_END"
              );
            }

            const nextSequenceNumber =
              latestEpisode.sequenceNumber +
              1;


            /*
            ----------------------------------------------------
            RESTORE EMPLOYEE MASTER RECORD
            ----------------------------------------------------

            Employee.employeeNumber is deliberately untouched.
            The permanent CHR identity is retained.
            ----------------------------------------------------
            */

            const updatedEmployee =
              await tx.employee.update({
                where: {
                  id:
                    existingEmployee.id,
                },

                data: {
                  departmentId:
                    departmentRecord.id,

                  designationId:
                    designationRecord.id,

                  locationId:
                    locationRecord.id,

                  status,

                  hireDate:
                    parsedEffectiveDate,

                  confirmationDate:
                    null,

                  exitDate:
                    null,

                  suspensionEndDate:
                    null,
                },

                include: {
                  department:
                    true,

                  designation:
                    true,

                  location:
                    true,

                  user: {
                    select: {
                      id:
                        true,

                      isActive:
                        true,
                    },
                  },
                },
              });


            /*
            ----------------------------------------------------
            RESTORE LINKED CHRIS ACCESS
            ----------------------------------------------------
            */

            if (
              existingEmployee.user
            ) {
              await tx.user.update({
                where: {
                  id:
                    existingEmployee.user.id,
                },

                data: {
                  isActive:
                    true,
                },
              });
            }


            /*
            ----------------------------------------------------
            CREATE THE NEW EMPLOYMENT EPISODE
            ----------------------------------------------------
            */

            const employmentEpisode =
              await tx.employeeEmploymentEpisode.create({
                data: {
                  organizationId,

                  employeeId:
                    existingEmployee.id,

                  sequenceNumber:
                    nextSequenceNumber,

                  startDate:
                    parsedEffectiveDate,

                  startStatus:
                    status,

                  startDepartmentId:
                    departmentRecord.id,

                  startDesignationId:
                    designationRecord.id,

                  startLocationId:
                    locationRecord.id,

                  startReason:
                    normalizedReason,
                },
              });


            /*
            ----------------------------------------------------
            PERMANENT REHIRE LIFECYCLE EVENT
            ----------------------------------------------------
            */

            await tx.employeeLifecycleEvent.create({
              data: {
                organizationId,

                employeeId:
                  existingEmployee.id,

                eventType:
                  "REHIRED",

                effectiveDate:
                  parsedEffectiveDate,

                previousStatus:
                  existingEmployee.status,

                newStatus:
                  status,

                fromLocationId:
                  existingEmployee.locationId,

                toLocationId:
                  locationRecord.id,

                previousDepartmentId:
                  existingEmployee.departmentId,

                newDepartmentId:
                  departmentRecord.id,

                previousDesignationId:
                  existingEmployee.designationId,

                newDesignationId:
                  designationRecord.id,

                reason:
                  normalizedReason,

                notes:
                  notes &&
                  String(notes).trim()
                    ? String(notes).trim()
                    : null,

                performedByUserId:
                  req.auth.userId ||
                  null,
              },
            });


            return {
              employee:
                updatedEmployee,

              employmentEpisode,
            };
          }
        );


      return res.status(200).json({
        status:
          "success",

        message:
          `Employee rehired successfully under permanent Employee ID ${result.employee.employeeNumber}. Employment Episode ${result.employmentEpisode.sequenceNumber} has been opened.`,

        data:
          result.employee,

        employmentEpisode:
          result.employmentEpisode,
      });
    } catch (error) {
      console.error(
        "Employee rehire error:",
        error
      );

      if (
        error.message ===
        "EMPLOYMENT_EPISODE_NOT_FOUND"
      ) {
        return res.status(409).json({
          status:
            "error",

          code:
            "EMPLOYMENT_EPISODE_NOT_FOUND",

          message:
            "CHRIS could not find the employee's previous employment episode. Resolve the employment history before rehire.",
        });
      }

      if (
        error.message ===
        "EMPLOYMENT_EPISODE_ALREADY_OPEN"
      ) {
        return res.status(409).json({
          status:
            "error",

          code:
            "EMPLOYMENT_EPISODE_ALREADY_OPEN",

          message:
            "The employee already has an open employment episode and cannot be rehired again.",
        });
      }

      if (
        error.message ===
        "REHIRE_BEFORE_PREVIOUS_EPISODE_END"
      ) {
        return res.status(409).json({
          status:
            "error",

          code:
            "REHIRE_BEFORE_PREVIOUS_EPISODE_END",

          message:
            "The rehire effective date cannot be earlier than the end date of the employee's previous employment episode.",
        });
      }

      if (
        error.code ===
        "P2002"
      ) {
        return res.status(409).json({
          status:
            "error",

          code:
            "REHIRE_EPISODE_CONFLICT",

          message:
            "CHRIS detected an employment episode sequence conflict. Refresh the employee record and try again.",
        });
      }

      return res.status(500).json({
        status:
          "error",

        message:
          "Unable to rehire employee.",
      });
    }
  }
);
/*
============================================================
TRANSFER EMPLOYEE
Permission: employees.update
============================================================

Expected body:

{
  "locationId": "destination-location-id",
  "effectiveDate": "2026-08-10",
  "reason": "Operational transfer",
  "notes": "Optional notes"
}

This transaction:
- validates destination location
- updates Employee.locationId
- records permanent TRANSFERRED lifecycle history
============================================================
*/

/*
============================================================
PROMOTE / CHANGE EMPLOYEE JOB
Permission: employees.update
============================================================

Expected body:

{
  "department": "Human Resources",
  "designation": "HR Manager",
  "effectiveDate": "2026-08-10",
  "reason": "Performance-based promotion",
  "notes": "Optional HR notes"
}

Rules:

- Employee must still be in employment.
- Suspended and inactive employees cannot be promoted.
- Department may remain unchanged.
- Designation is required.
- Department/designation records are organization-scoped.
- Employee update and lifecycle history are transactional.
============================================================
*/

/*
============================================================
ORGANIZATION DEPARTMENT CATALOG
Permission: employees.view
============================================================

Tenant scoped through req.auth.organizationId.

GET /api/employees/career/departments
============================================================
*/

router.get(
  "/career/departments",
  requirePermission(
    "employees.view"
  ),
  async (req, res) => {
    try {
      const organizationId =
        req.auth.organizationId;

      const departments =
        await prisma.department.findMany({
          where: {
            organizationId,
          },

          select: {
            id: true,
            name: true,
            code: true,
            description: true,
            isActive: true,

            _count: {
              select: {
                designations:
                  true,

                employees:
                  true,
              },
            },
          },

          orderBy: [
            {
              isActive:
                "desc",
            },
            {
              name:
                "asc",
            },
          ],
        });

      return res.status(200).json({
        status:
          "success",

        results:
          departments.length,

        data:
          departments,
      });
    } catch (error) {
      console.error(
        "Department catalog fetch error:",
        error
      );

      return res.status(500).json({
        status:
          "error",

        message:
          "Unable to load the organization department catalog.",
      });
    }
  }
);


/*
============================================================
CREATE ORGANIZATION DEPARTMENT
Permission: employees.update

POST /api/employees/career/departments
============================================================
*/

router.post(
  "/career/departments",
  requirePermission(
    "employees.update"
  ),
  async (req, res) => {
    try {
      const organizationId =
        req.auth.organizationId;

      const {
        name,
        code,
        description,
      } = req.body || {};

      const normalizedName =
        String(
          name || ""
        ).trim();

      const normalizedCode =
        String(
          code || ""
        ).trim() ||
        null;

      const normalizedDescription =
        String(
          description || ""
        ).trim() ||
        null;


      if (
        !normalizedName
      ) {
        return res.status(400).json({
          status:
            "error",

          message:
            "Department name is required.",
        });
      }


      const existingDepartment =
        await prisma.department.findFirst({
          where: {
            organizationId,

            OR: [
              {
                name: {
                  equals:
                    normalizedName,

                  mode:
                    "insensitive",
                },
              },

              ...(normalizedCode
                ? [
                    {
                      code: {
                        equals:
                          normalizedCode,

                        mode:
                          "insensitive",
                      },
                    },
                  ]
                : []),
            ],
          },
        });


      if (
        existingDepartment
      ) {
        return res.status(409).json({
          status:
            "error",

          message:
            "A department with the same name or code already exists.",
        });
      }


      const department =
        await prisma.department.create({
          data: {
            organizationId,

            name:
              normalizedName,

            code:
              normalizedCode,

            description:
              normalizedDescription,

            isActive:
              true,
          },
        });


      return res.status(201).json({
        status:
          "success",

        message:
          "Department created successfully.",

        data:
          department,
      });
    } catch (error) {
      console.error(
        "Department creation error:",
        error
      );

      if (
        error.code ===
        "P2002"
      ) {
        return res.status(409).json({
          status:
            "error",

          message:
            "The department name or code is already in use.",
        });
      }

      return res.status(500).json({
        status:
          "error",

        message:
          "Unable to create department.",
      });
    }
  }
);


/*
============================================================
UPDATE ORGANIZATION DEPARTMENT
Permission: employees.update

PATCH /api/employees/career/departments/:departmentId
============================================================
*/

router.patch(
  "/career/departments/:departmentId",
  requirePermission(
    "employees.update"
  ),
  async (req, res) => {
    try {
      const organizationId =
        req.auth.organizationId;

      const {
        departmentId,
      } = req.params;

      const {
        name,
        code,
        description,
        isActive,
      } = req.body || {};


      const existing =
        await prisma.department.findFirst({
          where: {
            id:
              departmentId,

            organizationId,
          },
        });


      if (
        !existing
      ) {
        return res.status(404).json({
          status:
            "error",

          message:
            "Department not found.",
        });
      }


      const normalizedName =
        name !== undefined
          ? String(
              name || ""
            ).trim()
          : existing.name;


      if (
        !normalizedName
      ) {
        return res.status(400).json({
          status:
            "error",

          message:
            "Department name is required.",
        });
      }


      const normalizedCode =
        code !== undefined
          ? String(
              code || ""
            ).trim() ||
            null
          : existing.code;


      const normalizedDescription =
        description !== undefined
          ? String(
              description || ""
            ).trim() ||
            null
          : existing.description;


      const duplicate =
        await prisma.department.findFirst({
          where: {
            organizationId,

            NOT: {
              id:
                existing.id,
            },

            OR: [
              {
                name: {
                  equals:
                    normalizedName,

                  mode:
                    "insensitive",
                },
              },

              ...(normalizedCode
                ? [
                    {
                      code: {
                        equals:
                          normalizedCode,

                        mode:
                          "insensitive",
                      },
                    },
                  ]
                : []),
            ],
          },
        });


      if (
        duplicate
      ) {
        return res.status(409).json({
          status:
            "error",

          message:
            "Another department already uses the submitted name or code.",
        });
      }


      const department =
        await prisma.department.update({
          where: {
            id:
              existing.id,
          },

          data: {
            name:
              normalizedName,

            code:
              normalizedCode,

            description:
              normalizedDescription,

            isActive:
              typeof isActive ===
              "boolean"
                ? isActive
                : existing.isActive,
          },
        });


      return res.status(200).json({
        status:
          "success",

        message:
          "Department updated successfully.",

        data:
          department,
      });
    } catch (error) {
      console.error(
        "Department update error:",
        error
      );

      return res.status(500).json({
        status:
          "error",

        message:
          "Unable to update department.",
      });
    }
  }
);


/*
============================================================
CREATE DEPARTMENT DESIGNATION
Permission: employees.update

POST /api/employees/career/designations

A designation is created inside the authenticated
organization and linked to one of that organization's
departments.
============================================================
*/

router.post(
  "/career/designations",
  requirePermission(
    "employees.update"
  ),
  async (req, res) => {
    try {
      const organizationId =
        req.auth.organizationId;

      const {
        departmentId,
        name,
        code,
        description,
      } = req.body || {};


      const normalizedDepartmentId =
        String(
          departmentId || ""
        ).trim();

      const normalizedName =
        String(
          name || ""
        ).trim();

      const normalizedCode =
        String(
          code || ""
        ).trim() ||
        null;

      const normalizedDescription =
        String(
          description || ""
        ).trim() ||
        null;


      if (
        !normalizedDepartmentId
      ) {
        return res.status(400).json({
          status:
            "error",

          message:
            "Select a department.",
        });
      }


      if (
        !normalizedName
      ) {
        return res.status(400).json({
          status:
            "error",

          message:
            "Designation name is required.",
        });
      }


      const department =
        await prisma.department.findFirst({
          where: {
            id:
              normalizedDepartmentId,

            organizationId,

            isActive:
              true,
          },
        });


      if (
        !department
      ) {
        return res.status(404).json({
          status:
            "error",

          message:
            "The selected department is unavailable.",
        });
      }


      /*
      Current Prisma schema still has organization-wide
      designation-name/code uniqueness.

      We intentionally respect it until Employee Create/Edit
      is converted from free-text upsert to controlled
      Department -> Designation selection.
      */

      const duplicate =
        await prisma.designation.findFirst({
          where: {
            organizationId,

            OR: [
              {
                name: {
                  equals:
                    normalizedName,

                  mode:
                    "insensitive",
                },
              },

              ...(normalizedCode
                ? [
                    {
                      code: {
                        equals:
                          normalizedCode,

                        mode:
                          "insensitive",
                      },
                    },
                  ]
                : []),
            ],
          },
        });


      if (
        duplicate
      ) {
        return res.status(409).json({
          status:
            "error",

          message:
            "A designation with this name or code already exists in the organization.",
        });
      }


      const designation =
        await prisma.designation.create({
          data: {
            organizationId,

            departmentId:
              department.id,

            name:
              normalizedName,

            code:
              normalizedCode,

            description:
              normalizedDescription,

            isActive:
              true,
          },

          include: {
            department: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        });


      return res.status(201).json({
        status:
          "success",

        message:
          "Designation created successfully.",

        data:
          designation,
      });
    } catch (error) {
      console.error(
        "Designation creation error:",
        error
      );

      if (
        error.code ===
        "P2002"
      ) {
        return res.status(409).json({
          status:
            "error",

          message:
            "The designation name or code is already in use.",
        });
      }

      return res.status(500).json({
        status:
          "error",

        message:
          "Unable to create designation.",
      });
    }
  }
);

/*
============================================================
MAP EXISTING DESIGNATIONS TO DEPARTMENT
Permission: employees.update

PATCH /api/employees/career/designations/map-department

Expected body:

{
  "departmentId": "department-id",
  "designationIds": [
    "designation-id-1",
    "designation-id-2"
  ]
}

This migration/configuration action:

- remains organization scoped
- preserves careerTrack
- preserves careerLevel
- preserves reportsToDesignationId
- preserves lifecycle history
- does not recreate designation records
============================================================
*/

router.patch(
  "/career/designations/map-department",
  requirePermission(
    "employees.update"
  ),
  async (req, res) => {
    try {
      const organizationId =
        req.auth.organizationId;

      const {
        departmentId,
        designationIds,
      } = req.body || {};


      /*
      ----------------------------------------------------------
      NORMALIZE INPUT
      ----------------------------------------------------------
      */

      const normalizedDepartmentId =
        String(
          departmentId || ""
        ).trim();


      const normalizedDesignationIds =
        Array.from(
          new Set(
            (
              Array.isArray(
                designationIds
              )
                ? designationIds
                : []
            )
              .map(
                (id) =>
                  String(
                    id || ""
                  ).trim()
              )
              .filter(Boolean)
          )
        );


      if (
        !normalizedDepartmentId
      ) {
        return res.status(400).json({
          status:
            "error",

          message:
            "Select the department that should own these designations.",
        });
      }


      if (
        normalizedDesignationIds.length ===
        0
      ) {
        return res.status(400).json({
          status:
            "error",

          message:
            "Select at least one existing designation to map.",
        });
      }


            /*
      ----------------------------------------------------------
      VALIDATE DEPARTMENT
      ----------------------------------------------------------
      */

      const department =
        await prisma.department.findFirst({
          where: {
            id:
              normalizedDepartmentId,

            organizationId,

            isActive:
              true,
          },

          select: {
            id: true,
            name: true,
            code: true,
          },
        });


      if (
        !department
      ) {
        return res.status(404).json({
          status:
            "error",

          message:
            "The selected department was not found or is inactive.",
        });
      }


      /*
      ----------------------------------------------------------
      LOAD DESIGNATIONS
      ----------------------------------------------------------
      */

      const designations =
        await prisma.designation.findMany({
          where: {
            organizationId,

            id: {
              in:
                normalizedDesignationIds,
            },
          },

          select: {
            id: true,
            name: true,
            departmentId: true,
            careerTrack: true,
            careerLevel: true,
            reportsToDesignationId:
              true,
          },
        });


      if (
        designations.length !==
        normalizedDesignationIds.length
      ) {
        return res.status(404).json({
          status:
            "error",

          message:
            "One or more selected designations were not found in this organization.",
        });
      }


      /*
      ----------------------------------------------------------
      PROTECT EXISTING DEPARTMENT OWNERSHIP
      ----------------------------------------------------------

      This mapper is designed primarily for unmapped legacy
      designations.

      A designation already belonging to ANOTHER department
      must not silently move through this migration action.
      ----------------------------------------------------------
      */

      const conflictingDesignations =
        designations.filter(
          (designation) =>
            designation.departmentId &&
            designation.departmentId !==
              department.id
        );


      if (
        conflictingDesignations.length >
        0
      ) {
        return res.status(409).json({
          status:
            "error",

          message:
            `The following designation(s) already belong to another department: ${conflictingDesignations
              .map(
                (designation) =>
                  designation.name
              )
              .join(", ")}.`,
        });
      }


      /*
      ----------------------------------------------------------
      MAP TRANSACTIONALLY
      ----------------------------------------------------------
      */

      await prisma.$transaction(
        normalizedDesignationIds.map(
          (designationId) =>
            prisma.designation.update({
              where: {
                id:
                  designationId,
              },

              data: {
                departmentId:
                  department.id,
              },
            })
        )
      );


      /*
      ----------------------------------------------------------
      RETURN UPDATED RECORDS
      ----------------------------------------------------------
      */

      const updatedDesignations =
        await prisma.designation.findMany({
          where: {
            organizationId,

            id: {
              in:
                normalizedDesignationIds,
            },
          },

          select: {
            id: true,
            name: true,
            code: true,
            description: true,
            isActive: true,
            departmentId: true,
            careerTrack: true,
            careerLevel: true,
            reportsToDesignationId:
              true,

            department: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },

            reportsToDesignation: {
              select: {
                id: true,
                name: true,
                code: true,
                careerTrack: true,
                careerLevel: true,
              },
            },
          },

          orderBy: [
            {
              careerLevel:
                "asc",
            },

            {
              name:
                "asc",
            },
          ],
        });


      return res.status(200).json({
        status:
          "success",

        message:
          `${updatedDesignations.length} designation(s) mapped to ${department.name} successfully.`,

        results:
          updatedDesignations.length,

        department,

        data:
          updatedDesignations,
      });
    } catch (error) {
      console.error(
        "Designation department mapping error:",
        error
      );

      return res.status(500).json({
        status:
          "error",

        message:
          "Unable to map the selected designations to the department.",
      });
    }
  }
);

/*
============================================================
CONTROLLED DESIGNATION DEPARTMENT UNMAP
Permission: employees.update

PATCH
/api/employees/career/designations/:designationId/unmap

Purpose:
- Remove a designation from its current department.
- Do NOT delete the designation.
- Do NOT deactivate the designation.
- Preserve code, career track, career level and history.
- Preserve designation ID.
- Prevent unsafe unmapping while current employees or
  dependent reporting positions still rely on the designation.
============================================================
*/

router.patch(
  "/career/designations/:designationId/unmap",
  requirePermission(
    "employees.update"
  ),
  async (req, res) => {
    try {
      const organizationId =
        req.auth.organizationId;

      const {
        designationId,
      } = req.params;


      /*
      ----------------------------------------------------------
      LOAD TENANT-SCOPED DESIGNATION
      ----------------------------------------------------------
      */

      const designation =
        await prisma.designation.findFirst({
          where: {
            id:
              designationId,

            organizationId,
          },

          select: {
            id: true,
            name: true,
            code: true,
            departmentId: true,
            careerTrack: true,
            careerLevel: true,
            reportsToDesignationId:
              true,
            isActive: true,

            department: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        });


      if (
        !designation
      ) {
        return res.status(404).json({
          status:
            "error",

          message:
            "Designation not found.",
        });
      }


      /*
      ----------------------------------------------------------
      IDEMPOTENT BEHAVIOUR
      ----------------------------------------------------------
      */

      if (
        !designation.departmentId
      ) {
        return res.status(200).json({
          status:
            "success",

          message:
            `${designation.name} is already unmapped.`,

          data:
            designation,
        });
      }


      /*
      ----------------------------------------------------------
      CHECK CURRENT EMPLOYEE DEPENDENCIES
      ----------------------------------------------------------

      EXIT_STATUSES already represents employees who are no
      longer in active employment for CHRIS lifecycle rules.

      Suspended/current employees still remain organisationally
      assigned and therefore prevent unmapping.
      ----------------------------------------------------------
      */

      const assignedEmployeeCount =
        await prisma.employee.count({
          where: {
            organizationId,

            designationId:
              designation.id,

            status: {
              notIn:
                EXIT_STATUSES,
            },
          },
        });


      if (
        assignedEmployeeCount >
        0
      ) {
        return res.status(409).json({
          status:
            "error",

          code:
            "DESIGNATION_HAS_CURRENT_EMPLOYEES",

          message:
            `${designation.name} cannot be unmapped because ${assignedEmployeeCount} current employee(s) are assigned to it. Transfer or reassign those employees first.`,

          dependencies: {
            employees:
              assignedEmployeeCount,
          },
        });
      }


      /*
      ----------------------------------------------------------
      CHECK REPORTING-HIERARCHY DEPENDENCIES
      ----------------------------------------------------------

      A position cannot be removed from its department while
      other designation(s) still report directly to it.
      ----------------------------------------------------------
      */

      const dependentDesignations =
        await prisma.designation.findMany({
          where: {
            organizationId,

            reportsToDesignationId:
              designation.id,
          },

          select: {
            id: true,
            name: true,
            code: true,
            departmentId: true,
            careerTrack: true,
            careerLevel: true,
          },

          orderBy: {
            name:
              "asc",
          },
        });


      if (
        dependentDesignations.length >
        0
      ) {
        return res.status(409).json({
          status:
            "error",

          code:
            "DESIGNATION_HAS_REPORTING_DEPENDENCIES",

          message:
            `${designation.name} cannot be unmapped because ${dependentDesignations.length} designation(s) currently report to it. Update the reporting hierarchy first.`,

          dependencies: {
            designations:
              dependentDesignations,
          },
        });
      }


      /*
      ----------------------------------------------------------
      UNMAP ONLY
      ----------------------------------------------------------

      Intentionally preserved:
      - designation ID
      - name
      - code
      - isActive
      - careerTrack
      - careerLevel
      - reportsToDesignationId
      - employee lifecycle history

      Only department ownership is removed.
      ----------------------------------------------------------
      */

      const previousDepartment =
        designation.department;


      const updatedDesignation =
        await prisma.designation.update({
          where: {
            id:
              designation.id,
          },

          data: {
            departmentId:
              null,
          },

          select: {
            id: true,
            name: true,
            code: true,
            description: true,
            departmentId: true,
            careerTrack: true,
            careerLevel: true,
            reportsToDesignationId:
              true,
            isActive: true,

            department: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },

            reportsToDesignation: {
              select: {
                id: true,
                name: true,
                code: true,
                careerTrack: true,
                careerLevel: true,
              },
            },
          },
        });


      return res.status(200).json({
        status:
          "success",

        message:
          `${designation.name} was unmapped from ${previousDepartment?.name || "its department"} successfully.`,

        previousDepartment,

        data:
          updatedDesignation,
      });
    } catch (error) {
      console.error(
        "Designation unmap error:",
        error
      );


      return res.status(500).json({
        status:
          "error",

        message:
          "Unable to unmap the designation.",
      });
    }
  }
);

/*
============================================================
CHRIS CAREER STRUCTURE TEMPLATE LIBRARY
Permission: employees.view

GET /api/employees/career/templates
============================================================
*/

router.get(
  "/career/templates",
  requirePermission(
    "employees.view"
  ),
  async (req, res) => {
    const data =
      CAREER_STRUCTURE_TEMPLATES.map(
        (template) => ({
          key:
            template.key,

          name:
            template.name,

          code:
            template.code,

          aliases:
            template.aliases,

          careerTrack:
            template.careerTrack,

          description:
            template.description,

          positions:
            template.positions.map(
              (
                position,
                index
              ) => ({
                ...position,

                reportsTo:
                  template.positions[
                    index + 1
                  ]?.name ||
                  null,
              })
            ),
        })
      );


    return res.status(200).json({
      status:
        "success",

      results:
        data.length,

      data,
    });
  }
);


/*
============================================================
APPLY CHRIS RECOMMENDED CAREER STRUCTURE
Permission: employees.update

POST /api/employees/career/templates/:templateKey/apply

Body:
{
  "departmentId": "department-id"
}

Important:
- Template data is copied into the authenticated organization.
- The template itself is never modified.
- Existing compatible designations are reused.
- Existing lifecycle history is preserved.
============================================================
*/

router.post(
  "/career/templates/:templateKey/apply",
  requirePermission(
    "employees.update"
  ),
  async (req, res) => {
    try {
      const organizationId =
        req.auth.organizationId;

      const {
        templateKey,
      } = req.params;

      const {
        departmentId,
      } = req.body || {};


      const template =
        getCareerStructureTemplate(
          templateKey
        );


      if (
        !template
      ) {
        return res.status(404).json({
          status:
            "error",

          message:
            "The selected CHRIS career template does not exist.",
        });
      }


      const normalizedDepartmentId =
        String(
          departmentId || ""
        ).trim();


      if (
        !normalizedDepartmentId
      ) {
        return res.status(400).json({
          status:
            "error",

          message:
            "Select the department that should receive this structure.",
        });
      }


      const department =
        await prisma.department.findFirst({
          where: {
            id:
              normalizedDepartmentId,

            organizationId,

            isActive:
              true,
          },
        });


      if (
        !department
      ) {
        return res.status(404).json({
          status:
            "error",

          message:
            "The selected department was not found or is inactive.",
        });
      }


            /*
      ==========================================================
      TEMPLATE / DEPARTMENT INTEGRITY GUARD
      ==========================================================

      A CHRIS professional career template may only be applied
      to its matching organizational department.

      This prevents accidental combinations such as:
      Finance template -> Audit department.

      Client customization remains possible after the matching
      template has been applied.
      ==========================================================
      */

      const normalizeStructureIdentifier =
        (value) =>
          String(
            value || ""
          )
            .trim()
            .toLowerCase();


      const templateDepartmentIdentifiers =
        [
          template.name,
          template.code,
          ...(template.aliases || []),
        ]
          .filter(Boolean)
          .map(
            normalizeStructureIdentifier
          );


      const selectedDepartmentIdentifiers =
        [
          department.name,
          department.code,
        ]
          .filter(Boolean)
          .map(
            normalizeStructureIdentifier
          );


      const templateMatchesDepartment =
        selectedDepartmentIdentifiers.some(
          (identifier) =>
            templateDepartmentIdentifiers.includes(
              identifier
            )
        );


      if (
        !templateMatchesDepartment
      ) {
        return res.status(409).json({
          status:
            "error",

          code:
            "CHRIS_TEMPLATE_DEPARTMENT_MISMATCH",

          message:
            `The ${template.name} career structure cannot be applied to ${department.name}. Select the CHRIS template recommended for this department.`,
        });
      }

/*
      ==========================================================
      LOAD ORGANIZATION DESIGNATIONS
      ==========================================================
      */

      const organizationDesignations =
        await prisma.designation.findMany({
          where: {
            organizationId,
          },
        });


      /*
      ==========================================================
      RESOLVE / CREATE POSITIONS

      Existing positions with the same name OR recommended code
      are reused when they are either:
      - unmapped, or
      - already mapped to this department.

      Positions already owned by another department are protected.
      ==========================================================
      */

      const resolvedPositions =
        [];


      for (
        const position of
        template.positions
      ) {
        const normalizedPositionName =
          position.name.toLowerCase();

        const normalizedPositionCode =
          String(
            position.code || ""
          ).toLowerCase();


        const existing =
          organizationDesignations.find(
            (designation) => {
              const sameName =
                String(
                  designation.name ||
                    ""
                )
                  .trim()
                  .toLowerCase() ===
                normalizedPositionName;

              const sameCode =
                normalizedPositionCode &&
                String(
                  designation.code ||
                    ""
                )
                  .trim()
                  .toLowerCase() ===
                  normalizedPositionCode;

              return (
                sameName ||
                sameCode
              );
            }
          );


        if (
          existing &&
          existing.departmentId &&
          existing.departmentId !==
            department.id
        ) {
          return res.status(409).json({
            status:
              "error",

            message:
              `${existing.name} already belongs to another department and cannot be reassigned automatically.`,
          });
        }


        if (
          existing
        ) {
          const updated =
            await prisma.designation.update({
              where: {
                id:
                  existing.id,
              },

              data: {
                departmentId:
                  department.id,

                /*
                Applying the CHRIS Recommended Structure is an
                explicit standardization action.

                Existing compatible designation records are reused,
                but their recommended structural metadata is brought
                into alignment with the selected CHRIS template.

                The existing designation ID remains unchanged, so
                employee references and lifecycle history remain intact.
                */

                code:
                  position.code,

                careerTrack:
                  template.careerTrack,

                careerLevel:
                  position.level,

                isActive:
                  true,
              },
            });


          resolvedPositions.push(
            updated
          );

          continue;
        }


        const created =
          await prisma.designation.create({
            data: {
              organizationId,

              departmentId:
                department.id,

              name:
                position.name,

              code:
                position.code,

              careerTrack:
                template.careerTrack,

              careerLevel:
                position.level,

              isActive:
                true,
            },
          });


        resolvedPositions.push(
          created
        );
      }


      /*
      ==========================================================
      BUILD REPORTING CHAIN

      Each level reports to the next higher level.
      Top level has no reporting designation.
      ==========================================================
      */

      for (
        let index = 0;
        index <
        resolvedPositions.length;
        index++
      ) {
        const current =
          resolvedPositions[
            index
          ];

        const next =
          resolvedPositions[
            index + 1
          ] ||
          null;


        await prisma.designation.update({
          where: {
            id:
              current.id,
          },

          data: {
            reportsToDesignationId:
              next?.id ||
              null,
          },
        });
      }


      const finalDesignations =
        await prisma.designation.findMany({
          where: {
            organizationId,

            departmentId:
              department.id,

            careerTrack:
              template.careerTrack,
          },

          select: {
            id: true,
            name: true,
            code: true,
            departmentId: true,
            careerTrack: true,
            careerLevel: true,
            reportsToDesignationId:
              true,
            isActive: true,

            department: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },

            reportsToDesignation: {
              select: {
                id: true,
                name: true,
                code: true,
                careerLevel: true,
              },
            },
          },

          orderBy: {
            careerLevel:
              "asc",
          },
        });


      return res.status(200).json({
        status:
          "success",

        message:
          `CHRIS recommended ${template.name} career structure applied successfully.`,

        template: {
          key:
            template.key,

          name:
            template.name,

          careerTrack:
            template.careerTrack,
        },

        department: {
          id:
            department.id,

          name:
            department.name,

          code:
            department.code,
        },

        results:
          finalDesignations.length,

        data:
          finalDesignations,
      });
    } catch (error) {
      console.error(
        "Career template application error:",
        error
      );

      if (
        error.code ===
        "P2002"
      ) {
        return res.status(409).json({
          status:
            "error",

          message:
            "A recommended designation name or code conflicts with an existing organization record.",
        });
      }


      return res.status(500).json({
        status:
          "error",

        message:
          "Unable to apply the CHRIS recommended career structure.",
      });
    }
  }
);

/*
============================================================
DESIGNATION CAREER CATALOG
Permission: employees.view
============================================================

Returns active organization designations with career hierarchy
configuration.

NOTE:
This endpoint currently lives inside employeeRoutes, therefore
its URL is:

GET /api/employees/career-catalog
============================================================
*/

router.get(
  "/career/catalog",
  requirePermission(
    "employees.view"
  ),
  async (req, res) => {
    try {
      const organizationId =
        req.auth.organizationId;

      const designations =
        await prisma.designation.findMany({
          where: {
            organizationId,
          },

          select: {
            id: true,
            name: true,
            code: true,
            description: true,
            isActive: true,

            departmentId:
              true,

            department: {
              select: {
                id: true,
                name: true,
                code: true,
                isActive: true,
              },
            },

            careerTrack: true,
            careerLevel: true,
            reportsToDesignationId:
              true,

            reportsToDesignation: {
              select: {
                id: true,
                name: true,
                code: true,
                careerTrack: true,
                careerLevel: true,
              },
            },
          },

          orderBy: [
            {
              careerTrack:
                "asc",
            },
            {
              careerLevel:
                "asc",
            },
            {
              name:
                "asc",
            },
          ],
        });

      return res.status(200).json({
        status:
          "success",

        results:
          designations.length,

        data:
          designations,
      });
    } catch (error) {
      console.error(
        "Career catalog fetch error:",
        error
      );

      return res.status(500).json({
        status:
          "error",

        message:
          "Unable to fetch the designation career catalog.",
      });
    }
  }
);


/*
============================================================
CONFIGURE DESIGNATION CAREER POSITION
Permission: employees.update
============================================================

Expected body:

{
  "careerTrack": "Human Resources",
  "careerLevel": 2,
  "reportsToDesignationId": "optional-designation-id"
}

This allows CHRIS to convert existing designations into
structured career positions.

Temporary URL while designation administration remains inside
employeeRoutes:

PATCH /api/employees/career-catalog/:designationId
============================================================
*/

router.patch(
  "/career/catalog/:designationId",
  requirePermission(
    "employees.update"
  ),
  async (req, res) => {
    try {
      const organizationId =
        req.auth.organizationId;

      const {
        designationId,
      } = req.params;

      const {
        name,
        code,
        departmentId,
        careerTrack,
        careerLevel,
        reportsToDesignationId,
        isActive,
      } = req.body || {};


            /*
      ==========================================================
      DESIGNATION STATUS PROTECTION
      ==========================================================

      Active / Inactive is a designation lifecycle state.

      It must not be changed while editing:
      - career track
      - career level
      - reporting position
      - department career configuration

      A dedicated Activate / Deactivate workflow will control
      lifecycle status separately.
      ==========================================================
      */

      if (
        Object.prototype.hasOwnProperty.call(
          req.body || {},
          "isActive"
        )
      ) {
        return res.status(400).json({
          status:
            "error",

          code:
            "DESIGNATION_STATUS_REQUIRES_LIFECYCLE_ACTION",

          message:
            "Designation Active / Inactive status cannot be changed from career configuration.",
        });
      }

/*
      ----------------------------------------------------------
      VALIDATE TRACK
      ----------------------------------------------------------
      */

      const normalizedCareerTrack =
        String(
          careerTrack || ""
        ).trim();

      if (
        !normalizedCareerTrack
      ) {
        return res.status(400).json({
          status:
            "error",

          message:
            "Career track is required.",
        });
      }


      /*
      ----------------------------------------------------------
      VALIDATE LEVEL
      ----------------------------------------------------------
      */

      const normalizedCareerLevel =
        Number(
          careerLevel
        );

      if (
        !Number.isInteger(
          normalizedCareerLevel
        ) ||
        normalizedCareerLevel < 1
      ) {
        return res.status(400).json({
          status:
            "error",

          message:
            "Career level must be a whole number of 1 or above.",
        });
      }


      /*
      ----------------------------------------------------------
      LOAD DESIGNATION
      ----------------------------------------------------------
      */

      const designation =
        await prisma.designation.findFirst({
          where: {
            id:
              designationId,

            organizationId,
          },
        });

      if (!designation) {
        return res.status(404).json({
          status:
            "error",

          message:
            "Designation not found.",
        });
      }

            /*
      ----------------------------------------------------------
      VALIDATE DESIGNATION IDENTITY
      ----------------------------------------------------------

      Name and code are tenant-configurable organizational
      terminology.

      Editing them:
      - preserves designation record ID
      - preserves employee assignments
      - preserves career structure
      - preserves lifecycle history
      - must remain unique within the tenant
      ----------------------------------------------------------
      */

      const normalizedName =
        name !== undefined
          ? String(
              name || ""
            ).trim()
          : designation.name;


      if (!normalizedName) {
        return res.status(400).json({
          status:
            "error",

          code:
            "DESIGNATION_NAME_REQUIRED",

          message:
            "Designation name is required.",
        });
      }


      const normalizedCode =
        code !== undefined
          ? String(
              code || ""
            ).trim() ||
            null
          : designation.code;


      /*
      ----------------------------------------------------------
      DUPLICATE NAME / CODE PROTECTION
      ----------------------------------------------------------
      */

      const duplicateIdentity =
        await prisma.designation.findFirst({
          where: {
            organizationId,

            id: {
              not:
                designation.id,
            },

            OR: [
              {
                name: {
                  equals:
                    normalizedName,

                  mode:
                    "insensitive",
                },
              },

              ...(normalizedCode
                ? [
                    {
                      code: {
                        equals:
                          normalizedCode,

                        mode:
                          "insensitive",
                      },
                    },
                  ]
                : []),
            ],
          },

          select: {
            id: true,
            name: true,
            code: true,
          },
        });


      if (duplicateIdentity) {
        const duplicateName =
          duplicateIdentity.name
            ?.toLowerCase() ===
          normalizedName.toLowerCase();


        return res.status(409).json({
          status:
            "error",

          code:
            "DESIGNATION_IDENTITY_DUPLICATE",

          message:
            duplicateName
              ? `Another designation already uses the name "${normalizedName}".`
              : `Another designation already uses the code "${normalizedCode}".`,

          conflict:
            duplicateIdentity,
        });
      }

/*
      ----------------------------------------------------------
      VALIDATE DEPARTMENT
      ----------------------------------------------------------
      */

      const normalizedDepartmentId =
        String(
          departmentId ||
            designation.departmentId ||
            ""
        ).trim();


      if (
        !normalizedDepartmentId
      ) {
        return res.status(400).json({
          status:
            "error",

          message:
            "Select the department that owns this designation.",
        });
      }


      const department =
        await prisma.department.findFirst({
          where: {
            id:
              normalizedDepartmentId,

            organizationId,

            isActive:
              true,
          },
        });


      if (
        !department
      ) {
        return res.status(404).json({
          status:
            "error",

          message:
            "The selected department was not found or is inactive.",
        });
      }


      /*
      ----------------------------------------------------------
      VALIDATE REPORTING DESIGNATION WHEN SUPPLIED
      ----------------------------------------------------------
      */

      let reportingDesignation =
        null;

      const normalizedReportsToId =
        reportsToDesignationId
          ? String(
              reportsToDesignationId
            ).trim()
          : null;

      if (
        normalizedReportsToId
      ) {
        if (
          normalizedReportsToId ===
          designation.id
        ) {
          return res.status(400).json({
            status:
              "error",

            message:
              "A designation cannot report to itself.",
          });
        }

        reportingDesignation =
          await prisma.designation.findFirst({
            where: {
              id:
                normalizedReportsToId,

              organizationId,

              isActive:
                true,
            },
          });

        if (!reportingDesignation) {
          return res.status(404).json({
            status:
              "error",

            message:
              "The selected reporting designation was not found.",
          });
        }

        if (
          reportingDesignation.departmentId &&
          reportingDesignation.departmentId !==
            normalizedDepartmentId
        ) {
          return res.status(400).json({
            status:
              "error",

            message:
              "The reporting designation must belong to the same department.",
          });
        }

        /*
        Reporting position should normally sit above the current
        position in the same career track when already configured.
        */

        if (
          reportingDesignation.careerTrack &&
          reportingDesignation.careerTrack !==
            normalizedCareerTrack
        ) {
          return res.status(400).json({
            status:
              "error",

            message:
              "The reporting designation must belong to the same career track.",
          });
        }

        if (
          reportingDesignation.careerLevel !==
            null &&
          reportingDesignation.careerLevel <=
            normalizedCareerLevel
        ) {
          return res.status(400).json({
            status:
              "error",

            message:
              "The reporting designation must have a higher career level.",
          });
        }
      }


      /*
      ----------------------------------------------------------
      PREVENT DUPLICATE CAREER LEVEL IN SAME TRACK
      ----------------------------------------------------------

      One track should normally have one canonical designation
      at each career level.

      This can be relaxed later if CHRIS introduces career bands.
      ----------------------------------------------------------
      */

      const duplicateLevel =
        await prisma.designation.findFirst({
          where: {
            organizationId,

            departmentId:
              normalizedDepartmentId,

            careerTrack:
              normalizedCareerTrack,

            careerLevel:
              normalizedCareerLevel,

            NOT: {
              id:
                designation.id,
            },
          },

          select: {
            id: true,
            name: true,
          },
        });

      if (duplicateLevel) {
        return res.status(409).json({
          status:
            "error",

          message:
            `Career level ${normalizedCareerLevel} in ${normalizedCareerTrack} is already assigned to ${duplicateLevel.name}.`,
        });
      }


      /*
      ----------------------------------------------------------
      UPDATE CAREER CONFIGURATION
      ----------------------------------------------------------
      */

      const updatedDesignation =
        await prisma.designation.update({
          where: {
            id:
              designation.id,
          },

          data: {
            name:
              normalizedName,

            code:
              normalizedCode,

            departmentId:
              normalizedDepartmentId,

            careerTrack:
              normalizedCareerTrack,

            careerLevel:
              normalizedCareerLevel,

            reportsToDesignationId:
              normalizedReportsToId,

            isActive:
              typeof isActive === "boolean"
                ? isActive
                : designation.isActive,
          },

          select: {
            id: true,
            name: true,
            code: true,
            isActive: true,

            departmentId:
              true,

            department: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },

            careerTrack: true,
            careerLevel: true,
            reportsToDesignationId:
              true,

            reportsToDesignation: {
              select: {
                id: true,
                name: true,
                code: true,
                careerTrack: true,
                careerLevel: true,
              },
            },
          },
        });

      return res.status(200).json({
        status:
          "success",

        message:
          "Designation configuration updated successfully.",

        data:
          updatedDesignation,
      });
    } catch (error) {
      console.error(
        "Career designation configuration error:",
        error
      );

      return res.status(500).json({
        status:
          "error",

        message:
          "Unable to configure designation career position.",
      });
    }
  }
);


/*
============================================================
EMPLOYEE PROMOTION OPTIONS
Permission: employees.view
============================================================

Returns only active designations which:

- belong to the employee's current career track
- have a higher career level
- belong to the authenticated organization

Sorted from the nearest upward level to the highest.

GET /api/employees/:employeeNumber/promotion-options
============================================================
*/

router.get(
  "/:employeeNumber/promotion-options",
  requirePermission(
    "employees.view"
  ),
  async (req, res) => {
    try {
      const organizationId =
        req.auth.organizationId;

      const {
        employeeNumber,
      } = req.params;

      const employee =
        await getEmployee(
          organizationId,
          employeeNumber
        );

      if (!employee) {
        return res.status(404).json({
          status:
            "error",

          message:
            "Employee not found.",
        });
      }


      /*
      ----------------------------------------------------------
      EMPLOYMENT STATUS RULES
      ----------------------------------------------------------
      */

      if (
        EXIT_STATUSES.includes(
          employee.status
        )
      ) {
        return res.status(400).json({
          status:
            "error",

          message:
            "Promotion options are unavailable for an exited employee.",
        });
      }

      if (
        [
          "SUSPENDED",
          "INACTIVE",
        ].includes(
          employee.status
        )
      ) {
        return res.status(400).json({
          status:
            "error",

          message:
            "Promotion options are unavailable while the employee is suspended or inactive.",
        });
      }


      /*
      ----------------------------------------------------------
      CURRENT CAREER POSITION MUST BE CONFIGURED
      ----------------------------------------------------------
      */

      const currentDesignation =
        employee.designation;

      if (!currentDesignation) {
        return res.status(400).json({
          status:
            "error",

          code:
            "CAREER_POSITION_NOT_CONFIGURED",

          message:
            "The employee does not currently have a designation.",
        });
      }

      if (
        !currentDesignation.careerTrack ||
        currentDesignation.careerLevel ===
          null
      ) {
        return res.status(400).json({
          status:
            "error",

          code:
            "CAREER_POSITION_NOT_CONFIGURED",

          message:
            "The employee's current designation has not yet been configured in the career hierarchy.",

          designation: {
            id:
              currentDesignation.id,

            name:
              currentDesignation.name,

            code:
              currentDesignation.code,

            careerTrack:
              currentDesignation.careerTrack,

            careerLevel:
              currentDesignation.careerLevel,
          },
        });
      }


      /*
      ----------------------------------------------------------
      VALID UPWARD POSITIONS
      ----------------------------------------------------------
      */

      const promotionOptions =
        await prisma.designation.findMany({
          where: {
            organizationId,

            isActive:
              true,

            careerTrack:
              currentDesignation.careerTrack,

            careerLevel: {
              gt:
                currentDesignation.careerLevel,
            },

            NOT: {
              id:
                currentDesignation.id,
            },
          },

          select: {
            id: true,
            name: true,
            code: true,
            description: true,
            careerTrack: true,
            careerLevel: true,
            reportsToDesignationId:
              true,

            reportsToDesignation: {
              select: {
                id: true,
                name: true,
                code: true,
                careerLevel: true,
              },
            },
          },

          orderBy: [
            {
              careerLevel:
                "asc",
            },
            {
              name:
                "asc",
            },
          ],
        });


      return res.status(200).json({
        status:
          "success",

        results:
          promotionOptions.length,

        employee: {
          id:
            employee.id,

          employeeNumber:
            employee.employeeNumber,

          name: [
            employee.firstName,
            employee.middleName,
            employee.lastName,
          ]
            .filter(Boolean)
            .join(" "),

          status:
            employee.status,

          department: employee.department
            ? {
                id:
                  employee.department.id,

                name:
                  employee.department.name,

                code:
                  employee.department.code,
              }
            : null,

          currentDesignation: {
            id:
              currentDesignation.id,

            name:
              currentDesignation.name,

            code:
              currentDesignation.code,

            careerTrack:
              currentDesignation.careerTrack,

            careerLevel:
              currentDesignation.careerLevel,
          },
        },

        data:
          promotionOptions,
      });
    } catch (error) {
      console.error(
        "Employee promotion options error:",
        error
      );

      return res.status(500).json({
        status:
          "error",

        message:
          "Unable to load employee promotion options.",
      });
    }
  }
);


/*
============================================================
PROMOTE EMPLOYEE ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â CAREER PROGRESSION
Permission: employees.update
============================================================

Expected body:

{
  "designationId": "target-designation-id",
  "effectiveDate": "2026-08-11",
  "reason": "Performance-based promotion",
  "notes": "Optional HR notes"
}

Promotion is now a controlled upward career transaction.

The backend validates:

- employee is still eligible for promotion
- current designation has career configuration
- selected designation exists
- selected designation is active
- selected designation belongs to same organization
- selected designation belongs to same career track
- selected designation is above the current career level

Department remains unchanged.

Lateral movement / department reassignment will be implemented
as a separate Job Change / Reassignment transaction.
============================================================
*/


/*
============================================================
CONTROLLED EMPLOYEE JOB CHANGE / REASSIGNMENT

Used for:
- lateral designation changes
- designation corrections
- role reclassification
- department reassignment
- organizational restructuring

This is NOT a promotion transaction.

The transaction preserves:
- previous department
- new department
- previous designation
- new designation
- effective date
- reason / notes
- performing user
============================================================
*/

router.patch(
  "/:employeeNumber/job-change",
  requirePermission(
    "employees.update"
  ),
  async (req, res) => {
    try {
      const organizationId =
        req.auth.organizationId;

      const {
        employeeNumber,
      } = req.params;

      const {
        departmentId,
        designationId,
        effectiveDate,
        reason,
        notes,
      } = req.body || {};


      /*
      --------------------------------------------------------
      REQUIRED FIELDS
      --------------------------------------------------------
      */

      if (
        !designationId ||
        !String(designationId).trim()
      ) {
        return res.status(400).json({
          status: "error",
          code:
            "DESIGNATION_REQUIRED",
          message:
            "A target designation is required for a job change.",
        });
      }

      if (
        !effectiveDate ||
        !String(effectiveDate).trim()
      ) {
        return res.status(400).json({
          status: "error",
          code:
            "EFFECTIVE_DATE_REQUIRED",
          message:
            "An effective date is required for a job change.",
        });
      }

      if (
        !reason ||
        !String(reason).trim()
      ) {
        return res.status(400).json({
          status: "error",
          code:
            "JOB_CHANGE_REASON_REQUIRED",
          message:
            "A reason is required for a job change.",
        });
      }


      /*
      --------------------------------------------------------
      EFFECTIVE DATE
      --------------------------------------------------------
      */

      const parsedEffectiveDate =
        new Date(effectiveDate);

      if (
        Number.isNaN(
          parsedEffectiveDate.getTime()
        )
      ) {
        return res.status(400).json({
          status: "error",
          code:
            "INVALID_EFFECTIVE_DATE",
          message:
            "The supplied effective date is invalid.",
        });
      }


      /*
      --------------------------------------------------------
      LOAD CURRENT EMPLOYEE
      --------------------------------------------------------
      */

      const existingEmployee =
        await prisma.employee.findFirst({
          where: {
            organizationId,
            employeeNumber,
          },

          include: {
            department: true,
            designation: true,
            location: true,

            user: {
              select: {
                id: true,
                isActive: true,
              },
            },
          },
        });


      if (!existingEmployee) {
        return res.status(404).json({
          status: "error",
          code:
            "EMPLOYEE_NOT_FOUND",
          message:
            "Employee was not found.",
        });
      }


      /*
      --------------------------------------------------------
      EMPLOYEE STATUS SAFETY
      --------------------------------------------------------

      EXITED employees must not receive job changes.

      ACTIVE, PROBATION and LEAVE employees may legitimately
      receive an approved structural/job correction.
      --------------------------------------------------------
      */

      if (
        existingEmployee.status ===
        "EXITED"
      ) {
        return res.status(409).json({
          status: "error",
          code:
            "EMPLOYEE_EXITED",
          message:
            "A job change cannot be processed for an exited employee.",
        });
      }


      /*
      --------------------------------------------------------
      TARGET DESIGNATION
      --------------------------------------------------------
      */

      const targetDesignation =
        await prisma.designation.findFirst({
          where: {
            id:
              String(
                designationId
              ).trim(),

            organizationId,
          },

          include: {
            department: true,
          },
        });


      if (!targetDesignation) {
        return res.status(404).json({
          status: "error",
          code:
            "DESIGNATION_NOT_FOUND",
          message:
            "The selected designation does not exist in this organization.",
        });
      }


      if (
        targetDesignation.isActive ===
        false
      ) {
        return res.status(409).json({
          status: "error",
          code:
            "DESIGNATION_INACTIVE",
          message:
            "The selected designation is inactive and cannot receive employees.",
        });
      }


      /*
      --------------------------------------------------------
      DETERMINE TARGET DEPARTMENT
      --------------------------------------------------------

      Normally the designation owns the department.

      departmentId may be supplied by the UI, but it must agree
      with the designation's configured department.
      --------------------------------------------------------
      */

      const targetDepartmentId =
        targetDesignation.departmentId ||
        (
          departmentId
            ? String(
                departmentId
              ).trim()
            : null
        );


      if (!targetDepartmentId) {
        return res.status(409).json({
          status: "error",
          code:
            "DESIGNATION_UNMAPPED",
          message:
            "The selected designation is not mapped to a department.",
        });
      }


      if (
        departmentId &&
        targetDesignation.departmentId &&
        String(departmentId).trim() !==
          targetDesignation.departmentId
      ) {
        return res.status(409).json({
          status: "error",
          code:
            "DEPARTMENT_DESIGNATION_MISMATCH",
          message:
            "The selected designation does not belong to the selected department.",
        });
      }


      const targetDepartment =
        await prisma.department.findFirst({
          where: {
            id: targetDepartmentId,
            organizationId,
          },
        });


      if (!targetDepartment) {
        return res.status(404).json({
          status: "error",
          code:
            "DEPARTMENT_NOT_FOUND",
          message:
            "The target department does not exist in this organization.",
        });
      }


      /*
      --------------------------------------------------------
      NO-CHANGE PROTECTION
      --------------------------------------------------------
      */

      const sameDepartment =
        existingEmployee.departmentId ===
        targetDepartment.id;

      const sameDesignation =
        existingEmployee.designationId ===
        targetDesignation.id;


      if (
        sameDepartment &&
        sameDesignation
      ) {
        return res.status(409).json({
          status: "error",
          code:
            "NO_JOB_CHANGE",
          message:
            "The employee is already assigned to the selected department and designation.",
        });
      }


      /*
      --------------------------------------------------------
      TRANSACTION
      --------------------------------------------------------
      */

      const employee =
        await prisma.$transaction(
          async (tx) => {

            const updatedEmployee =
              await tx.employee.update({
                where: {
                  id:
                    existingEmployee.id,
                },

                data: {
                  departmentId:
                    targetDepartment.id,

                  designationId:
                    targetDesignation.id,
                },

                include: {
                  department: true,
                  designation: true,
                  location: true,

                  user: {
                    select: {
                      id: true,
                      isActive: true,
                    },
                  },
                },
              });


            await tx.employeeLifecycleEvent.create({
              data: {
                organizationId,

                employeeId:
                  existingEmployee.id,

                eventType:
                  "JOB_CHANGED",

                effectiveDate:
                  parsedEffectiveDate,

                previousStatus:
                  existingEmployee.status,

                newStatus:
                  existingEmployee.status,

                fromLocationId:
                  existingEmployee.locationId,

                toLocationId:
                  existingEmployee.locationId,

                previousDepartmentId:
                  existingEmployee.departmentId,

                newDepartmentId:
                  targetDepartment.id,

                previousDesignationId:
                  existingEmployee.designationId,

                newDesignationId:
                  targetDesignation.id,

                reason:
                  String(reason).trim(),

                notes:
                  notes &&
                  String(notes).trim()
                    ? String(notes).trim()
                    : null,

                performedByUserId:
                  req.auth.userId || null,
              },
            });


            return updatedEmployee;
          }
        );


      /*
      --------------------------------------------------------
      SUCCESS
      --------------------------------------------------------
      */

      return res.status(200).json({
        status: "success",

        message:
          `${employee.firstName} ${employee.lastName}'s job change was processed successfully.`,

        data: {
          employee,

          movement: {
            previousDepartment:
              existingEmployee
                .department?.name ||
              null,

            newDepartment:
              employee
                .department?.name ||
              null,

            previousDesignation:
              existingEmployee
                .designation?.name ||
              null,

            newDesignation:
              employee
                .designation?.name ||
              null,

            effectiveDate:
              parsedEffectiveDate,

            reason:
              String(reason).trim(),
          },
        },
      });
    } catch (error) {
      console.error(
        "Employee job change error:",
        error
      );

      return res.status(500).json({
        status: "error",
        message:
          "Unable to process employee job change.",
      });
    }
  }
);

router.patch(
  "/:employeeNumber/promote",
  requirePermission(
    "employees.update"
  ),
  async (req, res) => {
    try {
      const organizationId =
        req.auth.organizationId;

      const {
        employeeNumber,
      } = req.params;

      const {
        designationId,
        effectiveDate,
        reason,
        notes,
      } = req.body || {};


      /*
      ----------------------------------------------------------
      TARGET DESIGNATION IS REQUIRED
      ----------------------------------------------------------
      */

      const normalizedDesignationId =
        String(
          designationId || ""
        ).trim();

      if (
        !normalizedDesignationId
      ) {
        return res.status(400).json({
          status:
            "error",

          message:
            "Select a promotion designation.",
        });
      }


      /*
      ----------------------------------------------------------
      EFFECTIVE DATE
      ----------------------------------------------------------
      */

      const parsedEffectiveDate =
        effectiveDate
          ? new Date(
              effectiveDate
            )
          : new Date();

      if (
        Number.isNaN(
          parsedEffectiveDate.getTime()
        )
      ) {
        return res.status(400).json({
          status:
            "error",

          message:
            "Enter a valid promotion effective date.",
        });
      }


      /*
      ----------------------------------------------------------
      CURRENT EMPLOYEE
      ----------------------------------------------------------
      */

      const existingEmployee =
        await getEmployee(
          organizationId,
          employeeNumber
        );

      if (!existingEmployee) {
        return res.status(404).json({
          status:
            "error",

          message:
            "Employee not found.",
        });
      }


      /*
      ----------------------------------------------------------
      STATUS RULES
      ----------------------------------------------------------
      */

      if (
        EXIT_STATUSES.includes(
          existingEmployee.status
        )
      ) {
        return res.status(400).json({
          status:
            "error",

          message:
            "An exited employee cannot be promoted. Reinstate or rehire the employee first.",
        });
      }

      if (
        [
          "SUSPENDED",
          "INACTIVE",
        ].includes(
          existingEmployee.status
        )
      ) {
        return res.status(400).json({
          status:
            "error",

          message:
            "Suspended or inactive employees cannot be promoted.",
        });
      }


      /*
      ----------------------------------------------------------
      CURRENT DESIGNATION CAREER CONFIGURATION
      ----------------------------------------------------------
      */

      const currentDesignation =
        existingEmployee.designation;

      if (!currentDesignation) {
        return res.status(400).json({
          status:
            "error",

          code:
            "CAREER_POSITION_NOT_CONFIGURED",

          message:
            "The employee does not currently have a designation.",
        });
      }

      if (
        !currentDesignation.careerTrack ||
        currentDesignation.careerLevel ===
          null
      ) {
        return res.status(400).json({
          status:
            "error",

          code:
            "CAREER_POSITION_NOT_CONFIGURED",

          message:
            "The employee's current designation has not been configured in the career hierarchy.",
        });
      }


      /*
      ----------------------------------------------------------
      LOAD SELECTED TARGET DESIGNATION
      ----------------------------------------------------------
      */

      const targetDesignation =
        await prisma.designation.findFirst({
          where: {
            id:
              normalizedDesignationId,

            organizationId,

            isActive:
              true,
          },
        });

      if (!targetDesignation) {
        return res.status(404).json({
          status:
            "error",

          message:
            "The selected promotion designation is unavailable.",
        });
      }


      /*
      ----------------------------------------------------------
      TARGET DESIGNATION MUST ALSO BE CONFIGURED
      ----------------------------------------------------------
      */

      if (
        !targetDesignation.careerTrack ||
        targetDesignation.careerLevel ===
          null
      ) {
        return res.status(400).json({
          status:
            "error",

          code:
            "TARGET_CAREER_POSITION_NOT_CONFIGURED",

          message:
            "The selected designation has not been configured in the career hierarchy.",
        });
      }


      /*
      ----------------------------------------------------------
      SAME CAREER TRACK
      ----------------------------------------------------------
      */

      if (
        targetDesignation.careerTrack !==
        currentDesignation.careerTrack
      ) {
        return res.status(400).json({
          status:
            "error",

          message:
            "A promotion must remain within the employee's current career track. Use Job Change / Reassignment for lateral or cross-track movements.",
        });
      }


      /*
      ----------------------------------------------------------
      MUST BE UPWARD
      ----------------------------------------------------------
      */

      if (
        targetDesignation.careerLevel <=
        currentDesignation.careerLevel
      ) {
        return res.status(400).json({
          status:
            "error",

          message:
            "The selected designation is not above the employee's current career level.",
        });
      }


      /*
      ----------------------------------------------------------
      TRANSACTION

      Department intentionally remains unchanged.
      ----------------------------------------------------------
      */

      const employee =
        await prisma.$transaction(
          async (tx) => {
            const updatedEmployee =
              await tx.employee.update({
                where: {
                  id:
                    existingEmployee.id,
                },

                data: {
                  designationId:
                    targetDesignation.id,
                },

                include: {
                  department:
                    true,

                  designation:
                    true,

                  location:
                    true,

                  user: {
                    select: {
                      id:
                        true,

                      isActive:
                        true,
                    },
                  },
                },
              });

            await tx.employeeLifecycleEvent.create({
              data: {
                organizationId,

                employeeId:
                  existingEmployee.id,

                eventType:
                  "PROMOTED",

                effectiveDate:
                  parsedEffectiveDate,

                previousStatus:
                  existingEmployee.status,

                newStatus:
                  existingEmployee.status,

                fromLocationId:
                  existingEmployee.locationId,

                toLocationId:
                  existingEmployee.locationId,

                /*
                Department is unchanged during Promotion.
                */

                previousDepartmentId:
                  existingEmployee.departmentId,

                newDepartmentId:
                  existingEmployee.departmentId,

                /*
                Structured career movement.
                */

                previousDesignationId:
                  currentDesignation.id,

                newDesignationId:
                  targetDesignation.id,

                reason:
                  reason?.trim() ||
                  null,

                notes:
                  notes?.trim() ||
                  null,

                performedByUserId:
                  req.auth.userId,
              },
            });

            return updatedEmployee;
          }
        );


      return res.status(200).json({
        status:
          "success",

        message:
          "Employee promotion recorded successfully.",

        careerMovement: {
          careerTrack:
            currentDesignation.careerTrack,

          previousLevel:
            currentDesignation.careerLevel,

          newLevel:
            targetDesignation.careerLevel,

          previousDesignation: {
            id:
              currentDesignation.id,

            name:
              currentDesignation.name,
          },

          newDesignation: {
            id:
              targetDesignation.id,

            name:
              targetDesignation.name,
          },
        },

        data:
          employee,
      });
    } catch (error) {
      console.error(
        "Employee career promotion error:",
        error
      );

      return res.status(500).json({
        status:
          "error",

        message:
          "Unable to process employee promotion.",
      });
    }
  }
);
router.patch(
  "/:employeeNumber/transfer",
  requirePermission(
    "employees.update"
  ),
  async (req, res) => {
    try {
      const organizationId =
        req.auth.organizationId;

      const {
        employeeNumber,
      } = req.params;

      const {
        locationId,
        effectiveDate,
        reason,
        notes,
      } = req.body || {};

      /*
      ----------------------------------------------------------
      Validate destination location.
      ----------------------------------------------------------
      */

      if (
        !locationId ||
        !String(
          locationId
        ).trim()
      ) {
        return res.status(400).json({
          status:
            "error",

          message:
            "Select a destination location.",
        });
      }

      const parsedEffectiveDate =
        effectiveDate
          ? new Date(
              effectiveDate
            )
          : new Date();

      if (
        Number.isNaN(
          parsedEffectiveDate.getTime()
        )
      ) {
        return res.status(400).json({
          status:
            "error",

          message:
            "Enter a valid transfer effective date.",
        });
      }

      /*
      ----------------------------------------------------------
      Load employee within authenticated organization.
      ----------------------------------------------------------
      */

      const existingEmployee =
        await getEmployee(
          organizationId,
          employeeNumber
        );

      if (!existingEmployee) {
        return res.status(404).json({
          status:
            "error",

          message:
            "Employee not found.",
        });
      }

      /*
      Exited employees should not be transferred.
      They must first be reinstated or rehired.
      */

      if (
        EXIT_STATUSES.includes(
          existingEmployee.status
        )
      ) {
        return res.status(400).json({
          status:
            "error",

          message:
            "An exited employee cannot be transferred. Reinstate or rehire the employee first.",
        });
      }

      /*
      ----------------------------------------------------------
      Destination must belong to same organization and be active.
      ----------------------------------------------------------
      */

      const destinationLocation =
        await prisma.organizationLocation.findFirst({
          where: {
            id:
              String(
                locationId
              ).trim(),

            organizationId,

            isActive:
              true,
          },

          select: {
            id: true,
            name: true,
            code: true,
            type: true,
            city: true,
            state: true,
            country: true,
          },
        });

      if (!destinationLocation) {
        return res.status(404).json({
          status:
            "error",

          message:
            "The selected destination location is unavailable.",
        });
      }

      /*
      ----------------------------------------------------------
      Prevent a no-op transfer.
      ----------------------------------------------------------
      */

      if (
        existingEmployee.locationId ===
        destinationLocation.id
      ) {
        return res.status(400).json({
          status:
            "error",

          message:
            "The employee is already assigned to the selected location.",
        });
      }

      /*
      ----------------------------------------------------------
      Transaction:
      1. Change current location
      2. Record permanent lifecycle history
      ----------------------------------------------------------
      */

      const employee =
        await prisma.$transaction(
          async (tx) => {
            const updatedEmployee =
              await tx.employee.update({
                where: {
                  id:
                    existingEmployee.id,
                },

                data: {
                  locationId:
                    destinationLocation.id,
                },

                include: {
                  department:
                    true,

                  designation:
                    true,

                  location:
                    true,

                  user: {
                    select: {
                      id:
                        true,

                      isActive:
                        true,
                    },
                  },
                },
              });

            await tx.employeeLifecycleEvent.create({
              data: {
                organizationId,

                employeeId:
                  existingEmployee.id,

                eventType:
                  "TRANSFERRED",

                effectiveDate:
                  parsedEffectiveDate,

                previousStatus:
                  existingEmployee.status,

                newStatus:
                  existingEmployee.status,

                fromLocationId:
                  existingEmployee.locationId,

                toLocationId:
                  destinationLocation.id,

                reason:
                  reason?.trim() ||
                  null,

                notes:
                  notes?.trim() ||
                  null,

                performedByUserId:
                  req.auth.userId,
              },
            });

            return updatedEmployee;
          }
        );

      return res.status(200).json({
        status:
          "success",

        message:
          "Employee transferred successfully.",

        data:
          employee,
      });
    } catch (error) {
      console.error(
        "Employee transfer error:",
        error
      );

      return res.status(500).json({
        status:
          "error",

        message:
          "Unable to transfer employee.",
      });
    }
  }
);
/*
============================================================
CREATE EMPLOYEE
Permission: employees.create
============================================================

Controlled employee creation:

- Department must already exist in this organization.
- Department must be active.
- Designation must already exist in this organization.
- Designation must be active.
- Designation must be mapped to the selected Department.
- Work Location must already exist and be active in this organization.
- Add Employee cannot silently create organizational structure.
- Employee ID is allocated from the organization's permanent,
  non-recyclable sequence.
============================================================
*/

router.post(
  "/",
  requirePermission(
    "employees.create"
  ),
  async (req, res) => {
    try {
      const organizationId =
        req.auth.organizationId;

      const {
        name,
        departmentId,
        designationId,
        locationId,
        email,
        phone,
        status = "Active",
      } = req.body || {};


      /*
      ------------------------------------------------------------
      REQUIRED FIELDS
      ------------------------------------------------------------
      */

      if (
        !name?.trim() ||
        !departmentId ||
        !designationId ||
        !locationId ||
        !email?.trim() ||
        !phone?.trim()
      ) {
        return res.status(400).json({
          status:
            "error",

          code:
            "EMPLOYEE_REQUIRED_FIELDS_MISSING",

          message:
            "Please complete all required employee fields.",
        });
      }


      /*
      ------------------------------------------------------------
      NORMALIZE EMPLOYEE IDENTITY DATA
      ------------------------------------------------------------
      */

      const normalizedEmail =
        email
          .trim()
          .toLowerCase();

      const normalizedName =
        normalizeEmployeeName(
          name
        );

      if (!normalizedName) {
        return res.status(400).json({
          status:
            "error",

          code:
            "INVALID_EMPLOYEE_NAME",

          message:
            "Please enter at least the employee's first and last name.",
        });
      }


      /*
      ------------------------------------------------------------
      DUPLICATE EMPLOYEE EMAIL
      ------------------------------------------------------------
      */

      const duplicateEmail =
        await prisma.employee.findFirst({
          where: {
            organizationId,

            email:
              normalizedEmail,
          },

          select: {
            id:
              true,

            employeeNumber:
              true,
          },
        });

      if (duplicateEmail) {
        return res.status(409).json({
          status:
            "error",

          code:
            "EMPLOYEE_EMAIL_ALREADY_EXISTS",

          message:
            "An employee with this email address already exists.",
        });
      }


      /*
      ------------------------------------------------------------
      VALIDATE DEPARTMENT
      ------------------------------------------------------------
      */

      const departmentRecord =
        await prisma.department.findFirst({
          where: {
            id:
              String(
                departmentId
              ).trim(),

            organizationId,

            isActive:
              true,
          },

          select: {
            id:
              true,

            name:
              true,

            code:
              true,

            isActive:
              true,
          },
        });

      if (!departmentRecord) {
        return res.status(400).json({
          status:
            "error",

          code:
            "INVALID_EMPLOYEE_DEPARTMENT",

          message:
            "Select an active department from your organization's CHRIS structure.",
        });
      }


      /*
      ------------------------------------------------------------
      VALIDATE DESIGNATION + DEPARTMENT MAPPING
      ------------------------------------------------------------
      */

      const designationRecord =
        await prisma.designation.findFirst({
          where: {
            id:
              String(
                designationId
              ).trim(),

            organizationId,

            departmentId:
              departmentRecord.id,

            isActive:
              true,
          },

          select: {
            id:
              true,

            name:
              true,

            code:
              true,

            departmentId:
              true,

            isActive:
              true,
          },
        });

      if (!designationRecord) {
        return res.status(400).json({
          status:
            "error",

          code:
            "INVALID_EMPLOYEE_DESIGNATION",

          message:
            "Select an active designation mapped to the selected department.",
        });
      }


      /*
      ------------------------------------------------------------
      VALIDATE WORK LOCATION / BRANCH
      ------------------------------------------------------------
      */

      const locationRecord =
        await prisma.organizationLocation.findFirst({
          where: {
            id:
              String(
                locationId
              ).trim(),

            organizationId,

            isActive:
              true,
          },

          select: {
            id:
              true,

            name:
              true,

            code:
              true,

            type:
              true,

            city:
              true,

            state:
              true,

            country:
              true,

            isActive:
              true,
          },
        });

      if (!locationRecord) {
        return res.status(400).json({
          status:
            "error",

          code:
            "INVALID_EMPLOYEE_LOCATION",

          message:
            "Select an active work location from your organization's CHRIS location catalogue.",
        });
      }


      /*
      ------------------------------------------------------------
      PERMANENT EMPLOYEE NUMBER ALLOCATION
      ------------------------------------------------------------

      The Organization owns a monotonically increasing sequence.

      Once issued:
      - an Employee ID is never recycled
      - exit does not release it
      - reinstatement keeps it
      - future rehire keeps the employee's permanent ID

      The sequence increment and Employee creation happen in the
      same database transaction.
      ------------------------------------------------------------
      */

      const employee =
        await prisma.$transaction(
          async (tx) => {
            const sequenceOwner =
              await tx.organization.update({
                where: {
                  id:
                    organizationId,
                },

                data: {
                  employeeNumberSequence: {
                    increment:
                      1,
                  },
                },

                select: {
                  employeeNumberSequence:
                    true,
                },
              });

            const nextNumber =
              sequenceOwner
                .employeeNumberSequence;

            if (
              nextNumber >
              999999
            ) {
              throw new Error(
                "EMPLOYEE_NUMBER_SEQUENCE_EXHAUSTED"
              );
            }

            const employeeNumber =
              `CHR${String(
                nextNumber
              ).padStart(
                6,
                "0"
              )}`;

            const createdEmployee =
              await tx.employee.create({
                data: {
                  organizationId,

                  departmentId:
                    departmentRecord.id,

                  designationId:
                    designationRecord.id,

                  locationId:
                    locationRecord.id,

                  employeeNumber,

                  firstName:
                    normalizedName.firstName,

                  middleName:
                    normalizedName.middleName,

                  lastName:
                    normalizedName.lastName,

                  email:
                    normalizedEmail,

                  phone:
                    phone.trim(),

                gender:
                  normalizeEmployeeGender(gender),

                  status:
                    STATUS_MAP[status] ||
                    "ACTIVE",
                },

                include: {
                  department:
                    true,

                  designation:
                    true,

                  location:
                    true,
                },
              });


            /*
            ------------------------------------------------------
            EMPLOYMENT EPISODE 1

            A genuine new hire always starts Episode 1.
            The permanent Employee record stores current state;
            Employment Episodes store service periods.
            ------------------------------------------------------
            */

            await tx.employeeEmploymentEpisode.create({
              data: {
                organizationId,

                employeeId:
                  createdEmployee.id,

                sequenceNumber:
                  1,

                startDate:
                  createdEmployee.hireDate ||
                  createdEmployee.createdAt,

                startStatus:
                  createdEmployee.status,

                startDepartmentId:
                  createdEmployee.departmentId,

                startDesignationId:
                  createdEmployee.designationId,

                startLocationId:
                  createdEmployee.locationId,

                startReason:
                  "Initial employment",
              },
            });


            return createdEmployee;
          }
        );


      return res.status(201).json({
        status:
          "success",

        message:
          `Employee created successfully with permanent Employee ID ${employee.employeeNumber}.`,

        data:
          employee,
      });
    } catch (error) {
      console.error(
        "Employee creation error:",
        error
      );

      if (
        error.message ===
        "EMPLOYEE_NUMBER_SEQUENCE_EXHAUSTED"
      ) {
        return res.status(409).json({
          status:
            "error",

          code:
            "EMPLOYEE_NUMBER_SEQUENCE_EXHAUSTED",

          message:
            "The current CHRIS employee number range has been exhausted. Extend the employee number format before creating another employee.",
        });
      }

      if (
        error.code ===
        "P2002"
      ) {
        return res.status(409).json({
          status:
            "error",

          code:
            "EMPLOYEE_UNIQUE_CONFLICT",

          message:
            "The employee could not be created because a unique employee record already exists.",
        });
      }

      return res.status(500).json({
        status:
          "error",

        message:
          "Unable to create employee.",
      });
    }
  }
);


/*
============================================================
DESIGNATION_LIFECYCLE_API
CONTROLLED DESIGNATION ACTIVATION / DEACTIVATION
============================================================

Routes:

PATCH
/api/employees/career/designations/:designationId/deactivate

PATCH
/api/employees/career/designations/:designationId/reactivate

GET
/api/employees/career/designations/:designationId/lifecycle

Rules:

- Tenant scoped.
- Designation IDs are preserved.
- Deactivation requires a reason and effective date.
- Current employees prevent deactivation.
- Active dependent reporting designations prevent deactivation.
- Reactivation does not recreate the designation.
- Every state change creates a DesignationLifecycleEvent.
============================================================
*/


/*
============================================================
DEACTIVATE DESIGNATION
============================================================
*/

router.patch(
  "/career/designations/:designationId/deactivate",
  requirePermission(
    "employees.update"
  ),
  async (req, res) => {
    try {
      const organizationId =
        req.auth.organizationId;

      const performedByUserId =
        req.auth.userId || null;

      const {
        designationId,
      } = req.params;

      const {
        reason,
        notes,
        effectiveDate,
      } = req.body || {};


      /*
      ----------------------------------------------------------
      VALIDATE INPUT
      ----------------------------------------------------------
      */

      const normalizedReason =
        String(
          reason || ""
        ).trim();

      if (!normalizedReason) {
        return res.status(400).json({
          status:
            "error",

          code:
            "DESIGNATION_LIFECYCLE_REASON_REQUIRED",

          message:
            "A reason is required to deactivate a designation.",
        });
      }


      const normalizedEffectiveDate =
        effectiveDate
          ? new Date(
              effectiveDate
            )
          : new Date();


      if (
        Number.isNaN(
          normalizedEffectiveDate.getTime()
        )
      ) {
        return res.status(400).json({
          status:
            "error",

          code:
            "INVALID_EFFECTIVE_DATE",

          message:
            "Provide a valid effective date.",
        });
      }


      /*
      ----------------------------------------------------------
      LOAD TENANT DESIGNATION
      ----------------------------------------------------------
      */

      const designation =
        await prisma.designation.findFirst({
          where: {
            id:
              designationId,

            organizationId,
          },

          include: {
            department: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },

            reportsToDesignation: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        });


      if (!designation) {
        return res.status(404).json({
          status:
            "error",

          code:
            "DESIGNATION_NOT_FOUND",

          message:
            "Designation not found.",
        });
      }


      /*
      ----------------------------------------------------------
      IDEMPOTENT BEHAVIOUR
      ----------------------------------------------------------
      */

      if (
        designation.isActive ===
        false
      ) {
        return res.status(200).json({
          status:
            "success",

          message:
            `${designation.name} is already inactive.`,

          data:
            designation,
        });
      }


      /*
      ----------------------------------------------------------
      CHECK CURRENT EMPLOYEES
      ----------------------------------------------------------

      These statuses still represent an employee currently
      occupying an organizational position:

      ACTIVE
      PROBATION
      LEAVE
      SUSPENDED

      Exit / non-current statuses do not block designation
      deactivation.
      ----------------------------------------------------------
      */

      const currentEmployeeStatuses =
        [
          "ACTIVE",
          "PROBATION",
          "LEAVE",
          "SUSPENDED",
        ];


      const assignedEmployees =
        await prisma.employee.findMany({
          where: {
            organizationId,

            designationId:
              designation.id,

            status: {
              in:
                currentEmployeeStatuses,
            },
          },

          select: {
            id: true,
            employeeNumber: true,
            firstName: true,
            middleName: true,
            lastName: true,
            status: true,
          },

          orderBy: [
            {
              lastName:
                "asc",
            },
            {
              firstName:
                "asc",
            },
          ],
        });


      if (
        assignedEmployees.length >
        0
      ) {
        return res.status(409).json({
          status:
            "error",

          code:
            "DESIGNATION_HAS_CURRENT_EMPLOYEES",

          message:
            `${designation.name} cannot be deactivated because ${assignedEmployees.length} current employee(s) are assigned to it. Transfer, promote, exit, or reassign those employees first.`,

          dependencies: {
            employees:
              assignedEmployees,
          },
        });
      }


      /*
      ----------------------------------------------------------
      CHECK ACTIVE REPORTING DEPENDENCIES
      ----------------------------------------------------------

      A designation cannot be deactivated while active
      subordinate designations still report directly to it.

      The reporting hierarchy must first be updated.
      ----------------------------------------------------------
      */

      const dependentDesignations =
        await prisma.designation.findMany({
          where: {
            organizationId,

            reportsToDesignationId:
              designation.id,

            isActive:
              true,
          },

          select: {
            id: true,
            name: true,
            code: true,
            careerTrack: true,
            careerLevel: true,
            departmentId: true,
          },

          orderBy: {
            name:
              "asc",
          },
        });


      if (
        dependentDesignations.length >
        0
      ) {
        return res.status(409).json({
          status:
            "error",

          code:
            "DESIGNATION_HAS_ACTIVE_REPORTING_DEPENDENCIES",

          message:
            `${designation.name} cannot be deactivated because ${dependentDesignations.length} active designation(s) currently report to it. Update or deactivate those reporting positions first.`,

          dependencies: {
            designations:
              dependentDesignations,
          },
        });
      }


      /*
      ----------------------------------------------------------
      TRANSACTION
      ----------------------------------------------------------
      */

      const result =
        await prisma.$transaction(
          async (tx) => {
            const updatedDesignation =
              await tx.designation.update({
                where: {
                  id:
                    designation.id,
                },

                data: {
                  isActive:
                    false,
                },

                include: {
                  department: {
                    select: {
                      id: true,
                      name: true,
                      code: true,
                    },
                  },

                  reportsToDesignation: {
                    select: {
                      id: true,
                      name: true,
                      code: true,
                    },
                  },
                },
              });


            const lifecycleEvent =
              await tx.designationLifecycleEvent.create({
                data: {
                  organizationId,

                  designationId:
                    designation.id,

                  eventType:
                    "DEACTIVATED",

                  previousIsActive:
                    true,

                  newIsActive:
                    false,

                  effectiveDate:
                    normalizedEffectiveDate,

                  reason:
                    normalizedReason,

                  notes:
                    notes
                      ? String(
                          notes
                        ).trim() ||
                        null
                      : null,

                  performedByUserId,
                },

                include: {
                  performedBy: {
                    select: {
                      id: true,
                      firstName: true,
                      lastName: true,
                      email: true,
                    },
                  },
                },
              });


            return {
              designation:
                updatedDesignation,

              lifecycleEvent,
            };
          }
        );


      return res.status(200).json({
        status:
          "success",

        message:
          `${designation.name} was deactivated successfully.`,

        data:
          result,
      });
    } catch (error) {
      console.error(
        "Designation deactivation error:",
        error
      );

      return res.status(500).json({
        status:
          "error",

        message:
          "Unable to deactivate the designation.",
      });
    }
  }
);


/*
============================================================
REACTIVATE DESIGNATION
============================================================
*/

router.patch(
  "/career/designations/:designationId/reactivate",
  requirePermission(
    "employees.update"
  ),
  async (req, res) => {
    try {
      const organizationId =
        req.auth.organizationId;

      const performedByUserId =
        req.auth.userId || null;

      const {
        designationId,
      } = req.params;

      const {
        reason,
        notes,
        effectiveDate,
      } = req.body || {};


      const normalizedReason =
        String(
          reason || ""
        ).trim();


      if (!normalizedReason) {
        return res.status(400).json({
          status:
            "error",

          code:
            "DESIGNATION_LIFECYCLE_REASON_REQUIRED",

          message:
            "A reason is required to reactivate a designation.",
        });
      }


      const normalizedEffectiveDate =
        effectiveDate
          ? new Date(
              effectiveDate
            )
          : new Date();


      if (
        Number.isNaN(
          normalizedEffectiveDate.getTime()
        )
      ) {
        return res.status(400).json({
          status:
            "error",

          code:
            "INVALID_EFFECTIVE_DATE",

          message:
            "Provide a valid effective date.",
        });
      }


      const designation =
        await prisma.designation.findFirst({
          where: {
            id:
              designationId,

            organizationId,
          },

          include: {
            department: {
              select: {
                id: true,
                name: true,
                code: true,
                isActive: true,
              },
            },
          },
        });


      if (!designation) {
        return res.status(404).json({
          status:
            "error",

          code:
            "DESIGNATION_NOT_FOUND",

          message:
            "Designation not found.",
        });
      }


      if (
        designation.isActive ===
        true
      ) {
        return res.status(200).json({
          status:
            "success",

          message:
            `${designation.name} is already active.`,

          data:
            designation,
        });
      }


      /*
      ----------------------------------------------------------
      DEPARTMENT PROTECTION
      ----------------------------------------------------------

      If the designation is still mapped, its owning department
      must itself remain active.
      ----------------------------------------------------------
      */

      if (
        designation.department &&
        designation.department.isActive ===
          false
      ) {
        return res.status(409).json({
          status:
            "error",

          code:
            "DESIGNATION_DEPARTMENT_INACTIVE",

          message:
            `${designation.name} cannot be reactivated because its department is inactive.`,
        });
      }


      const result =
        await prisma.$transaction(
          async (tx) => {
            const updatedDesignation =
              await tx.designation.update({
                where: {
                  id:
                    designation.id,
                },

                data: {
                  isActive:
                    true,
                },

                include: {
                  department: {
                    select: {
                      id: true,
                      name: true,
                      code: true,
                    },
                  },

                  reportsToDesignation: {
                    select: {
                      id: true,
                      name: true,
                      code: true,
                    },
                  },
                },
              });


            const lifecycleEvent =
              await tx.designationLifecycleEvent.create({
                data: {
                  organizationId,

                  designationId:
                    designation.id,

                  eventType:
                    "ACTIVATED",

                  previousIsActive:
                    false,

                  newIsActive:
                    true,

                  effectiveDate:
                    normalizedEffectiveDate,

                  reason:
                    normalizedReason,

                  notes:
                    notes
                      ? String(
                          notes
                        ).trim() ||
                        null
                      : null,

                  performedByUserId,
                },

                include: {
                  performedBy: {
                    select: {
                      id: true,
                      firstName: true,
                      lastName: true,
                      email: true,
                    },
                  },
                },
              });


            return {
              designation:
                updatedDesignation,

              lifecycleEvent,
            };
          }
        );


      return res.status(200).json({
        status:
          "success",

        message:
          `${designation.name} was reactivated successfully.`,

        data:
          result,
      });
    } catch (error) {
      console.error(
        "Designation reactivation error:",
        error
      );

      return res.status(500).json({
        status:
          "error",

        message:
          "Unable to reactivate the designation.",
      });
    }
  }
);


/*
============================================================
DESIGNATION LIFECYCLE HISTORY
============================================================
*/

router.get(
  "/career/designations/:designationId/lifecycle",
  requirePermission(
    "employees.view"
  ),
  async (req, res) => {
    try {
      const organizationId =
        req.auth.organizationId;

      const {
        designationId,
      } = req.params;


      const designation =
        await prisma.designation.findFirst({
          where: {
            id:
              designationId,

            organizationId,
          },

          select: {
            id: true,
            name: true,
            code: true,
            isActive: true,
            careerTrack: true,
            careerLevel: true,

            department: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        });


      if (!designation) {
        return res.status(404).json({
          status:
            "error",

          message:
            "Designation not found.",
        });
      }


      const history =
        await prisma.designationLifecycleEvent.findMany({
          where: {
            organizationId,

            designationId:
              designation.id,
          },

          include: {
            performedBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },

          orderBy: [
            {
              effectiveDate:
                "desc",
            },
            {
              createdAt:
                "desc",
            },
          ],
        });


      return res.status(200).json({
        status:
          "success",

        data: {
          designation,
          history,
        },
      });
    } catch (error) {
      console.error(
        "Designation lifecycle history error:",
        error
      );

      return res.status(500).json({
        status:
          "error",

        message:
          "Unable to load designation lifecycle history.",
      });
    }
  }
);

module.exports = router;