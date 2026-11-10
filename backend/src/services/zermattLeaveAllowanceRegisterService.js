const prisma = require("../config/prisma");
const { ZERMATT_SLUG, eligibilityForPeriod, calculateLeaveAllowance } = require("./zermattLeaveAllowanceService");

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

  const employees = await prismaClient.$queryRawUnsafe(
    `SELECT e."id",e."employeeNumber",CONCAT_WS(' ',e."firstName",e."middleName",e."lastName") AS "employeeName",
            e."hireDate",e."status",e."employmentType",e."locationId",l."name" AS "locationName"
       FROM "employees" e
       LEFT JOIN "organization_locations" l ON l."id"=e."locationId" AND l."organizationId"=e."organizationId"
      WHERE e."organizationId"=$1
      ORDER BY e."employeeNumber"`,
    organizationId
  );

  const month = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos", year: "numeric", month: "2-digit",
  }).format(new Date()).slice(0, 7);
  const currentPayroll = await prismaClient.$queryRawUnsafe(
    `WITH selected_run AS (
       SELECT pr.id,pp.code,pp."periodStart",pp."periodEnd",pr.status
       FROM payroll_runs pr JOIN payroll_periods pp
         ON pp.id=pr."periodId" AND pp."organizationId"=pr."organizationId"
       WHERE pr."organizationId"=$1 AND to_char(pp."periodEnd",'YYYY-MM')=$2
         AND pr.status IN ('DRAFT','PENDING_APPROVAL','APPROVED')
       ORDER BY CASE WHEN pr.status='APPROVED' THEN 0 ELSE 1 END,pr."createdAt" DESC
       LIMIT 1
     )
     SELECT pl."employeeId",pl."grossPay",pl.currency,pl.details,r.code,r.status,r."periodStart",r."periodEnd"
     FROM selected_run r JOIN payroll_run_lines pl ON pl."runId"=r.id AND pl."organizationId"=$1`,
    organizationId, month
  );
  const salaryByEmployee = new Map(currentPayroll.map(row => [row.employeeId, row]));

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
    const paymentHistory = paymentsByEmployee.get(employee.id) || [];
    const salary = salaryByEmployee.get(employee.id);
    const basic = jsonValue(salary?.details).salaryStructure?.basic;
    const eligibility = salary ? eligibilityForPeriod({
      hireDate: employee.hireDate, employmentType: employee.employmentType,
      periodStart: salary.periodStart, periodEnd: salary.periodEnd,
    }) : null;
    const projection = salary && basic != null ? calculateLeaveAllowance({
      monthlyGross: salary.grossPay, monthlyBasic: basic,
    }).leaveAllowance : null;
    return {
      employeeId: employee.id,
      employeeNumber: employee.employeeNumber,
      employeeName: employee.employeeName,
      hireDate: dateText(employee.hireDate),
      employmentType: employee.employmentType,
      status: employee.status,
      locationId: employee.locationId,
      locationName: employee.locationName,
      policyMode: "CURRENT_MONTH_SALARY_FORMULA",
      automaticCalculation: true,
      salaryBasis: "CURRENT_MONTH_GROSS_AND_BASIC",
      paymentTiming: "EMPLOYEE_ENTRY_MONTH_AFTER_QUALIFYING_SERVICE",
      monthlyGross: salary ? round2(salary.grossPay) : null,
      monthlyBasic: basic == null ? null : round2(basic),
      currency: salary?.currency || "NGN",
      payrollPeriod: salary?.code || null,
      payrollStatus: salary?.status || null,
      projectedLeaveAllowance: eligibility?.eligible ? projection : null,
      eligibilityStatus: eligibility?.reason || "NO_CURRENT_PAYROLL_LINE",
      formula: "Monthly Basic Salary × 12 × 10%",
      dueThisMonth: Boolean(eligibility?.eligible),
      lastPayment: paymentHistory[0] || null,
      paymentHistory,
    };
  });

  return {
    policy: {
      tenant: ZERMATT_SLUG,
      mode: "CURRENT_MONTH_SALARY_FORMULA",
      automaticCalculation: true,
      salaryBasis: "CURRENT_MONTH_GROSS_AND_BASIC",
      paymentTiming: "EMPLOYEE_ENTRY_MONTH_AFTER_QUALIFYING_SERVICE",
      rule: "CHRiS calculates current monthly Basic Salary × 12 × 10% for eligible Full-Time employees in their employment anniversary payroll month after one completed year.",
      taxable: false,
      payrollTreatment: "AFTER_TAX_NON_TAXABLE",
    },
    rows,
    summary: {
      employees: rows.length,
      currentPayrollMonth: month,
      employeesWithCurrentPayroll: salaryByEmployee.size,
      employeesDueThisMonth: rows.filter(row => row.dueThisMonth).length,
      totalApprovedPayments: payments.length,
      totalApprovedAmount: round2(payments.reduce((sum, payment) => sum + Number(jsonValue(payment.leaveAllowance, {}).amount || 0), 0)),
    },
  };
}

module.exports = { listZermattLeaveAllowanceRegister };
