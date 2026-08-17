const express =
  require("express");

const {
  requireAuth,
  requirePermission,
} = require(
  "../middleware/authMiddleware"
);

const {
  runEmploymentIntegrityAudit,
} = require(
  "../services/employeeIntegrity"
);

const router =
  express.Router();

router.use(
  requireAuth
);

router.get(
  "/employment-history",

  requirePermission(
    "employees.view"
  ),

  async (req, res) => {
    try {
      const audit =
        await runEmploymentIntegrityAudit({
          organizationId:
            req.auth
              .organizationId,
        });

      return res
        .status(200)
        .json({
          status:
            "success",

          data:
            audit,
        });
    } catch (error) {
      console.error(
        "Employee integrity audit error:",
        error
      );

      return res
        .status(500)
        .json({
          status:
            "error",

          message:
            "Unable to run the employee employment-history integrity audit.",
        });
    }
  }
);

module.exports =
  router;
