const express = require("express");
const prisma = require("../config/prisma");
const { requireAuth, requirePermission } = require("../middleware/authMiddleware");
const { listEmploymentLevels } = require("../services/designationEmploymentLevelService");

const router = express.Router();
const ZERMATT_SLUG = "zermatt-liquor-limited";
const ZERMATT_V2_LEVEL_NUMBERS = [101, 102, 103, 104, 105, 106, 107];

router.use(requireAuth);

function publicLevelLabel(level) {
  return level?.code || (level?.levelNumber != null ? `Level ${level.levelNumber}` : "Level");
}

async function isZermatt(req) {
  if (req.auth?.organization?.slug) {
    return req.auth.organization.slug === ZERMATT_SLUG;
  }
  const organization = await prisma.organization.findUnique({
    where: { id: req.auth.organizationId },
    select: { slug: true },
  });
  return organization?.slug === ZERMATT_SLUG;
}

router.get(
  "/career/cost-centres",
  requirePermission("employees.view"),
  async (req, res) => {
    try {
      const now = new Date();
      const costCentres = await prisma.costCentre.findMany({
        where: {
          organizationId: req.auth.organizationId,
          status: "ACTIVE",
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
        },
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          status: true,
          effectiveFrom: true,
          effectiveTo: true,
        },
        orderBy: [{ code: "asc" }, { name: "asc" }],
      });

      return res.json({ status: "success", data: costCentres });
    } catch (error) {
      console.error("Employee Cost Centre catalogue error:", error);
      return res.status(500).json({
        status: "error",
        message: "Unable to load Cost Centre / Operating Unit catalogue.",
      });
    }
  }
);

router.get(
  "/career/designations",
  requirePermission("employees.view"),
  async (req, res) => {
    try {
      const designations = await prisma.designation.findMany({
        where: {
          organizationId: req.auth.organizationId,
          isActive: true,
        },
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          careerTrack: true,
          careerLevel: true,
          departmentId: true,
          reportsToDesignationId: true,
          department: { select: { id: true, code: true, name: true } },
          employmentLevel: {
            select: {
              levelNumber: true,
              code: true,
              name: true,
              description: true,
              displayOrder: true,
              isActive: true,
            },
          },
          reportsToDesignation: {
            select: { id: true, code: true, name: true, careerLevel: true },
          },
        },
        orderBy: [{ name: "asc" }, { code: "asc" }],
      });

      return res.json({ status: "success", data: designations });
    } catch (error) {
      console.error("Employee designation catalogue error:", error);
      return res.status(500).json({
        status: "error",
        message: "Unable to load the controlled Designation catalogue.",
      });
    }
  }
);

// Selector endpoint: only levels that can be assigned right now.
router.get(
  "/career/employment-levels",
  requirePermission("employees.view"),
  async (req, res) => {
    try {
      const levels = await listEmploymentLevels({
        organizationId: req.auth.organizationId,
      });
      return res.json({ status: "success", data: levels });
    } catch (error) {
      console.error("Employee Employment Level catalogue error:", error);
      return res.status(500).json({
        status: "error",
        message: "Unable to load the controlled Employment Level catalogue.",
      });
    }
  }
);

// Administration endpoint used by the Employment Level configuration table.
// ZERMATT V1 rows are historical evidence and are intentionally excluded; the
// live administration surface always shows all seven V2 levels, including an
// inactive level so an authorized Head Office user can reactivate it.
router.get(
  "/career/levels",
  requirePermission("employees.view"),
  async (req, res) => {
    try {
      const zermatt = await isZermatt(req);
      const levels = await prisma.organizationEmploymentLevel.findMany({
        where: {
          organizationId: req.auth.organizationId,
          ...(zermatt ? { levelNumber: { in: ZERMATT_V2_LEVEL_NUMBERS } } : {}),
        },
        orderBy: [{ displayOrder: "asc" }, { levelNumber: "asc" }],
      });
      return res.json({
        status: "success",
        data: levels,
        configurationMode: zermatt ? "ZERMATT_V2_LIVE" : "TENANT_LEVELS",
      });
    } catch (error) {
      console.error("Employment Level administration catalogue error:", error);
      return res.status(500).json({
        status: "error",
        message: "Unable to load Employment Level configuration.",
      });
    }
  }
);

router.patch(
  "/career/levels/:levelNumber",
  requirePermission("employees.update"),
  async (req, res) => {
    try {
      if (req.auth.activeLocationId) {
        return res.status(409).json({
          status: "error",
          code: "HEAD_OFFICE_REQUIRED_FOR_EMPLOYMENT_LEVEL_CONFIGURATION",
          message: "Employment Level catalogue configuration is organization-wide. Switch to HEAD OFFICE before editing or activating a level.",
        });
      }

      const levelNumber = Number(req.params.levelNumber);
      if (!Number.isInteger(levelNumber)) {
        return res.status(400).json({ status: "error", code: "INVALID_EMPLOYMENT_LEVEL", message: "Employment Level is invalid." });
      }

      const zermatt = await isZermatt(req);
      if (zermatt && !ZERMATT_V2_LEVEL_NUMBERS.includes(levelNumber)) {
        return res.status(409).json({
          status: "error",
          code: "ZERMATT_HISTORICAL_LEVEL_IMMUTABLE",
          message: "Historical ZERMATT V1 Employment Levels are read-only. Edit only the live L1-L7 hierarchy.",
        });
      }

      const existing = await prisma.organizationEmploymentLevel.findUnique({
        where: {
          organizationId_levelNumber: {
            organizationId: req.auth.organizationId,
            levelNumber,
          },
        },
      });
      if (!existing) {
        return res.status(404).json({ status: "error", code: "EMPLOYMENT_LEVEL_NOT_FOUND", message: "Employment Level not found." });
      }

      const requestedActive =
        typeof req.body?.isActive === "boolean" ? req.body.isActive : existing.isActive;

      if (existing.isActive && !requestedActive) {
        const [designationCount, overrideCount] = await Promise.all([
          prisma.designation.count({
            where: {
              organizationId: req.auth.organizationId,
              careerLevel: levelNumber,
              isActive: true,
            },
          }),
          prisma.employeeEmploymentLevelAssignment.count({
            where: {
              organizationId: req.auth.organizationId,
              levelNumber,
              effectiveTo: null,
            },
          }),
        ]);
        if (designationCount || overrideCount) {
          return res.status(409).json({
            status: "error",
            code: "EMPLOYMENT_LEVEL_IN_USE",
            message: `${publicLevelLabel(existing)} cannot be deactivated while it is used by active designations or current employee overrides.`,
            details: { designationCount, currentEmployeeOverrides: overrideCount },
          });
        }
      }

      const next = {
        name: String(req.body?.name ?? existing.name).trim() || existing.name,
        description:
          req.body?.description === undefined
            ? existing.description
            : String(req.body.description || "").trim() || null,
        displayOrder:
          req.body?.displayOrder === undefined || req.body?.displayOrder === null || req.body?.displayOrder === ""
            ? existing.displayOrder
            : Number(req.body.displayOrder),
        isActive: requestedActive,
        // ZERMATT public codes L1-L7 are stable identifiers. They must not be
        // renamed because the active V2 hierarchy and downstream rules use them.
        code: zermatt
          ? existing.code
          : String(req.body?.code ?? existing.code).trim() || existing.code,
      };

      if (!Number.isInteger(Number(next.displayOrder))) {
        return res.status(400).json({ status: "error", code: "INVALID_DISPLAY_ORDER", message: "Display order must be a whole number." });
      }
      next.displayOrder = Number(next.displayOrder);

      const updated = await prisma.$transaction(async (tx) => {
        const row = await tx.organizationEmploymentLevel.update({
          where: {
            organizationId_levelNumber: {
              organizationId: req.auth.organizationId,
              levelNumber,
            },
          },
          data: next,
        });
        await tx.organizationAudit.create({
          data: {
            organizationId: req.auth.organizationId,
            actorUserId: req.auth.userId,
            entityType: "OrganizationEmploymentLevel",
            entityId: String(levelNumber),
            action:
              existing.isActive !== next.isActive
                ? next.isActive
                  ? "EMPLOYMENT_LEVEL_ACTIVATED"
                  : "EMPLOYMENT_LEVEL_DEACTIVATED"
                : "EMPLOYMENT_LEVEL_METADATA_UPDATED",
            previousValue: {
              levelNumber: existing.levelNumber,
              code: existing.code,
              name: existing.name,
              description: existing.description,
              displayOrder: existing.displayOrder,
              isActive: existing.isActive,
            },
            newValue: {
              levelNumber: row.levelNumber,
              code: row.code,
              name: row.name,
              description: row.description,
              displayOrder: row.displayOrder,
              isActive: row.isActive,
            },
            reason: String(req.body?.reason || "Employment Level configuration updated by authorized HR").trim(),
          },
        });
        return row;
      });

      return res.json({
        status: "success",
        message: `${publicLevelLabel(updated)} saved and is now ${updated.isActive ? "ACTIVE" : "INACTIVE"}.`,
        data: updated,
      });
    } catch (error) {
      console.error("Employment Level configuration update error:", error);
      return res.status(500).json({
        status: "error",
        message: "Unable to update Employment Level configuration.",
      });
    }
  }
);

module.exports = router;
