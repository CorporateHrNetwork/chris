const express = require("express");

const {
  requireAuth,
  requirePermission,
} = require("../middleware/authMiddleware");
const {
  getPayrollReadiness,
} = require("../services/payrollReadinessService");

const router = express.Router();

router.use(requireAuth);

router.get(
  "/readiness",
  requirePermission("payroll.view"),
  async (req, res) => {
    try {
      const data = await getPayrollReadiness({
        organizationId: req.auth.organizationId,
      });

      return res.json({
        status: "success",
        data,
      });
    } catch (error) {
      console.error("Payroll readiness error:", error);

      return res.status(500).json({
        status: "error",
        message: "Unable to load payroll readiness.",
      });
    }
  }
);

module.exports = router;
