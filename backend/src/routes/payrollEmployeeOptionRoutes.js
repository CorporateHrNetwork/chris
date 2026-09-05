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
      const organizationId = req.auth.organizationId;
      const employees = await prisma.employee.findMany({
        where: {
          organizationId,
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

      const salaryRates = await prisma.$queryRawUnsafe(
        `SELECT DISTINCT ON ("employeeId")
                "employeeId","amount","currency","effectiveFrom","effectiveTo","status"
           FROM "payroll_salary_rates"
          WHERE "organizationId"=$1
            AND "status"='ACTIVE'
            AND "effectiveFrom" <= CURRENT_DATE
            AND ("effectiveTo" IS NULL OR "effectiveTo" >= CURRENT_DATE)
          ORDER BY "employeeId","effectiveFrom" DESC,"createdAt" DESC`,
        organizationId
      );
      const salaryRateByEmployee = new Map(
        salaryRates.map((rate) => [rate.employeeId, rate])
      );

      return res.json({
        status: "success",
        data: employees.map((employee) => {
          const currentRate = salaryRateByEmployee.get(employee.id) || null;
          return {
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
            currentSalaryRate: currentRate
              ? {
                  amount: Number(currentRate.amount || 0),
                  currency: currentRate.currency || "NGN",
                  effectiveFrom: currentRate.effectiveFrom
                    ? new Date(currentRate.effectiveFrom).toISOString().slice(0, 10)
                    : null,
                  effectiveTo: currentRate.effectiveTo
                    ? new Date(currentRate.effectiveTo).toISOString().slice(0, 10)
                    : null,
                  status: currentRate.status,
                }
              : null,
          };
        }),
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
