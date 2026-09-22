const express =
  require("express");

const {
  requireAuth,
  requirePermission,
} = require(
  "../middleware/authMiddleware"
);

const {
  SERVICE_BASES,
  DEFAULT_ALLOWED_STATUSES,
  normalizeRule,
  evaluateEmployeeEligibility,
  evaluateEmployeesEligibility,
} = require(
  "../services/serviceEligibility"
);

const router =
  express.Router();

router.use(
  requireAuth
);

router.get(
  "/capabilities",

  requirePermission(
    "employees.view"
  ),

  (req, res) => {
    return res
      .status(200)
      .json({
        status:
          "success",

        data: {
          serviceBases:
            Object.values(
              SERVICE_BASES
            ),

          defaultAllowedStatuses:
            DEFAULT_ALLOWED_STATUSES,

          supportedRuleFields: [
            "serviceBasis",
            "minimumServiceDays",
            "requireCurrentEpisode",
            "allowedStatuses",
            "maximumGapDays",
            "maximumGapCount",
          ],

          batchLimit:
            250,
        },
      });
  }
);

router.post(
  "/batch",

  requirePermission(
    "employees.view"
  ),

  async (req, res) => {
    try {
      const {
        employeeNumbers,
        rule,
      } = req.body || {};

      if (
        !Array.isArray(
          employeeNumbers
        ) ||
        employeeNumbers
          .length === 0
      ) {
        return res
          .status(400)
          .json({
            status:
              "error",

            code:
              "EMPLOYEE_NUMBERS_REQUIRED",

            message:
              "Provide at least one employee number.",
          });
      }

      const normalizedRule =
        normalizeRule(
          rule || {}
        );

      const results =
        await evaluateEmployeesEligibility({
          organizationId:
            req.auth
              .organizationId,

          employeeNumbers,

          rule:
            normalizedRule,
        });

      return res
        .status(200)
        .json({
          status:
            "success",

          results:
            results.length,

          data: {
            rule:
              normalizedRule,

            employees:
              results,
          },
        });
    } catch (error) {
      return handleEligibilityError(
        error,
        res
      );
    }
  }
);

router.post(
  "/:employeeNumber/evaluate",

  requirePermission(
    "employees.view"
  ),

  async (req, res) => {
    try {
      const employeeNumber =
        String(
          req.params
            .employeeNumber ||
            ""
        ).trim();

      const normalizedRule =
        normalizeRule(
          req.body?.rule ||
            req.body ||
            {}
        );

      const result =
        await evaluateEmployeeEligibility({
          organizationId:
            req.auth
              .organizationId,

          employeeNumber,

          rule:
            normalizedRule,
        });

      if (!result) {
        return res
          .status(404)
          .json({
            status:
              "error",

            code:
              "EMPLOYEE_NOT_FOUND",

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
            result,
        });
    } catch (error) {
      return handleEligibilityError(
        error,
        res
      );
    }
  }
);

function handleEligibilityError(
  error,
  res
) {
  console.error(
    "Employment eligibility evaluation error:",
    error
  );

  const validationCodes =
    new Set([
      "INVALID_SERVICE_BASIS",
      "INVALID_ALLOWED_STATUSES",
      "INVALID_NON_NEGATIVE_INTEGER",
    ]);

  if (
    validationCodes.has(
      error.message
    )
  ) {
    return res
      .status(400)
      .json({
        status:
          "error",

        code:
          error.message,

        message:
          "The eligibility rule contains an invalid value.",
      });
  }

  if (
    error.message ===
    "ELIGIBILITY_BATCH_LIMIT_EXCEEDED"
  ) {
    return res
      .status(400)
      .json({
        status:
          "error",

        code:
          "ELIGIBILITY_BATCH_LIMIT_EXCEEDED",

        message:
          "A maximum of 250 employees can be evaluated in one eligibility request.",
      });
  }

  return res
    .status(500)
    .json({
      status:
        "error",

      message:
        "Unable to evaluate employment eligibility.",
    });
}

module.exports =
  router;
