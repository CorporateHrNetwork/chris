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
GET ALL ROLES
============================================================
*/
router.get(
  "/",
  requirePermission("roles.view"),
  async (req, res) => {
    try {
      const organizationId =
        req.auth.organizationId;

      const roles =
        await prisma.role.findMany({
          where: {
            organizationId,
          },

          select: {
            id: true,
            name: true,
            description: true,
            isSystemRole: true,
            createdAt: true,

            _count: {
              select: {
                userRoles: true,
                rolePermissions: true,
              },
            },
          },

          orderBy: {
            name: "asc",
          },
        });

      const formattedRoles =
        roles.map((role) => ({
          id: role.id,
          name: role.name,
          description: role.description,
          isSystemRole: role.isSystemRole,
          createdAt: role.createdAt,

          userCount:
            role._count.userRoles,

          permissionCount:
            role._count.rolePermissions,
        }));

      return res.status(200).json({
        status: "success",
        results: formattedRoles.length,
        data: formattedRoles,
      });
    } catch (error) {
      console.error(
        "Role fetch error:",
        error
      );

      return res.status(500).json({
        status: "error",
        message:
          "Unable to fetch CHRIS roles.",
      });
    }
  }
);

/*
============================================================
GET ALL AVAILABLE PERMISSIONS
============================================================
*/
router.get(
  "/permissions",
  requirePermission("roles.view"),
  async (req, res) => {
    try {
      const permissions =
        await prisma.permission.findMany({
          select: {
            id: true,
            key: true,
            name: true,
            description: true,
          },

          orderBy: {
            key: "asc",
          },
        });

      return res.status(200).json({
        status: "success",
        results: permissions.length,
        data: permissions,
      });
    } catch (error) {
      console.error(
        "Permission fetch error:",
        error
      );

      return res.status(500).json({
        status: "error",
        message:
          "Unable to fetch CHRIS permissions.",
      });
    }
  }
);

/*
============================================================
GET ONE ROLE WITH PERMISSIONS
============================================================
*/
router.get(
  "/:roleId",
  requirePermission("roles.view"),
  async (req, res) => {
    try {
      const organizationId =
        req.auth.organizationId;

      const { roleId } = req.params;

      const role =
        await prisma.role.findFirst({
          where: {
            id: roleId,
            organizationId,
          },

          select: {
            id: true,
            name: true,
            description: true,
            isSystemRole: true,

            rolePermissions: {
              select: {
                permission: {
                  select: {
                    id: true,
                    key: true,
                    name: true,
                    description: true,
                  },
                },
              },
            },
          },
        });

      if (!role) {
        return res.status(404).json({
          status: "error",
          message:
            "CHRIS role not found.",
        });
      }

      const permissions =
        role.rolePermissions
          .map(
            (assignment) =>
              assignment.permission
          )
          .sort((a, b) =>
            a.key.localeCompare(b.key)
          );

      return res.status(200).json({
        status: "success",

        data: {
          id: role.id,
          name: role.name,
          description:
            role.description,
          isSystemRole:
            role.isSystemRole,
          permissions,
        },
      });
    } catch (error) {
      console.error(
        "Role detail fetch error:",
        error
      );

      return res.status(500).json({
        status: "error",
        message:
          "Unable to fetch CHRIS role details.",
      });
    }
  }
);

/*
============================================================
UPDATE ROLE PERMISSIONS
============================================================
*/
router.put(
  "/:roleId/permissions",
  requirePermission("roles.manage"),
  async (req, res) => {
    try {
      const organizationId =
        req.auth.organizationId;

      const { roleId } = req.params;

      const {
        permissionIds,
      } = req.body;

      if (
        !Array.isArray(permissionIds)
      ) {
        return res.status(400).json({
          status: "error",
          message:
            "permissionIds must be an array.",
        });
      }

      /*
      Remove duplicates.
      */
      const uniquePermissionIds = [
        ...new Set(permissionIds),
      ];

      const role =
        await prisma.role.findFirst({
          where: {
            id: roleId,
            organizationId,
          },

          select: {
            id: true,
            name: true,
            isSystemRole: true,
          },
        });

      if (!role) {
        return res.status(404).json({
          status: "error",
          message:
            "CHRIS role not found.",
        });
      }

      /*
      Administrator is intentionally immutable.

      This prevents accidental removal of
      critical administrative permissions.
      */
      if (
        role.name === "Administrator"
      ) {
        return res.status(403).json({
          status: "error",
          message:
            "Administrator permissions cannot be modified.",
        });
      }

      /*
      Validate every permission ID before
      changing any assignments.
      */
      const validPermissions =
        uniquePermissionIds.length === 0
          ? []
          : await prisma.permission.findMany({
              where: {
                id: {
                  in: uniquePermissionIds,
                },
              },

              select: {
                id: true,
              },
            });

      if (
        validPermissions.length !==
        uniquePermissionIds.length
      ) {
        return res.status(400).json({
          status: "error",
          message:
            "One or more permission IDs are invalid.",
        });
      }

      /*
      Replace the permission set atomically.
      */
      await prisma.$transaction(
        async (tx) => {
          await tx.rolePermission.deleteMany({
            where: {
              roleId: role.id,
            },
          });

          if (
            uniquePermissionIds.length > 0
          ) {
            await tx.rolePermission.createMany({
              data:
                uniquePermissionIds.map(
                  (permissionId) => ({
                    roleId: role.id,
                    permissionId,
                  })
                ),
            });
          }
        }
      );

      /*
      Return the updated permission set.
      */
      const updatedRole =
        await prisma.role.findFirst({
          where: {
            id: role.id,
            organizationId,
          },

          select: {
            id: true,
            name: true,
            description: true,
            isSystemRole: true,

            rolePermissions: {
              select: {
                permission: {
                  select: {
                    id: true,
                    key: true,
                    name: true,
                    description: true,
                  },
                },
              },
            },
          },
        });

      const permissions =
        updatedRole.rolePermissions
          .map(
            (assignment) =>
              assignment.permission
          )
          .sort((a, b) =>
            a.key.localeCompare(b.key)
          );

      return res.status(200).json({
        status: "success",
        message:
          `${role.name} permissions updated successfully.`,

        data: {
          id: updatedRole.id,
          name: updatedRole.name,
          description:
            updatedRole.description,
          isSystemRole:
            updatedRole.isSystemRole,
          permissions,
        },
      });
    } catch (error) {
      console.error(
        "Role permission update error:",
        error
      );

      return res.status(500).json({
        status: "error",
        message:
          "Unable to update CHRIS role permissions.",
      });
    }
  }
);

module.exports = router;