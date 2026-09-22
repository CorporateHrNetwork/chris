const prisma = require("../config/prisma");

function sectionDataFor(onboarding, key, fallbackKey) {
  const data = onboarding?.sectionData;
  if (!data || typeof data !== "object") return {};
  const value = data[key] || data[fallbackKey];
  return value && typeof value === "object" ? value : {};
}

function hasText(value) {
  return Boolean(String(value || "").trim());
}

function parseDetails(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return {}; }
}

async function statutoryReadinessByEmployee({ organizationId, employeeIds, prismaClient = prisma }) {
  const ids = [...new Set((employeeIds || []).filter(Boolean))];
  if (!ids.length) return new Map();

  const onboardings = await prismaClient.employeeOnboarding.findMany({
    where: { organizationId, employeeId: { in: ids } },
    select: { employeeId: true, sectionData: true, updatedAt: true, createdAt: true },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });

  const latestByEmployee = new Map();
  for (const onboarding of onboardings) {
    if (!latestByEmployee.has(onboarding.employeeId)) latestByEmployee.set(onboarding.employeeId, onboarding);
  }

  const readiness = new Map();
  for (const employeeId of ids) {
    const onboarding = latestByEmployee.get(employeeId);
    const statutoryData = sectionDataFor(onboarding, "statutory-details", "statutoryDetails");
    const taxMissingFields = [];
    if (!hasText(statutoryData.taxIdentificationNumber)) taxMissingFields.push("Tax Identification Number");
    if (!hasText(statutoryData.payeState)) taxMissingFields.push("PAYE State");

    const pensionMissingFields = [];
    if (!hasText(statutoryData.pensionPfa)) pensionMissingFields.push("Pension PFA");
    if (!hasText(statutoryData.pensionPin)) pensionMissingFields.push("Pension PIN");

    readiness.set(employeeId, {
      employeeId,
      taxReady: taxMissingFields.length === 0,
      pensionReady: pensionMissingFields.length === 0,
      taxMissingFields,
      pensionMissingFields,
    });
  }

  return readiness;
}

async function validateNigeriaPayrollApproval({ organizationId, runId, prismaClient = prisma }) {
  const lines = await prismaClient.$queryRawUnsafe(
    `SELECT "employeeId","employeeNumber","details"
       FROM "payroll_run_lines"
      WHERE "organizationId"=$1 AND "runId"=$2`,
    organizationId,
    runId
  );

  if (!lines.length) {
    return {
      valid: true,
      approvalBlocked: false,
      missingTax: [],
      missingPension: [],
      withheldEmployeeIdsByType: { PAYE: [], PENSION: [] },
      withheldCount: 0,
    };
  }

  const readiness = await statutoryReadinessByEmployee({
    organizationId,
    employeeIds: lines.map((line) => line.employeeId),
    prismaClient,
  });

  const missingTax = [];
  const missingPension = [];

  for (const line of lines) {
    const details = parseDetails(line.details);
    const statutory = details.statutory || {};
    const employeeReadiness = readiness.get(line.employeeId) || {
      taxReady: false,
      pensionReady: false,
      taxMissingFields: ["Tax Identification Number", "PAYE State"],
      pensionMissingFields: ["Pension PFA", "Pension PIN"],
    };

    if (Number(statutory.payeTax || 0) > 0 && !employeeReadiness.taxReady) {
      missingTax.push({
        employeeId: line.employeeId,
        employeeNumber: line.employeeNumber,
        missingFields: employeeReadiness.taxMissingFields,
      });
    }

    if (Number(statutory.employeePension || 0) > 0 && !employeeReadiness.pensionReady) {
      missingPension.push({
        employeeId: line.employeeId,
        employeeNumber: line.employeeNumber,
        missingFields: employeeReadiness.pensionMissingFields,
      });
    }
  }

  return {
    valid: true,
    approvalBlocked: false,
    policy: "PAYROLL_APPROVABLE_WITH_STATUTORY_REMITTANCE_WITHHOLDING",
    missingTax,
    missingPension,
    missingTaxCount: missingTax.length,
    missingPensionCount: missingPension.length,
    withheldEmployeeIdsByType: {
      PAYE: missingTax.map((item) => item.employeeId),
      PENSION: missingPension.map((item) => item.employeeId),
    },
    withheldCount: new Set([...missingTax.map((item) => item.employeeId), ...missingPension.map((item) => item.employeeId)]).size,
    message: missingTax.length || missingPension.length
      ? "Payroll may be approved. Statutory obligations for employees with incomplete required identifiers will be withheld from remittance allocation until their details are completed."
      : "Payroll statutory identifiers are complete for calculated PAYE and pension obligations.",
  };
}

module.exports = {
  statutoryReadinessByEmployee,
  validateNigeriaPayrollApproval,
};
