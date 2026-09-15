const prisma = require("../config/prisma");
const {
  calculateAnnualPaye,
  calculateStructure,
  getActivePolicy,
} = require("./nigeriaPayrollComplianceService");

const ZERMATT_SLUG = "zermatt-liquor-limited";
const LEAVE_ALLOWANCE_RATE = 10;
const BENEFIT_CODE = "ZERMATT_LEAVE_ALLOWANCE";

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

function monthKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function anniversaryForYear(hireDate, year) {
  const hire = new Date(hireDate);
  if (Number.isNaN(hire.getTime())) return null;
  const month = hire.getUTCMonth();
  const day = hire.getUTCDate();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay)));
}

function eligibilityForPeriod({ hireDate, periodStart, periodEnd }) {
  if (!hireDate || !periodStart || !periodEnd) return { eligible: false, reason: "HIRE_DATE_REQUIRED" };
  const hire = new Date(hireDate);
  const start = new Date(`${dateText(periodStart)}T00:00:00.000Z`);
  const end = new Date(`${dateText(periodEnd)}T23:59:59.999Z`);
  if ([hire, start, end].some((value) => Number.isNaN(value.getTime()))) {
    return { eligible: false, reason: "INVALID_DATE" };
  }

  const payrollYear = end.getUTCFullYear();
  const hireYear = hire.getUTCFullYear();
  const hireMonth = hire.getUTCMonth();
  const payrollMonth = end.getUTCMonth();
  const anniversary = anniversaryForYear(hire, payrollYear);
  const firstEligibleYear = hireYear + 1;
  const eligible = payrollYear >= firstEligibleYear && payrollMonth === hireMonth && anniversary && anniversary <= end;

  return {
    eligible: Boolean(eligible),
    reason: eligible ? "ANNUAL_ENTRY_MONTH_AFTER_FIRST_SERVICE_YEAR" : "NOT_DUE_THIS_PERIOD",
    entitlementYear: payrollYear,
    hireMonth: hireMonth + 1,
    anniversaryDate: anniversary ? anniversary.toISOString().slice(0, 10) : null,
    firstEligibleYear,
  };
}

function calculateLeaveAllowance({ scheduledMonthlyGross, salaryStructure }) {
  const contractualStructure = calculateStructure(round2(scheduledMonthlyGross), salaryStructure || {});
  const monthlyBasicSalary = round2(contractualStructure.basic || 0);
  const annualBasicSalary = round2(monthlyBasicSalary * 12);
  const leaveAllowance = round2(annualBasicSalary * LEAVE_ALLOWANCE_RATE / 100);
  return {
    monthlyBasicSalary,
    annualBasicSalary,
    leaveAllowance,
    ratePercent: LEAVE_ALLOWANCE_RATE,
    contractualStructure,
  };
}

async function assertZermatt(client, organizationId) {
  const organization = await client.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, slug: true, name: true, currency: true },
  });
  if (!organization || organization.slug !== ZERMATT_SLUG) {
    const error = new Error("ZERMATT_LEAVE_ALLOWANCE_TENANT_ONLY");
    error.code = "ZERMATT_LEAVE_ALLOWANCE_TENANT_ONLY";
    error.statusCode = 404;
    throw error;
  }
  return organization;
}

async function paidEntitlementKeys(client, organizationId, runId) {
  const rows = await client.$queryRawUnsafe(
    `SELECT pl."employeeId", pl."details"->'leaveAllowance'->>'entitlementYear' AS "entitlementYear"
       FROM "payroll_run_lines" pl
       JOIN "payroll_runs" pr ON pr."id"=pl."runId" AND pr."organizationId"=pl."organizationId"
      WHERE pl."organizationId"=$1
        AND pr."status"='APPROVED'
        AND pl."runId"<>$2
        AND pl."details" ? 'leaveAllowance'`,
    organizationId,
    runId
  );
  return new Set(rows.map((row) => `${row.employeeId}:${row.entitlementYear}`));
}

async function applyZermattLeaveAllowanceToDraft({ organizationId, actorUserId, runId, periodId, prismaClient = prisma }) {
  const organization = await assertZermatt(prismaClient, organizationId);
  const periodRows = await prismaClient.$queryRawUnsafe(
    `SELECT "id","code","periodStart","periodEnd","payDate" FROM "payroll_periods"
      WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,
    organizationId,
    periodId
  );
  const period = periodRows[0];
  if (!period) {
    const error = new Error("Payroll period not found.");
    error.code = "PAYROLL_PERIOD_NOT_FOUND";
    error.statusCode = 404;
    throw error;
  }

  const policy = await getActivePolicy({ organizationId, asOf: dateText(period.periodEnd), prismaClient });
  if (!policy) {
    const error = new Error("No active Nigeria payroll policy covers this payroll period.");
    error.code = "PAYROLL_POLICY_NOT_CONFIGURED";
    error.statusCode = 409;
    throw error;
  }

  const lineRows = await prismaClient.$queryRawUnsafe(
    `SELECT pl.*,e."hireDate",e."locationId",e."status" AS "employeeStatus"
       FROM "payroll_run_lines" pl
       JOIN "employees" e ON e."id"=pl."employeeId" AND e."organizationId"=pl."organizationId"
      WHERE pl."organizationId"=$1 AND pl."runId"=$2
      ORDER BY pl."employeeNumber"`,
    organizationId,
    runId
  );
  const alreadyPaid = await paidEntitlementKeys(prismaClient, organizationId, runId);
  const bands = policy.payeRules?.bands || [];
  const beneficiaries = [];

  await prismaClient.$transaction(async (tx) => {
    for (const row of lineRows) {
      const eligibility = eligibilityForPeriod({
        hireDate: row.hireDate,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
      });
      if (!eligibility.eligible) continue;

      const entitlementKey = `${row.employeeId}:${eligibility.entitlementYear}`;
      if (alreadyPaid.has(entitlementKey)) continue;

      const details = jsonValue(row.details, {});
      const scheduledMonthlyGross = round2(details.scheduledMonthlyGross || 0);
      if (scheduledMonthlyGross <= 0) continue;

      const calculation = calculateLeaveAllowance({
        scheduledMonthlyGross,
        salaryStructure: policy.salaryStructure,
      });
      if (calculation.leaveAllowance <= 0) continue;

      const statutory = { ...(details.statutory || {}) };
      const currentAnnualChargeable = round2(statutory.annualChargeableIncomeIncludingOneTime || 0);
      const minimumWageExempt = statutory.minimumWageExempt === true;
      const currentAnnualTax = minimumWageExempt ? 0 : calculateAnnualPaye(currentAnnualChargeable, bands);
      const newAnnualChargeable = round2(currentAnnualChargeable + calculation.leaveAllowance);
      const newAnnualTax = minimumWageExempt ? 0 : calculateAnnualPaye(newAnnualChargeable, bands);
      const additionalPaye = round2(Math.max(0, newAnnualTax - currentAnnualTax));

      const oldGross = round2(row.grossPay);
      const oldAllowances = round2(row.allowances);
      const oldDeductions = round2(row.deductions);
      const oldNet = round2(row.netPreview);
      const grossPay = round2(oldGross + calculation.leaveAllowance);
      const allowances = round2(oldAllowances + calculation.leaveAllowance);
      const deductions = round2(oldDeductions + additionalPaye);
      const netPreview = round2(Math.max(0, oldNet + calculation.leaveAllowance - additionalPaye));

      statutory.payeTax = round2(Number(statutory.payeTax || 0) + additionalPaye);
      statutory.annualChargeableIncomeIncludingOneTime = newAnnualChargeable;
      statutory.leaveAllowanceTaxableEarning = calculation.leaveAllowance;

      const leaveAllowance = {
        code: BENEFIT_CODE,
        name: "Leave Allowance",
        module: "BENEFITS",
        benefitType: "LEAVE_ALLOWANCE",
        amount: calculation.leaveAllowance,
        value: calculation.leaveAllowance,
        monthlyBasicSalary: calculation.monthlyBasicSalary,
        annualBasicSalary: calculation.annualBasicSalary,
        ratePercent: LEAVE_ALLOWANCE_RATE,
        formula: "Basic Monthly Salary × 12 × 10%",
        hireDate: dateText(row.hireDate),
        anniversaryDate: eligibility.anniversaryDate,
        entitlementYear: eligibility.entitlementYear,
        dueMonth: monthKey(period.periodEnd),
        payrollPeriodId: period.id,
        payrollPeriodCode: period.code,
        taxable: true,
        source: "ZERMATT_BENEFITS_LEAVE_ALLOWANCE",
      };

      const salaryStructure = {
        ...(details.salaryStructure || {}),
        "Leave Allowance": calculation.leaveAllowance,
      };
      const benefitEarnings = [
        ...(Array.isArray(details.benefitEarnings) ? details.benefitEarnings.filter((item) => item?.code !== BENEFIT_CODE) : []),
        leaveAllowance,
      ];
      const updatedDetails = {
        ...details,
        salaryStructure,
        benefitEarnings,
        leaveAllowance,
        statutory,
      };

      await tx.$executeRawUnsafe(
        `UPDATE "payroll_run_lines"
            SET "allowances"=$4,"deductions"=$5,"grossPay"=$6,"netPreview"=$7,
                "details"=$8::jsonb,"updatedAt"=CURRENT_TIMESTAMP
          WHERE "organizationId"=$1 AND "runId"=$2 AND "id"=$3`,
        organizationId,
        runId,
        row.id,
        allowances,
        deductions,
        grossPay,
        netPreview,
        JSON.stringify(updatedDetails)
      );

      beneficiaries.push({
        employeeId: row.employeeId,
        employeeNumber: row.employeeNumber,
        employeeName: row.employeeName,
        locationId: row.locationId,
        ...leaveAllowance,
        additionalPaye,
        grossPay,
        netPreview,
      });
    }

    const totals = await tx.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS "employeeCount",
              COALESCE(SUM("grossPay"),0) AS "grossTotal",
              COALESCE(SUM("deductions"+"advanceRecovery"+COALESCE("loanRecovery",0)),0) AS "deductionTotal",
              COALESCE(SUM("netPreview"),0) AS "netPreviewTotal"
         FROM "payroll_run_lines"
        WHERE "organizationId"=$1 AND "runId"=$2`,
      organizationId,
      runId
    );
    const total = totals[0] || {};
    await tx.$executeRawUnsafe(
      `UPDATE "payroll_runs"
          SET "employeeCount"=$3,"grossTotal"=$4,"deductionTotal"=$5,"netPreviewTotal"=$6,"updatedAt"=CURRENT_TIMESTAMP
        WHERE "organizationId"=$1 AND "id"=$2`,
      organizationId,
      runId,
      Number(total.employeeCount || 0),
      Number(total.grossTotal || 0),
      Number(total.deductionTotal || 0),
      Number(total.netPreviewTotal || 0)
    );

    await tx.organizationAudit.create({
      data: {
        organizationId,
        actorUserId: actorUserId || null,
        entityType: "PayrollRun",
        entityId: runId,
        action: "ZERMATT_LEAVE_ALLOWANCE_APPLIED",
        newValue: {
          payrollPeriodId: period.id,
          payrollPeriodCode: period.code,
          formula: "Basic Monthly Salary × 12 × 10%",
          beneficiaryCount: beneficiaries.length,
          totalLeaveAllowance: round2(beneficiaries.reduce((sum, item) => sum + item.amount, 0)),
          beneficiaries: beneficiaries.map((item) => ({
            employeeNumber: item.employeeNumber,
            entitlementYear: item.entitlementYear,
            amount: item.amount,
          })),
        },
        reason: "Zermatt annual Leave Allowance applied through Benefits and payroll in the employee entry month after the first completed service year.",
      },
    });
  });

  return {
    organization: { id: organization.id, name: organization.name, slug: organization.slug },
    period: { id: period.id, code: period.code, periodStart: dateText(period.periodStart), periodEnd: dateText(period.periodEnd) },
    formula: "Basic Monthly Salary × 12 × 10%",
    beneficiaryCount: beneficiaries.length,
    totalLeaveAllowance: round2(beneficiaries.reduce((sum, item) => sum + item.amount, 0)),
    beneficiaries,
  };
}

async function listZermattLeaveAllowanceRegister({ organizationId, prismaClient = prisma }) {
  await assertZermatt(prismaClient, organizationId);
  const policy = await getActivePolicy({ organizationId, prismaClient });
  const employees = await prismaClient.$queryRawUnsafe(
    `SELECT e."id",e."employeeNumber",CONCAT_WS(' ',e."firstName",e."middleName",e."lastName") AS "employeeName",
            e."hireDate",e."status",e."locationId",l."name" AS "locationName",
            sr."amount" AS "scheduledMonthlyGross",sr."currency"
       FROM "employees" e
       LEFT JOIN "locations" l ON l."id"=e."locationId" AND l."organizationId"=e."organizationId"
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

  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth();
  const rows = employees.map((employee) => {
    const hire = employee.hireDate ? new Date(employee.hireDate) : null;
    const scheduledMonthlyGross = round2(employee.scheduledMonthlyGross || 0);
    let calculation = null;
    if (policy && scheduledMonthlyGross > 0) {
      calculation = calculateLeaveAllowance({ scheduledMonthlyGross, salaryStructure: policy.salaryStructure });
    }
    const history = paymentsByEmployee.get(employee.id) || [];
    let nextDueMonth = null;
    let firstDueMonth = null;
    if (hire && !Number.isNaN(hire.getTime())) {
      const hireYear = hire.getUTCFullYear();
      const hireMonth = hire.getUTCMonth();
      firstDueMonth = `${hireYear + 1}-${String(hireMonth + 1).padStart(2, "0")}`;
      let nextYear = Math.max(hireYear + 1, currentYear);
      if (nextYear === currentYear && currentMonth > hireMonth) nextYear += 1;
      const paidYears = new Set(history.map((item) => Number(item.entitlementYear)));
      while (paidYears.has(nextYear)) nextYear += 1;
      nextDueMonth = `${nextYear}-${String(hireMonth + 1).padStart(2, "0")}`;
    }
    return {
      employeeId: employee.id,
      employeeNumber: employee.employeeNumber,
      employeeName: employee.employeeName,
      hireDate: dateText(employee.hireDate),
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
      firstDueMonth,
      nextDueMonth,
      lastPayment: history[0] || null,
      paymentHistory: history,
    };
  });

  return {
    policy: {
      tenant: ZERMATT_SLUG,
      ratePercent: LEAVE_ALLOWANCE_RATE,
      formula: "Basic Monthly Salary × 12 × 10%",
      eligibility: "First payment is due in the employee's entry month after completing one year of service, then annually in that same month.",
      payrollTreatment: "Paid through the eligible month's payroll and shown as a distinct Leave Allowance earning on the approved payslip.",
    },
    rows,
    summary: {
      employees: rows.length,
      withSalaryAuthority: rows.filter((row) => row.scheduledMonthlyGross > 0).length,
      totalApprovedPayments: payments.length,
      totalApprovedAmount: round2(payments.reduce((sum, payment) => sum + Number(jsonValue(payment.leaveAllowance, {}).amount || 0), 0)),
    },
  };
}

module.exports = {
  ZERMATT_SLUG,
  BENEFIT_CODE,
  LEAVE_ALLOWANCE_RATE,
  eligibilityForPeriod,
  calculateLeaveAllowance,
  applyZermattLeaveAllowanceToDraft,
  listZermattLeaveAllowanceRegister,
};