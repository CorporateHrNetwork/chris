const prisma = require("../config/prisma");
const { ZERMATT_SLUG } = require("./zermattLeaveAllowanceService");

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

  const references = await prismaClient.$queryRawUnsafe(
    `SELECT r."employeeId",r."employeeNumber",r."applicableMonth",r."referenceDecemberYear",
            r."referenceDecemberGross",r."leaveAllowanceAmount",r."sourceFileName",r."sourceRowNumber"
       FROM "zermatt_leave_allowance_references" r
      WHERE r."organizationId"=$1 AND r."status"='ACTIVE'
      ORDER BY r."applicableMonth" DESC,r."employeeNumber"`,
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

  const referenceByEmployee = new Map();
  for (const reference of references) {
    const list = referenceByEmployee.get(reference.employeeId) || [];
    list.push({
      applicableMonth: dateText(reference.applicableMonth),
      referenceDecemberYear: Number(reference.referenceDecemberYear),
      referenceDecemberGross: round2(reference.referenceDecemberGross),
      leaveAllowanceAmount: round2(reference.leaveAllowanceAmount),
      sourceFileName: reference.sourceFileName || null,
      sourceRowNumber: reference.sourceRowNumber || null,
    });
    referenceByEmployee.set(reference.employeeId, list);
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
    const referenceHistory = referenceByEmployee.get(employee.id) || [];
    const paymentHistory = paymentsByEmployee.get(employee.id) || [];
    const nextReference = referenceHistory[0] || null;
    return {
      employeeId: employee.id,
      employeeNumber: employee.employeeNumber,
      employeeName: employee.employeeName,
      hireDate: dateText(employee.hireDate),
      employmentType: employee.employmentType,
      status: employee.status,
      locationId: employee.locationId,
      locationName: employee.locationName,
      policyMode: "REFERENCE_IMPORT",
      automaticCalculation: false,
      salaryBasis: "LAST_DECEMBER_GROSS",
      paymentTiming: "ARREARS",
      projectedLeaveAllowance: null,
      formula: null,
      dueThisMonth: false,
      amountPayableThisMonth: null,
      payableSource: nextReference ? "REFERENCE_SCHEDULE" : "AWAITING_REFERENCE",
      referenceDecemberYear: nextReference?.referenceDecemberYear || null,
      referenceDecemberGross: nextReference?.referenceDecemberGross ?? null,
      referencedLeaveAllowance: nextReference?.leaveAllowanceAmount ?? null,
      applicableMonth: nextReference?.applicableMonth || null,
      referenceHistory,
      lastPayment: paymentHistory[0] || null,
      paymentHistory,
    };
  });

  return {
    policy: {
      tenant: ZERMATT_SLUG,
      mode: "REFERENCE_IMPORT",
      automaticCalculation: false,
      salaryBasis: "LAST_DECEMBER_GROSS",
      paymentTiming: "ARREARS",
      rule: "Leave Allowance is supplied by an authoritative employee/month reference schedule based on last December gross salary. CHRiS does not calculate the amount automatically.",
      taxable: false,
      payrollTreatment: "AFTER_TAX_NON_TAXABLE",
    },
    rows,
    summary: {
      employees: rows.length,
      referencesLoaded: references.length,
      employeesWithReference: rows.filter((row) => row.referenceHistory.length > 0).length,
      employeesAwaitingReference: rows.filter((row) => row.referenceHistory.length === 0).length,
      totalReferencedAmount: round2(references.reduce((sum, item) => sum + Number(item.leaveAllowanceAmount || 0), 0)),
      totalApprovedPayments: payments.length,
      totalApprovedAmount: round2(payments.reduce((sum, payment) => sum + Number(jsonValue(payment.leaveAllowance, {}).amount || 0), 0)),
    },
  };
}

module.exports = { listZermattLeaveAllowanceRegister };
