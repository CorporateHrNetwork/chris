const prisma = require("../config/prisma");
const { getActivePolicy } = require("./nigeriaPayrollComplianceService");
const {
  ZERMATT_SLUG,
  ELIGIBLE_EMPLOYMENT_TYPE,
  calculateLeaveAllowance,
} = require("./zermattLeaveAllowanceService");

function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function dateText(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : null;
}

function jsonValue(value, fallback = {}) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function monthKeyFromDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function listZermattLeaveAllowanceRegister({ organizationId, prismaClient = prisma }) {
  const organization = await prismaClient.organization.findUnique({
    where: { id: organizationId },
    select: { slug: true },
  });
  if (!organization || organization.slug !== ZERMATT_SLUG) {
    const error = new Error("ZERMATT_LEAVE_ALLOWANCE_TENANT_ONLY");
    error.code = "ZERMATT_LEAVE_ALLOWANCE_TENANT_ONLY";
    error.statusCode = 404;
    throw error;
  }

  const policy = await getActivePolicy({ organizationId, prismaClient });
  const employees = await prismaClient.$queryRawUnsafe(
    `SELECT e."id",e."employeeNumber",CONCAT_WS(' ',e."firstName",e."middleName",e."lastName") AS "employeeName",
            e."hireDate",e."status",e."employmentType",e."locationId",l."name" AS "locationName",
            sr."amount" AS "scheduledMonthlyGross",sr."currency"
       FROM "employees" e
       LEFT JOIN "organization_locations" l ON l."id"=e."locationId" AND l."organizationId"=e."organizationId"
       LEFT JOIN LATERAL (
         SELECT "amount","currency" FROM "payroll_salary_rates" r
          WHERE r."organizationId"=e."organizationId" AND r."employeeId"=e."id" AND r."status"='ACTIVE'
            AND r."effectiveFrom"<=CURRENT_DATE AND (r."effectiveTo" IS NULL OR r."effectiveTo">=CURRENT_DATE)
          ORDER BY r."effectiveFrom" DESC LIMIT 1
       ) sr ON TRUE
      WHERE e."organizationId"=$1
      ORDER BY e."employeeNumber"`,
    organizationId
  );

  const payments = await prismaClient.$queryRawUnsafe(
    `SELECT pl."employeeId",pl."employeeNumber",pl."employeeName",pl."currency",pl."details"->'leaveAllowance' AS "leaveAllowance",
            pp."code" AS "periodCode",pp."periodEnd",pr."approvedAt"
       FROM "payroll_run_lines" pl
       JOIN "payroll_runs" pr ON pr."id"=pl."runId" AND pr."organizationId"=pl."organizationId"
       JOIN "payroll_periods" pp ON pp."id"=pr."periodId" AND pp."organizationId"=pl."organizationId"
      WHERE pl."organizationId"=$1 AND pr."status"='APPROVED' AND pl."details" ? 'leaveAllowance'
      ORDER BY pp."periodEnd" DESC`,
    organizationId
  );

  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth();
  const currentMonthKey = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;

  // Current-month payroll is authoritative once a draft/submitted/approved run exists.
  // If payroll has not yet been created, the register projection remains the payable source.
  const currentPayrollRows = await prismaClient.$queryRawUnsafe(
    `SELECT pr."id" AS "runId",pr."status" AS "runStatus",pr."createdAt",pp."code" AS "periodCode",pp."periodEnd",
            pl."employeeId",pl."details"->'leaveAllowance' AS "leaveAllowance"
       FROM "payroll_runs" pr
       JOIN "payroll_periods" pp ON pp."id"=pr."periodId" AND pp."organizationId"=pr."organizationId"
       JOIN "payroll_run_lines" pl ON pl."runId"=pr."id" AND pl."organizationId"=pr."organizationId"
      WHERE pr."organizationId"=$1
        AND TO_CHAR(pp."periodEnd", 'YYYY-MM')=$2
        AND pr."status" IN ('DRAFT','SUBMITTED','APPROVED')
        AND pl."details" ? 'leaveAllowance'
      ORDER BY CASE pr."status" WHEN 'APPROVED' THEN 3 WHEN 'SUBMITTED' THEN 2 ELSE 1 END DESC,
               pr."createdAt" DESC`,
    organizationId,
    currentMonthKey
  );

  const payrollByEmployee = new Map();
  for (const row of currentPayrollRows) {
    if (!payrollByEmployee.has(row.employeeId)) {
      payrollByEmployee.set(row.employeeId, {
        runId: row.runId,
        runStatus: row.runStatus,
        periodCode: row.periodCode,
        periodEnd: dateText(row.periodEnd),
        ...jsonValue(row.leaveAllowance, {}),
      });
    }
  }

  const paymentsByEmployee = new Map();
  for (const payment of payments) {
    const item = {
      ...jsonValue(payment.leaveAllowance, {}),
      periodCode: payment.periodCode,
      periodEnd: dateText(payment.periodEnd),
      approvedAt: payment.approvedAt ? new Date(payment.approvedAt).toISOString() : null,
      currency: payment.currency || "NGN",
    };
    const list = paymentsByEmployee.get(payment.employeeId) || [];
    list.push(item);
    paymentsByEmployee.set(payment.employeeId, list);
  }

  const rows = employees.map((employee) => {
    const hire = employee.hireDate ? new Date(employee.hireDate) : null;
    const employmentTypeEligible = employee.employmentType === ELIGIBLE_EMPLOYMENT_TYPE;
    const scheduledMonthlyGross = round2(employee.scheduledMonthlyGross || 0);
    const calculation = policy && scheduledMonthlyGross > 0 && employmentTypeEligible
      ? calculateLeaveAllowance({ scheduledMonthlyGross, salaryStructure: policy.salaryStructure })
      : null;
    const history = paymentsByEmployee.get(employee.id) || [];
    const currentPayroll = payrollByEmployee.get(employee.id) || null;
    let firstDueMonth = null;
    let nextDueMonth = null;

    if (employmentTypeEligible && hire && !Number.isNaN(hire.getTime())) {
      const hireYear = hire.getUTCFullYear();
      const hireMonth = hire.getUTCMonth();
      firstDueMonth = `${hireYear + 1}-${String(hireMonth + 1).padStart(2, "0")}`;
      let nextYear = Math.max(hireYear + 1, currentYear);
      if (nextYear === currentYear && currentMonth > hireMonth) nextYear += 1;
      const paidYears = new Set(history.map((item) => Number(item.entitlementYear)));
      while (paidYears.has(nextYear)) nextYear += 1;
      nextDueMonth = `${nextYear}-${String(hireMonth + 1).padStart(2, "0")}`;
    }

    const registerDueThisMonth = employmentTypeEligible && nextDueMonth === currentMonthKey;
    const payrollAmountThisMonth = currentPayroll ? round2(currentPayroll.amount || currentPayroll.value || 0) : null;
    const registerAmountThisMonth = registerDueThisMonth ? round2(calculation?.leaveAllowance || 0) : 0;
    const amountPayableThisMonth = currentPayroll ? payrollAmountThisMonth : registerAmountThisMonth;

    return {
      employeeId: employee.id,
      employeeNumber: employee.employeeNumber,
      employeeName: employee.employeeName,
      hireDate: dateText(employee.hireDate),
      employmentType: employee.employmentType,
      eligibilityStatus: employmentTypeEligible ? "ELIGIBLE_EMPLOYMENT_TYPE" : "NOT_ELIGIBLE_EMPLOYMENT_TYPE",
      eligibilityReason: employmentTypeEligible
        ? "Full-Time employee; anniversary/month rules still apply."
        : `Leave Allowance is restricted to ${ELIGIBLE_EMPLOYMENT_TYPE} employees.`,
      entryMonth: hire ? hire.getUTCMonth() + 1 : null,
      status: employee.status,
      locationId: employee.locationId,
      locationName: employee.locationName,
      currency: employee.currency || "NGN",
      scheduledMonthlyGross,
      monthlyBasicSalary: calculation?.monthlyBasicSalary || 0,
      annualBasicSalary: calculation?.annualBasicSalary || 0,
      projectedLeaveAllowance: calculation?.leaveAllowance || 0,
      formula: "Basic Monthly Salary × 12 × 10%",
      taxable: false,
      payrollTreatment: "AFTER_TAX_NON_TAXABLE",
      firstDueMonth,
      nextDueMonth,
      dueThisMonth: currentPayroll ? payrollAmountThisMonth > 0 : registerDueThisMonth,
      amountPayableThisMonth,
      payableSource: currentPayroll ? `PAYROLL_${currentPayroll.runStatus}` : "REGISTER_CALCULATION",
      currentPayroll,
      lastPayment: history[0] || null,
      paymentHistory: history,
    };
  });

  const dueRows = rows.filter((row) => row.dueThisMonth && row.amountPayableThisMonth > 0);

  return {
    policy: {
      tenant: ZERMATT_SLUG,
      eligibleEmploymentType: ELIGIBLE_EMPLOYMENT_TYPE,
      ratePercent: 10,
      formula: "Basic Monthly Salary × 12 × 10%",
      eligibility: "Only Full-Time employees qualify. First payment is due in the employee's entry month after completing one year of service, then annually in that same month.",
      taxable: false,
      payrollTreatment: "AFTER_TAX_NON_TAXABLE",
      payrollDescription: "Paid through the eligible month's payroll after PAYE. It does not increase taxable gross, chargeable income or PAYE and is shown separately on the approved payslip.",
    },
    rows,
    summary: {
      employees: rows.length,
      employmentTypeEligible: rows.filter((row) => row.eligibilityStatus === "ELIGIBLE_EMPLOYMENT_TYPE").length,
      employmentTypeIneligible: rows.filter((row) => row.eligibilityStatus === "NOT_ELIGIBLE_EMPLOYMENT_TYPE").length,
      withSalaryAuthority: rows.filter((row) => row.scheduledMonthlyGross > 0).length,
      currentMonth: currentMonthKey,
      payableEmployeesThisMonth: dueRows.length,
      amountPayableThisMonth: round2(dueRows.reduce((sum, row) => sum + Number(row.amountPayableThisMonth || 0), 0)),
      payableSource: currentPayrollRows.length ? "CURRENT_MONTH_PAYROLL" : "REGISTER_CALCULATION",
      totalApprovedPayments: payments.length,
      totalApprovedAmount: round2(payments.reduce((sum, payment) => sum + Number(jsonValue(payment.leaveAllowance, {}).amount || 0), 0)),
    },
  };
}

module.exports = { listZermattLeaveAllowanceRegister };
