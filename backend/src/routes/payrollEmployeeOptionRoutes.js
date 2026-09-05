const express = require("express");
const prisma = require("../config/prisma");
const {
  requireAuth,
  requirePermission,
} = require("../middleware/authMiddleware");

const router = express.Router();
const CURRENT_PAYROLL_STATUSES = ["ACTIVE", "PROBATION", "LEAVE", "SUSPENDED"];

router.use(requireAuth);

router.get(
  "/",
  requirePermission("payroll.view"),
  async (req, res) => {
    try {
      const employees = await prisma.employee.findMany({
        where: {
          organizationId: req.auth.organizationId,
          status: { in: CURRENT_PAYROLL_STATUSES },
        },
        select: {
          id: true,
          employeeNumber: true,
          firstName: true,
          middleName: true,
          lastName: true,
          status: true,
          employmentType: true,
          department: {
            select: { name: true, code: true },
          },
          designation: {
            select: { name: true, code: true },
          },
        },
        orderBy: { employeeNumber: "asc" },
      });

      return res.json({
        status: "success",
        data: employees.map((employee) => ({
          id: employee.id,
          employeeNumber: employee.employeeNumber,
          employeeName: [
            employee.firstName,
            employee.middleName,
            employee.lastName,
          ]
            .filter(Boolean)
            .join(" "),
          department: employee.department?.name || null,
          departmentCode: employee.department?.code || null,
          designation: employee.designation?.name || null,
          designationCode: employee.designation?.code || null,
          employmentType: employee.employmentType || null,
          status: employee.status,
        })),
      });
    } catch (error) {
      console.error("Payroll employee option lookup error:", error);
      return res.status(500).json({
        status: "error",
        message: "Unable to load current employees for payroll selection.",
      });
    }
  }
);

module.exports = router;
