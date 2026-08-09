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