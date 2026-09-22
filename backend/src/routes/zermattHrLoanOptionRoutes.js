const express = require("express");

const { requireAuth } = require("../middleware/authMiddleware");
const { listLoanEmployeeOptions } = require("../services/loanWorkflowAccessService");
const { isZermatt, canManageLoans } = require("../services/zermattHrFinancialAccessService");

const router = express.Router();
router.use(requireAuth);

router.get("/loans/employee-options", async (req, res, next) => {
  if (!isZermatt(req) || !canManageLoans(req)) return next("route");
  try {
    const data = await listLoanEmployeeOptions({
      organizationId: req.auth.organizationId,
      userId: req.auth.userId,
    });
    return res.json({
      status: "success",
      data,
      locationContext: {
        locationScope: req.auth.locationScope,
        activeLocationId: req.auth.activeLocationId || null,
        consolidatedHeadOffice: Boolean(req.auth.consolidatedHeadOffice),
      },
    });
  } catch (error) {
    if (error?.code) {
      return res.status(error.statusCode || 400).json({
        status: "error",
        code: error.code,
        message: error.message,
      });
    }
    console.error("Zermatt HR loan employee-options error:", error);
    return res.status(500).json({ status: "error", message: "Unable to load employees available for loan recording." });
  }
});

module.exports = router;
