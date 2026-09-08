const express = require("express");
const prisma = require("../config/prisma");
const { requireAuth, requirePermission } = require("../middleware/authMiddleware");
const { listEmploymentLevels } = require("../services/designationEmploymentLevelService");

const router = express.Router();

router.use(requireAuth);

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

module.exports = router;
