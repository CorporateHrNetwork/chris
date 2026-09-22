const express =
  require(
    "express"
  );

const {
  requireAuth,
  requirePermission,
} = require(
  "../middleware/authMiddleware"
);

const {
  getEmploymentServiceSummary,
} = require(
  "../services/employmentService"
);

const router =
  express.Router();

router.use(
  requireAuth
);

/*
============================================================
EMPLOYMENT SERVICE INTELLIGENCE

GET
/api/employment-service/:employeeNumber

Tenant scoped.
Permission: employees.view

This endpoint is intentionally separate from the legacy
employeeRoutes.js monolith so Leave, Payroll, Benefits and
Reports can later reuse the same employment-service model.
============================================================
*/

router.get(
  "/:employeeNumber",

  requirePermission(
    "employees.view"
  ),

  async (req, res) => {
    try {
      const summary =
        await getEmploymentServiceSummary({
          organizationId:
            req.auth
              .organizationId,

          employeeNumber:
            String(
              req.params
                .employeeNumber ||
                ""
            ).trim(),
        });

      if (!summary) {
        return res
          .status(404)
          .json({
            status:
              "error",

            message:
              "Employee not found.",
          });
      }

      return res
        .status(200)
        .json({
          status:
            "success",

          data:
            summary,
        });
    } catch (error) {
      console.error(
        "Employment service summary error:",
        error
      );

      return res
        .status(500)
        .json({
          status:
            "error",

          message:
            "Unable to calculate employee service history.",
        });
    }
  }
);

module.exports =
  router;