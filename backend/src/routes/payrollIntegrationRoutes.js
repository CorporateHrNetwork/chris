const express = require("express");
const { requireAuth, requirePermission } = require("../middleware/authMiddleware");
const {
  listIntegratedRunLines,
  listPayslips,
  getStatutoryCatalog,
} = require("../services/payrollIntegrationViewService");

const router = express.Router();
router.use(requireAuth);

function sendError(res, error, fallback) {
  if (error?.code) {
    return res.status(error.statusCode || 400).json({
      status: "error",
      code: error.code,
      message: error.message || fallback,
      details: error.details,
    });
  }
  console.error("Payroll integration view error:", error);
  return res.status(500).json({ status: "error", message: error?.message || fallback });
}

router.get("/runs/:id/lines", requirePermission("payroll.view"), async (req, res) => {
  try {
    const data = await listIntegratedRunLines({
      organizationId: req.auth.organizationId,
      runId: req.params.id,
    });
    return res.json({ status: "success", data });
  } catch (error) {
    return sendError(res, error, "Unable to load integrated payroll lines.");
  }
});

router.get("/payslips", requirePermission("payroll.view"), async (req, res) => {
  try {
    const data = await listPayslips({
      organizationId: req.auth.organizationId,
      runId: req.query?.runId || null,
      employeeNumber: req.query?.employeeNumber || null,
    });
    return res.json({
      status: "success",
      data,
      control: "Official CHRiS payslips are generated directly from APPROVED payroll-run lines. Draft payroll remains a preview in Execute Payroll.",
    });
  } catch (error) {
    return sendError(res, error, "Unable to load payroll-generated payslips.");
  }
});

router.get("/statutory-catalog", requirePermission("payroll.view"), async (req, res) => {
  try {
    const data = await getStatutoryCatalog({ organizationId: req.auth.organizationId });
    return res.json({ status: "success", data });
  } catch (error) {
    return sendError(res, error, "Unable to load statutory payroll catalogue.");
  }
});

module.exports = router;
