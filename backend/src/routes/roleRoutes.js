const express = require("express");

const prisma = require("../config/prisma");

const {
  requireAuth,
  requirePermission,
} = require("../middleware/authMiddleware");

const router = express.Router();

const TENANT_RESTRICTED_PERMISSION_PREFIXES = [
  "support.internal.",
  "support.engineering.",
];

function isTenantRestrictedPermissionKey(key) {
  const normalized = String(key || "").trim();
  return TENANT_RESTRICTED_PERMISSION_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

router.use(requireAuth);

/*
============================================================
GET ALL ROLES
============================================================
*/
/*
============================================================
CREATE ORGANIZATION ROLE
============================================================
Tenant administrators can create tenant-scoped custom roles.
New roles start with no permissions and are then configured
through the existing Roles & Permissions editor.
============================================================
*/
router.post(
  "/",
  requirePermission("roles.manage"),
  async (req, res) => {
    try {
      const organizationId = req.auth.organizationId;
      const name = String(req.body?.name || "").trim();
      const description = String(req.body?.description || "").trim();

      if (!name) {
        return res.status(400).json({
          status: "error",
          code: "ROLE_NAME_REQUIRED",
          message: "Role name is required.",
        });
      }

      if (name.length > 100) {
        return res.status(400).json({
          status: "error",
          code: "ROLE_NAME_TOO_LONG",
          message: "Role name must not exceed 100 characters.",
        });
      }

      if (name.toLowerCase() === "administrator") {
        return res.status(400).json({
          status: "error",
          code: "PROTECTED_ROLE_NAME",
          message: "Administrator is a protected system role and cannot be recreated.",
        });
      }

      const duplicate = await prisma.role.findFirst({
        where: {
          organizationId,
          name: { equals: name, mode: "insensitive" },
        },
        select: { id: true, name: true },
      });

      if (duplicate) {
        return res.status(409).json({
          status: "error",
          code: "ROLE_ALREADY_EXISTS",
          message: "A role with this name already exists in this organization.",
        });
      }

      const role = await prisma.$transaction(async (tx) => {
        const created = await tx.role.create({
          data: {
            organizationId,
            name,
            description: description || null,
            isSystemRole: false,
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
        });

        await tx.organizationAudit.create({
          data: {
            organizationId,
            actorUserId: req.auth.userId,
            entityType: "Role",
            entityId: created.id,
            action: "CHRIS_ROLE_CREATED",
            previousValue: null,
            newValue: {
              name: created.name,
              description: created.description,
              isSystemRole: created.isSystemRole,
              permissionCount: 0,
            },
            reason: "Organization administrator created a tenant role.",
          },
        });

        return created;
      });

      return res.status(201).json({
        status: "success",
        message: role.name + " role created successfully. Configure its permissions before assigning it to users.",
        data: {
          id: role.id,
          name: role.name,
          description: role.description,
          isSystemRole: role.isSystemRole,
          createdAt: role.createdAt,
          userCount: role._count.userRoles,
          permissionCount: role._count.rolePermissions,
        },
      });
    } catch (error) {
      console.error("Role creation error:", error);
      if (error.code === "P2002") {
        return res.status(409).json({
          status: "error",
          code: "ROLE_ALREADY_EXISTS",
          message: "A role with this name already exists in this organization.",
        });
      }
      return res.status(500).json({
        status: "error",
        message: "Unable to create CHRIS role.",
      });
    }
  }
);

router.get(
  "/",
  requirePermission("roles.view"),
  async (req, res) => {
    try {
      const organizationId = req.auth.organizationId;

      const roles = await prisma.role.findMany({
        where: { organizationId },
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
        orderBy: { name: "asc" },
      });

      const formattedRoles = roles.map((role) => ({
        id: role.id,
        name: role.name,
        description: role.description,
        isSystemRole: role.isSystemRole,
        createdAt: role.createdAt,
        userCount: role._count.userRoles,
        permissionCount: role._count.rolePermissions,
      }));

      return res.status(200).json({
        status: "success",
        results: formattedRoles.length,
        data: formattedRoles,
      });
    } catch (error) {
      console.error("Role fetch error:", error);
      return res.status(500).json({
        status: "error",
        message: "Unable to fetch CHRIS roles.",
      });
    }
  }
);

/*
============================================================
GET ALL TENANT-ASSIGNABLE PERMISSIONS
============================================================
Platform Support Desk permissions are intentionally excluded. They may only
be assigned to global system roles through the controlled bootstrap process.
============================================================
*/
router.get(
  "/permissions",
  requirePermission("roles.view"),
  async (req, res) => {
    try {
      const permissions = await prisma.permission.findMany({
        where: {
          NOT: TENANT_RESTRICTED_PERMISSION_PREFIXES.map((prefix) => ({
            key: { startsWith: prefix },
          })),
        },
        select: {
          id: true,
          key: true,
          name: true,
          description: true,
        },
        orderBy: { key: "asc" },
      });

      return res.status(200).json({
        status: "success",
        results: permissions.length,
        data: permissions,
      });
    } catch (error) {
      console.error("Permission fetch error:", error);
      return res.status(500).json({
        status: "error",
        message: "Unable to fetch CHRIS permissions.",
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
      const organizationId = req.auth.organizationId;
      const { roleId } = req.params;

      const role = await prisma.role.findFirst({
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
          message: "CHRIS role not found.",
        });
      }

      const permissions = role.rolePermissions
        .map((assignment) => assignment.permission)
        .filter((permission) => !isTenantRestrictedPermissionKey(permission.key))
        .sort((a, b) => a.key.localeCompare(b.key));

      return res.status(200).json({
        status: "success",
        data: {
          id: role.id,
          name: role.name,
          description: role.description,
          isSystemRole: role.isSystemRole,
          permissions,
        },
      });
    } catch (error) {
      console.error("Role detail fetch error:", error);
      return res.status(500).json({
        status: "error",
        message: "Unable to fetch CHRIS role details.",
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
      const organizationId = req.auth.organizationId;
      const { roleId } = req.params;
      const { permissionIds } = req.body;

      if (!Array.isArray(permissionIds)) {
        return res.status(400).json({
          status: "error",
          message: "permissionIds must be an array.",
        });
      }

      const uniquePermissionIds = [...new Set(permissionIds)];

      const role = await prisma.role.findFirst({
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
          message: "CHRIS role not found.",
        });
      }

      if (role.name === "Administrator") {
        return res.status(403).json({
          status: "error",
          message: "Administrator permissions cannot be modified.",
        });
      }

      const validPermissions = uniquePermissionIds.length === 0
        ? []
        : await prisma.permission.findMany({
            where: { id: { in: uniquePermissionIds } },
            select: { id: true, key: true },
          });

      if (validPermissions.length !== uniquePermissionIds.length) {
        return res.status(400).json({
          status: "error",
          message: "One or more permission IDs are invalid.",
        });
      }

      if (validPermissions.some((permission) => isTenantRestrictedPermissionKey(permission.key))) {
        return res.status(403).json({
          status: "error",
          code: "PLATFORM_PERMISSION_NOT_TENANT_ASSIGNABLE",
          message: "Platform Support Desk permissions cannot be assigned through tenant role administration.",
        });
      }

      await prisma.$transaction(async (tx) => {
        await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
        if (uniquePermissionIds.length > 0) {
          await tx.rolePermission.createMany({
            data: uniquePermissionIds.map((permissionId) => ({
              roleId: role.id,
              permissionId,
            })),
          });
        }
      });

      const updatedRole = await prisma.role.findFirst({
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

      const permissions = updatedRole.rolePermissions
        .map((assignment) => assignment.permission)
        .filter((permission) => !isTenantRestrictedPermissionKey(permission.key))
        .sort((a, b) => a.key.localeCompare(b.key));

      return res.status(200).json({
        status: "success",
        message: `${role.name} permissions updated successfully.`,
        data: {
          id: updatedRole.id,
          name: updatedRole.name,
          description: updatedRole.description,
          isSystemRole: updatedRole.isSystemRole,
          permissions,
        },
      });
    } catch (error) {
      console.error("Role permission update error:", error);
      return res.status(500).json({
        status: "error",
        message: "Unable to update CHRIS role permissions.",
      });
    }
  }
);

module.exports = router;
