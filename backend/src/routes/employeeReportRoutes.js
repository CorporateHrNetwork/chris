const express =
  require("express");

const {
  requireAuth,
  requirePermission,
} = require(
  "../middleware/authMiddleware"
);

const {
  getWorkforceReport,
  getLifecycleReport,
  workforceReportToCsv,
  lifecycleReportToCsv,
} = require(
  "../services/employeeReporting"
);

const router =
  express.Router();

router.use(
  requireAuth
);

router.get(
  "/workforce",

  requirePermission(
    "employees.view",
    "reports.view"
  ),

  async (req, res) => {
    try {
      const report =
        await getWorkforceReport({
          organizationId:
            req.auth
              .organizationId,

          filters:
            req.query ||
            {},
        });

      if (
        String(
          req.query
            ?.format ||
            ""
        )
          .trim()
          .toLowerCase() ===
        "csv"
      ) {
        const csv =
          workforceReportToCsv(
            report
          );

        res.set({
          "Content-Type":
            "text/csv; charset=utf-8",

          "Content-Disposition":
            'attachment; filename="chris-workforce-report.csv"',
        });

        return res
          .status(200)
          .send(csv);
      }

      return res
        .status(200)
        .json({
          status:
            "success",

          results:
            report
              .employees
              .length,

          data:
            report,
        });
    } catch (error) {
      console.error(
        "Workforce report error:",
        error
      );

      return res
        .status(500)
        .json({
          status:
            "error",

          message:
            "Unable to generate workforce report.",
        });
    }
  }
);

router.get(
  "/employees/:employeeNumber/lifecycle",

  requirePermission(
    "employees.view",
    "reports.view"
  ),

  async (req, res) => {
    try {
      const report =
        await getLifecycleReport({
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

      if (!report) {
        return res
          .status(404)
          .json({
            status:
              "error",

            message:
              "Employee not found.",
          });
      }

      if (
        String(
          req.query
            ?.format ||
            ""
        )
          .trim()
          .toLowerCase() ===
        "csv"
      ) {
        const csv =
          lifecycleReportToCsv(
            report
          );

        res.set({
          "Content-Type":
            "text/csv; charset=utf-8",

          "Content-Disposition":
            `attachment; filename="chris-${report.employee.employeeNumber}-lifecycle.csv"`,
        });

        return res
          .status(200)
          .send(csv);
      }

      return res
        .status(200)
        .json({
          status:
            "success",

          data:
            report,
        });
    } catch (error) {
      console.error(
        "Employee lifecycle report error:",
        error
      );

      return res
        .status(500)
        .json({
          status:
            "error",

          message:
            "Unable to generate employee lifecycle report.",
        });
    }
  }
);

module.exports =
  router;
