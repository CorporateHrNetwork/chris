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
        hireDate,
        confirmationDate,
        exitDate,
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
          "Employee updated successfully.",

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
SUSPEND EMPLOYEE
Permission: employees.update
============================================================

Suspension:
- preserves employee history
- sets Employee to SUSPENDED
- disables linked CHRIS User
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
        EXIT_STATUSES.includes(
          existingEmployee.status
        )
      ) {
        return res.status(400).json({
          status: "error",

          message:
            "An exited employee cannot be suspended.",
        });
      }

      if (
        existingEmployee.status ===
        "SUSPENDED"
      ) {
        return res.status(400).json({
          status: "error",

          message:
            "Employee is already suspended.",
        });
      }

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
                },

                include: {
                  department: true,
                  designation: true,
                  location: true,
                },
              });

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
                  isActive: false,
                },
              });
            }

            await tx.employeeLifecycleEvent.create({
              data: {
                organizationId,

                employeeId:
                  existingEmployee.id,

                eventType:
                  "SUSPENDED",

                effectiveDate:
                  new Date(),

                previousStatus:
                  existingEmployee.status,

                newStatus:
                  "SUSPENDED",

                fromLocationId:
                  existingEmployee.locationId,

                toLocationId:
                  existingEmployee.locationId,

                performedByUserId:
                  req.auth.userId,
              },
            });

            return updatedEmployee;
          }
        );

      return res.status(200).json({
        status: "success",

        message:
          "Employee suspended successfully. Linked CHRIS access has been disabled.",

        data: employee,
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

Use for a non-exit inactive employee.
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
        EXIT_STATUSES.includes(
          existingEmployee.status
        )
      ) {
        return res.status(400).json({
          status: "error",

          message:
            "An exited employee cannot be deactivated through this action.",
        });
      }

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
                  department: true,
                  designation: true,
                  location: true,
                },
              });

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
                  isActive: false,
                },
              });
            }

            await tx.employeeLifecycleEvent.create({
              data: {
                organizationId,

                employeeId:
                  existingEmployee.id,

                eventType:
                  "DEACTIVATED",

                effectiveDate:
                  new Date(),

                previousStatus:
                  existingEmployee.status,

                newStatus:
                  "INACTIVE",

                fromLocationId:
                  existingEmployee.locationId,

                toLocationId:
                  existingEmployee.locationId,

                performedByUserId:
                  req.auth.userId,
              },
            });

            return updatedEmployee;
          }
        );

      return res.status(200).json({
        status: "success",

        message:
          "Employee deactivated successfully. Linked CHRIS access has been disabled.",

        data: employee,
      });
    } catch (error) {
      console.error(
        "Employee deactivation error:",
        error
      );

      return res.status(500).json({
        status: "error",

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

Expected body:

{
  "exitStatus": "RESIGNED",
  "exitDate": "2026-08-09"
}

Allowed:
RESIGNED
TERMINATED
RETIRED
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
      } = req.body;

      if (
        !EXIT_STATUSES.includes(
          exitStatus
        )
      ) {
        return res.status(400).json({
          status: "error",

          message:
            "Select a valid exit type: Resigned, Terminated or Retired.",
        });
      }

      if (!exitDate) {
        return res.status(400).json({
          status: "error",

          message:
            "Exit date is required.",
        });
      }

      const parsedExitDate =
        new Date(exitDate);

      if (
        Number.isNaN(
          parsedExitDate.getTime()
        )
      ) {
        return res.status(400).json({
          status: "error",

          message:
            "Enter a valid exit date.",
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
                    exitStatus,

                  exitDate:
                    parsedExitDate,
                },

                include: {
                  department: true,
                  designation: true,
                  location: true,
                },
              });

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
                  isActive: false,
                },
              });
            }

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

                performedByUserId:
                  req.auth.userId,
              },
            });

            return updatedEmployee;
          }
        );

      return res.status(200).json({
        status: "success",

        message:
          "Employee exit recorded successfully. Linked CHRIS access has been disabled.",

        data: employee,
      });
    } catch (error) {
      console.error(
        "Employee exit error:",
        error
      );

      return res.status(500).json({
        status: "error",

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

This is for SUSPENDED or INACTIVE employees.

Exited employees are intentionally excluded.
Rehire should later be handled separately.
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
        EXIT_STATUSES.includes(
          existingEmployee.status
        )
      ) {
        return res.status(400).json({
          status: "error",

          message:
            "Exited employees cannot be reactivated here. Use the future Rehire process.",
        });
      }

      if (
        ![
          "SUSPENDED",
          "INACTIVE",
        ].includes(
          existingEmployee.status
        )
      ) {
        return res.status(400).json({
          status: "error",

          message:
            "Only suspended or inactive employees can be reactivated.",
        });
      }

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
                },

                include: {
                  department: true,
                  designation: true,
                  location: true,
                },
              });

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
                  isActive: true,
                },
              });
            }

            await tx.employeeLifecycleEvent.create({
              data: {
                organizationId,

                employeeId:
                  existingEmployee.id,

                eventType:
                  "REACTIVATED",

                effectiveDate:
                  new Date(),

                previousStatus:
                  existingEmployee.status,

                newStatus:
                  "ACTIVE",

                fromLocationId:
                  existingEmployee.locationId,

                toLocationId:
                  existingEmployee.locationId,

                performedByUserId:
                  req.auth.userId,
              },
            });

            return updatedEmployee;
          }
        );

      return res.status(200).json({
        status: "success",

        message:
          "Employee reactivated successfully.",

        data: employee,
      });
    } catch (error) {
      console.error(
        "Employee reactivation error:",
        error
      );

      return res.status(500).json({
        status: "error",

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

            isActive:
              true,
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
        careerTrack,
        careerLevel,
        reportsToDesignationId,
      } = req.body || {};


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
            careerTrack:
              normalizedCareerTrack,

            careerLevel:
              normalizedCareerLevel,

            reportsToDesignationId:
              normalizedReportsToId,
          },

          select: {
            id: true,
            name: true,
            code: true,
            isActive: true,
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
          "Designation career position configured successfully.",

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
PROMOTE EMPLOYEE â€” CAREER PROGRESSION
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
        department,
        designation,
        email,
        phone,
        status = "Active",
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
          },
        });

      if (duplicateEmail) {
        return res.status(409).json({
          status: "error",

          message:
            "An employee with this email address already exists.",
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
            "Please enter at least the employee's first and last name.",
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

      const latestEmployee =
        await prisma.employee.findFirst({
          where: {
            organizationId,

            employeeNumber: {
              startsWith: "CHR",
            },
          },

          orderBy: {
            employeeNumber:
              "desc",
          },

          select: {
            employeeNumber: true,
          },
        });

      let nextNumber = 1;

      if (
        latestEmployee?.employeeNumber
      ) {
        const numericPart =
          Number(
            latestEmployee.employeeNumber.replace(
              /\D/g,
              ""
            )
          );

        if (
          Number.isFinite(
            numericPart
          )
        ) {
          nextNumber =
            numericPart + 1;
        }
      }

      const employeeNumber =
        `CHR${String(
          nextNumber
        ).padStart(6, "0")}`;

      const employee =
        await prisma.employee.create({
          data: {
            organizationId,

            departmentId:
              departmentRecord.id,

            designationId:
              designationRecord.id,

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

            status:
              STATUS_MAP[status] ||
              "ACTIVE",
          },

          include: {
            department: true,
            designation: true,
            location: true,
          },
        });

      return res.status(201).json({
        status: "success",

        message:
          "Employee created successfully.",

        data: employee,
      });
    } catch (error) {
      console.error(
        "Employee creation error:",
        error
      );

      if (
        error.code === "P2002"
      ) {
        return res.status(409).json({
          status: "error",

          message:
            "The employee could not be created because a unique employee record already exists.",
        });
      }

      return res.status(500).json({
        status: "error",

        message:
          "Unable to create employee.",
      });
    }
  }
);

module.exports = router;





