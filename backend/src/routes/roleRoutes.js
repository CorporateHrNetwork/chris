const express = require("express");

const prisma = require("../config/prisma");

const {
  requireAuth,
  requirePermission,
} = require("../middleware/authMiddleware");

const router = express.Router();

/*
============================================================
ROLE MANAGEMENT ROUTES
============================================================

All routes:
- require authentication
- are tenant-scoped
- require CHRIS role permissions
*/

router.use(requireAuth);

/*
============================================================
GET ORGANIZATION ROLES
Permission: roles.view
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
        results:
          formattedRoles.length,
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

module.exports = router;