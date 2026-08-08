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
USER MANAGEMENT ROUTES
============================================================

Security:
- All routes require authentication.
- Every query is scoped to req.auth.organizationId.
- users.view controls read access.
- users.manage controls create/update/status changes.
*/

router.use(requireAuth);

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

          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,

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
          },

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

      const formattedUsers =
        users.map((user) => ({
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          isActive: user.isActive,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,

          roles:
            user.userRoles.map(
              (userRole) =>
                userRole.role
            ),
        }));

      return res.status(200).json({
        status: "success",
        results:
          formattedUsers.length,
        data: formattedUsers,
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
CREATE USER
Permission: users.manage
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
        firstName,
        lastName,
        email,
        temporaryPassword,
        roleIds,
      } = req.body;

      if (
        !firstName?.trim() ||
        !lastName?.trim() ||
        !email?.trim() ||
        !temporaryPassword
      ) {
        return res.status(400).json({
          status: "error",
          message:
            "First name, last name, email and temporary password are required.",
        });
      }

      if (
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

      const normalizedEmail =
        email
          .trim()
          .toLowerCase();

      const existingUser =
        await prisma.user.findFirst({
          where: {
            organizationId,
            email: normalizedEmail,
          },

          select: {
            id: true,
          },
        });

      if (existingUser) {
        return res.status(409).json({
          status: "error",
          message:
            "A CHRIS user with this email address already exists.",
        });
      }

      const uniqueRoleIds =
        [...new Set(roleIds)];

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
            name: true,
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

      const passwordHash =
        await bcrypt.hash(
          temporaryPassword,
          12
        );

      const user =
        await prisma.user.create({
          data: {
            organizationId,
            firstName:
              firstName.trim(),
            lastName:
              lastName.trim(),
            email:
              normalizedEmail,
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

          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            isActive: true,
            createdAt: true,

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
          },
        });

      return res.status(201).json({
        status: "success",
        message:
          "CHRIS user created successfully.",

        data: {
          id: user.id,
          email: user.email,
          firstName:
            user.firstName,
          lastName:
            user.lastName,
          isActive:
            user.isActive,
          createdAt:
            user.createdAt,

          roles:
            user.userRoles.map(
              (userRole) =>
                userRole.role
            ),
        },
      });
    } catch (error) {
      console.error(
        "User creation error:",
        error
      );

      if (
        error.code === "P2002"
      ) {
        return res.status(409).json({
          status: "error",
          message:
            "A CHRIS user with this email address already exists.",
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
        !firstName?.trim() ||
        !lastName?.trim() ||
        !email?.trim()
      ) {
        return res.status(400).json({
          status: "error",
          message:
            "First name, last name and email are required.",
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

      const existingUser =
        await prisma.user.findFirst({
          where: {
            id: userId,
            organizationId,
          },
        });

      if (!existingUser) {
        return res.status(404).json({
          status: "error",
          message:
            "CHRIS user not found.",
        });
      }

      if (
        userId === req.auth.userId
      ) {
        return res.status(400).json({
          status: "error",
          message:
            "You cannot change your own role assignments from User Management.",
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

      const uniqueRoleIds =
        [...new Set(roleIds)];

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

      await prisma.$transaction(
        async (tx) => {
          await tx.user.update({
            where: {
              id: userId,
            },

            data: {
              firstName:
                firstName.trim(),
              lastName:
                lastName.trim(),
              email:
                normalizedEmail,
            },
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

          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,

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
          },
        });

      return res.status(200).json({
        status: "success",
        message:
          "CHRIS user updated successfully.",

        data: {
          id:
            updatedUser.id,
          email:
            updatedUser.email,
          firstName:
            updatedUser.firstName,
          lastName:
            updatedUser.lastName,
          isActive:
            updatedUser.isActive,
          createdAt:
            updatedUser.createdAt,
          updatedAt:
            updatedUser.updatedAt,

          roles:
            updatedUser.userRoles.map(
              (userRole) =>
                userRole.role
            ),
        },
      });
    } catch (error) {
      console.error(
        "User update error:",
        error
      );

      if (
        error.code === "P2002"
      ) {
        return res.status(409).json({
          status: "error",
          message:
            "Another CHRIS user already uses this email address.",
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
          },
        });

      if (!existingUser) {
        return res.status(404).json({
          status: "error",
          message:
            "CHRIS user not found.",
        });
      }

      if (
        userId === req.auth.userId &&
        isActive === false
      ) {
        return res.status(400).json({
          status: "error",
          message:
            "You cannot deactivate your own CHRIS account.",
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

          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            isActive: true,
          },
        });

      return res.status(200).json({
        status: "success",

        message: isActive
          ? "CHRIS user activated successfully."
          : "CHRIS user deactivated successfully.",

        data: user,
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