const express = require("express");
const bcrypt = require("bcryptjs");

const prisma = require("../config/prisma");

const {
  requireAuth,
  requirePermission,
} = require("../middleware/authMiddleware");

const router = express.Router();

/*
============================================================
CHRIS USER MANAGEMENT
============================================================

Identity model:

Employee = HR / employment master record
User     = CHRIS login and authorization account

Normal users must originate from an Employee record.

Special bootstrap Administrator accounts may exist without
an employeeId during organization setup.

Security:
- Authentication required for every route.
- Every query is tenant-scoped.
- users.view controls User read access.
- users.manage controls account management.
============================================================
*/

router.use(requireAuth);

const BLOCKED_EMPLOYEE_STATUSES = [
  "TERMINATED",
  "RESIGNED",
  "RETIRED",
  "INACTIVE",
];

/*
============================================================
HELPERS
============================================================
*/

function formatUser(user) {
  return {
    id: user.id,

    employeeId:
      user.employeeId || null,

    email: user.email,

    firstName:
      user.firstName,

    lastName:
      user.lastName,

    isActive:
      user.isActive,

    createdAt:
      user.createdAt,

    updatedAt:
      user.updatedAt,

    employee:
      user.employee || null,

    roles:
      (user.userRoles || []).map(
        (userRole) =>
          userRole.role
      ),
  };
}

const userSelect = {
  id: true,
  employeeId: true,
  email: true,
  firstName: true,
  lastName: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,

  employee: {
    select: {
      id: true,
      employeeNumber: true,
      firstName: true,
      middleName: true,
      lastName: true,
      email: true,
      phone: true,
      status: true,

      department: {
        select: {
          id: true,
          name: true,
        },
      },

      designation: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },

  userRoles: {
    select: {
      role: {
        select: {
          id: true,
          name: true,
          description: true,
          isSystemRole: true,
        },
      },
    },
  },
};

/*
============================================================
GET ALL USERS
Permission: users.view
============================================================
*/
router.get(
  "/",
  requirePermission("users.view"),
  async (req, res) => {
    try {
      const organizationId =
        req.auth.organizationId;

      const users =
        await prisma.user.findMany({
          where: {
            organizationId,
          },

          select: userSelect,

          orderBy: [
            {
              firstName: "asc",
            },
            {
              lastName: "asc",
            },
            {
              email: "asc",
            },
          ],
        });

      return res.status(200).json({
        status: "success",

        results:
          users.length,

        data:
          users.map(formatUser),
      });
    } catch (error) {
      console.error(
        "User fetch error:",
        error
      );

      return res.status(500).json({
        status: "error",

        message:
          "Unable to fetch CHRIS users.",
      });
    }
  }
);

/*
============================================================
GET EMPLOYEES ELIGIBLE FOR CHRIS ACCESS
Permission: users.manage

Returns employees who:
- belong to this organization
- have a usable email
- do not already have a User
- are not in an ended/inactive employment status
============================================================
*/
router.get(
  "/eligible-employees",
  requirePermission("users.manage"),
  async (req, res) => {
    try {
      const organizationId =
        req.auth.organizationId;

      const employees =
        await prisma.employee.findMany({
          where: {
            organizationId,

            status: {
              notIn:
                BLOCKED_EMPLOYEE_STATUSES,
            },
          },

          select: {
            id: true,
            employeeNumber: true,
            firstName: true,
            middleName: true,
            lastName: true,
            email: true,
            phone: true,
            status: true,

            department: {
              select: {
                id: true,
                name: true,
              },
            },

            designation: {
              select: {
                id: true,
                name: true,
              },
            },

            user: {
              select: {
                id: true,
              },
            },
          },

          orderBy: [
            {
              firstName: "asc",
            },
            {
              lastName: "asc",
            },
          ],
        });

      const eligibleEmployees =
        employees.filter(
          (employee) =>
            !employee.user &&
            Boolean(
              employee.email?.trim()
            )
        );

      return res.status(200).json({
        status: "success",

        results:
          eligibleEmployees.length,

        data:
          eligibleEmployees,
      });
    } catch (error) {
      console.error(
        "Eligible employee fetch error:",
        error
      );

      return res.status(500).json({
        status: "error",

        message:
          "Unable to fetch employees eligible for CHRIS access.",
      });
    }
  }
);

/*
============================================================
CREATE USER
Permission: users.manage

Normal CHRIS users MUST originate from Employee.

Frontend supplies:
- employeeId
- temporaryPassword
- roleIds

Name and email come from Employee.
============================================================
*/
router.post(
  "/",
  requirePermission("users.manage"),
  async (req, res) => {
    try {
      const organizationId =
        req.auth.organizationId;

      const {
        employeeId,
        temporaryPassword,
        roleIds,
      } = req.body;

      if (
        !employeeId ||
        !temporaryPassword
      ) {
        return res.status(400).json({
          status: "error",

          message:
            "Employee and temporary password are required.",
        });
      }

      if (
        typeof temporaryPassword !==
          "string" ||
        temporaryPassword.length < 10
      ) {
        return res.status(400).json({
          status: "error",

          message:
            "Temporary password must contain at least 10 characters.",
        });
      }

      if (
        !Array.isArray(roleIds) ||
        roleIds.length === 0
      ) {
        return res.status(400).json({
          status: "error",

          message:
            "Assign at least one role to the user.",
        });
      }

      /*
      ------------------------------------------------------------
      FIND EMPLOYEE INSIDE CURRENT TENANT
      ------------------------------------------------------------
      */

      const employee =
        await prisma.employee.findFirst({
          where: {
            id: employeeId,
            organizationId,
          },

          select: {
            id: true,
            employeeNumber: true,
            firstName: true,
            middleName: true,
            lastName: true,
            email: true,
            phone: true,
            status: true,

            department: {
              select: {
                id: true,
                name: true,
              },
            },

            designation: {
              select: {
                id: true,
                name: true,
              },
            },

            user: {
              select: {
                id: true,
                email: true,
                isActive: true,
              },
            },
          },
        });

      if (!employee) {
        return res.status(404).json({
          status: "error",

          message:
            "Employee record not found for this organization.",
        });
      }

      /*
      ------------------------------------------------------------
      EMPLOYMENT STATUS
      ------------------------------------------------------------
      */

      if (
        BLOCKED_EMPLOYEE_STATUSES.includes(
          employee.status
        )
      ) {
        return res.status(400).json({
          status: "error",

          message:
            `A CHRIS account cannot be created for an employee with ${employee.status.toLowerCase()} status.`,
        });
      }

      /*
      ------------------------------------------------------------
      EMPLOYEE EMAIL
      ------------------------------------------------------------
      */

      if (!employee.email?.trim()) {
        return res.status(400).json({
          status: "error",

          message:
            "This employee does not have an email address. Add an employee email before creating CHRIS access.",
        });
      }

      /*
      ------------------------------------------------------------
      ONE EMPLOYEE = ONE USER
      ------------------------------------------------------------
      */

      if (employee.user) {
        return res.status(409).json({
          status: "error",

          message:
            "This employee already has a CHRIS user account.",
        });
      }

      const normalizedEmail =
        employee.email
          .trim()
          .toLowerCase();

      /*
      ------------------------------------------------------------
      EMAIL COLLISION CHECK

      Handles old/bootstrap accounts that may already use the
      Employee's email while still having employeeId = null.
      ------------------------------------------------------------
      */

      const existingEmailUser =
        await prisma.user.findFirst({
          where: {
            organizationId,
            email: normalizedEmail,
          },

          select: {
            id: true,
            employeeId: true,
          },
        });

      if (existingEmailUser) {
        return res.status(409).json({
          status: "error",

          message:
            "A CHRIS user with this employee's email address already exists.",
        });
      }

      /*
      ------------------------------------------------------------
      VALIDATE ROLES
      ------------------------------------------------------------
      */

      const uniqueRoleIds = [
        ...new Set(roleIds),
      ];

      const validRoles =
        await prisma.role.findMany({
          where: {
            organizationId,

            id: {
              in: uniqueRoleIds,
            },
          },

          select: {
            id: true,
          },
        });

      if (
        validRoles.length !==
        uniqueRoleIds.length
      ) {
        return res.status(400).json({
          status: "error",

          message:
            "One or more selected roles are invalid for this organization.",
        });
      }

      /*
      ------------------------------------------------------------
      HASH TEMPORARY PASSWORD
      ------------------------------------------------------------
      */

      const passwordHash =
        await bcrypt.hash(
          temporaryPassword,
          12
        );

      /*
      ------------------------------------------------------------
      CREATE USER FROM EMPLOYEE MASTER DATA
      ------------------------------------------------------------
      */

      const user =
        await prisma.user.create({
          data: {
            organizationId,

            employeeId:
              employee.id,

            email:
              normalizedEmail,

            firstName:
              employee.firstName,

            lastName:
              employee.lastName,

            passwordHash,

            isActive: true,

            userRoles: {
              create:
                uniqueRoleIds.map(
                  (roleId) => ({
                    roleId,
                  })
                ),
            },
          },

          select:
            userSelect,
        });

      return res.status(201).json({
        status: "success",

        message:
          "CHRIS user account created from employee record successfully.",

        data:
          formatUser(user),
      });
    } catch (error) {
      console.error(
        "User creation error:",
        error
      );

      if (error.code === "P2002") {
        return res.status(409).json({
          status: "error",

          message:
            "This employee already has a CHRIS user account, or the employee email is already assigned to another CHRIS user.",
        });
      }

      return res.status(500).json({
        status: "error",

        message:
          "Unable to create CHRIS user.",
      });
    }
  }
);

/*
============================================================
UPDATE USER
Permission: users.manage

Employee-linked account:
- identity comes from Employee
- User Management changes roles/access only
- name/email are re-synchronised from Employee

Bootstrap account:
- no employeeId
- name/email may still be maintained here
============================================================
*/
router.put(
  "/:userId",
  requirePermission("users.manage"),
  async (req, res) => {
    try {
      const organizationId =
        req.auth.organizationId;

      const {
        userId,
      } = req.params;

      const {
        firstName,
        lastName,
        email,
        roleIds,
      } = req.body;

      if (
        !Array.isArray(roleIds) ||
        roleIds.length === 0
      ) {
        return res.status(400).json({
          status: "error",

          message:
            "Assign at least one role to the user.",
        });
      }

      const existingUser =
        await prisma.user.findFirst({
          where: {
            id: userId,
            organizationId,
          },

          select: {
            id: true,
            employeeId: true,
            email: true,
            firstName: true,
            lastName: true,

            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                status: true,
              },
            },
          },
        });

      if (!existingUser) {
        return res.status(404).json({
          status: "error",

          message:
            "CHRIS user not found.",
        });
      }

      /*
      ------------------------------------------------------------
      SELF ROLE PROTECTION
      ------------------------------------------------------------
      */

      if (
        userId === req.auth.userId
      ) {
        return res.status(400).json({
          status: "error",

          message:
            "You cannot change your own role assignments from User Management.",
        });
      }

      /*
      ------------------------------------------------------------
      VALIDATE ROLES
      ------------------------------------------------------------
      */

      const uniqueRoleIds = [
        ...new Set(roleIds),
      ];

      const validRoles =
        await prisma.role.findMany({
          where: {
            organizationId,

            id: {
              in: uniqueRoleIds,
            },
          },

          select: {
            id: true,
          },
        });

      if (
        validRoles.length !==
        uniqueRoleIds.length
      ) {
        return res.status(400).json({
          status: "error",

          message:
            "One or more selected roles are invalid for this organization.",
        });
      }

      let identityUpdate = {};

      /*
      ------------------------------------------------------------
      EMPLOYEE-LINKED USER

      Employee remains the identity authority.
      ------------------------------------------------------------
      */

      if (
        existingUser.employeeId
      ) {
        const employee =
          existingUser.employee;

        if (!employee) {
          return res.status(409).json({
            status: "error",

            message:
              "The Employee record linked to this CHRIS account is unavailable.",
          });
        }

        if (!employee.email?.trim()) {
          return res.status(400).json({
            status: "error",

            message:
              "The linked employee does not have an email address.",
          });
        }

        const canonicalEmail =
          employee.email
            .trim()
            .toLowerCase();

        const duplicateEmail =
          await prisma.user.findFirst({
            where: {
              organizationId,

              email:
                canonicalEmail,

              NOT: {
                id: userId,
              },
            },

            select: {
              id: true,
            },
          });

        if (duplicateEmail) {
          return res.status(409).json({
            status: "error",

            message:
              "Another CHRIS user already uses the linked employee's email address.",
          });
        }

        identityUpdate = {
          firstName:
            employee.firstName,

          lastName:
            employee.lastName,

          email:
            canonicalEmail,
        };
      } else {
        /*
        ----------------------------------------------------------
        BOOTSTRAP / UNLINKED ACCOUNT

        These special setup accounts may still maintain their
        identity directly until linked or retired.
        ----------------------------------------------------------
        */

        if (
          !firstName?.trim() ||
          !lastName?.trim() ||
          !email?.trim()
        ) {
          return res.status(400).json({
            status: "error",

            message:
              "First name, last name and email are required for an unlinked Administrator account.",
          });
        }

        const normalizedEmail =
          email
            .trim()
            .toLowerCase();

        const duplicateEmail =
          await prisma.user.findFirst({
            where: {
              organizationId,

              email:
                normalizedEmail,

              NOT: {
                id: userId,
              },
            },

            select: {
              id: true,
            },
          });

        if (duplicateEmail) {
          return res.status(409).json({
            status: "error",

            message:
              "Another CHRIS user already uses this email address.",
          });
        }

        identityUpdate = {
          firstName:
            firstName.trim(),

          lastName:
            lastName.trim(),

          email:
            normalizedEmail,
        };
      }

      /*
      ------------------------------------------------------------
      UPDATE USER + REPLACE ROLE ASSIGNMENTS
      ------------------------------------------------------------
      */

      await prisma.$transaction(
        async (tx) => {
          await tx.user.update({
            where: {
              id: userId,
            },

            data:
              identityUpdate,
          });

          await tx.userRole.deleteMany({
            where: {
              userId,
            },
          });

          await tx.userRole.createMany({
            data:
              uniqueRoleIds.map(
                (roleId) => ({
                  userId,
                  roleId,
                })
              ),
          });
        }
      );

      const updatedUser =
        await prisma.user.findFirst({
          where: {
            id: userId,
            organizationId,
          },

          select:
            userSelect,
        });

      return res.status(200).json({
        status: "success",

        message:
          existingUser.employeeId
            ? "CHRIS user roles updated successfully. User identity remains synchronized with the Employee record."
            : "CHRIS bootstrap user updated successfully.",

        data:
          formatUser(
            updatedUser
          ),
      });
    } catch (error) {
      console.error(
        "User update error:",
        error
      );

      if (error.code === "P2002") {
        return res.status(409).json({
          status: "error",

          message:
            "Unable to update user because the employee or email is already linked to another CHRIS account.",
        });
      }

      return res.status(500).json({
        status: "error",

        message:
          "Unable to update CHRIS user.",
      });
    }
  }
);

/*
============================================================
ACTIVATE / DEACTIVATE USER
Permission: users.manage
============================================================
*/
router.patch(
  "/:userId/status",
  requirePermission("users.manage"),
  async (req, res) => {
    try {
      const organizationId =
        req.auth.organizationId;

      const {
        userId,
      } = req.params;

      const {
        isActive,
      } = req.body;

      if (
        typeof isActive !==
        "boolean"
      ) {
        return res.status(400).json({
          status: "error",

          message:
            "isActive must be true or false.",
        });
      }

      const existingUser =
        await prisma.user.findFirst({
          where: {
            id: userId,
            organizationId,
          },

          select: {
            id: true,
            isActive: true,
            employeeId: true,

            employee: {
              select: {
                id: true,
                status: true,
              },
            },
          },
        });

      if (!existingUser) {
        return res.status(404).json({
          status: "error",

          message:
            "CHRIS user not found.",
        });
      }

      /*
      ------------------------------------------------------------
      SELF-DEACTIVATION PROTECTION
      ------------------------------------------------------------
      */

      if (
        userId ===
          req.auth.userId &&
        isActive === false
      ) {
        return res.status(400).json({
          status: "error",

          message:
            "You cannot deactivate your own CHRIS account.",
        });
      }

      /*
      ------------------------------------------------------------
      EMPLOYEE STATUS PROTECTION ON REACTIVATION

      An ended/inactive employee must not regain CHRIS access.
      ------------------------------------------------------------
      */

      if (
        isActive === true &&
        existingUser.employeeId &&
        existingUser.employee &&
        BLOCKED_EMPLOYEE_STATUSES.includes(
          existingUser.employee.status
        )
      ) {
        return res.status(400).json({
          status: "error",

          message:
            `This account cannot be activated because the linked employee has ${existingUser.employee.status.toLowerCase()} status.`,
        });
      }

      const user =
        await prisma.user.update({
          where: {
            id: userId,
          },

          data: {
            isActive,
          },

          select:
            userSelect,
        });

      return res.status(200).json({
        status: "success",

        message:
          isActive
            ? "CHRIS user activated successfully."
            : "CHRIS user deactivated successfully.",

        data:
          formatUser(user),
      });
    } catch (error) {
      console.error(
        "User status update error:",
        error
      );

      return res.status(500).json({
        status: "error",

        message:
          "Unable to update CHRIS user status.",
      });
    }
  }
);

module.exports = router;