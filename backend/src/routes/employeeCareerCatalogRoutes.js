const express = require("express");
const prisma = require("../config/prisma");
const { requireAuth, requirePermission } = require("../middleware/authMiddleware");

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

module.exports = router;
