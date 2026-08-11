const express = require("express");

const prisma = require("../config/prisma");

const {
  requireAuth,
  requireAnyPermission,
} = require("../middleware/authMiddleware");

const router = express.Router();

/*
============================================================
CHRIS OPERATIONAL LOCATION CATALOGUE
============================================================

Purpose:
Read-only organization location catalogue for operational
HR modules.

This route does NOT create, edit, activate or deactivate
locations.

Location administration remains under /api/locations.

Examples of consumers:
- Employee Directory
- Employee Transfers
- Attendance
- Leave
- Payroll
- Reports
- Assets

Security:
- authenticated CHRIS user required
- tenant scoped
- user must have access to at least one operational module
============================================================
*/

router.use(requireAuth);

/*
============================================================
GET ACTIVE ORGANIZATION LOCATIONS
============================================================
*/

router.get(
  "/",
  requireAnyPermission(
    "employees.view",
    "attendance.view",
    "leave.view",
    "payroll.view",
    "reports.view",
    "settings.view"
  ),
  async (req, res) => {
    try {
      const organizationId =
        req.auth.organizationId;

      const locations =
        await prisma.organizationLocation.findMany({
          where: {
            organizationId,

            isActive: true,
          },

          select: {
            id: true,
            name: true,
            code: true,
            type: true,
            city: true,
            state: true,
            country: true,
            isActive: true,

            _count: {
              select: {
                employees: true,
              },
            },
          },

          orderBy: [
            {
              type: "asc",
            },
            {
              name: "asc",
            },
          ],
        });

      const data =
        locations.map(
          (location) => ({
            id:
              location.id,

            name:
              location.name,

            code:
              location.code,

            type:
              location.type,

            city:
              location.city,

            state:
              location.state,

            country:
              location.country,

            isActive:
              location.isActive,

            employeeCount:
              location._count
                .employees,
          })
        );

      return res
        .status(200)
        .json({
          status:
            "success",

          results:
            data.length,

          data,
        });
    } catch (error) {
      console.error(
        "Operational location catalogue error:",
        error
      );

      return res
        .status(500)
        .json({
          status:
            "error",

          message:
            "Unable to load organization locations.",
        });
    }
  }
);

module.exports = router;