const prisma = require("../config/prisma");

function complianceError(code, message, details) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = 409;
  error.details = details;
  return error;
}

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

async function validateNigeriaPayrollApproval({ organizationId, runId, prismaClient = prisma }) {
  const lines = await prismaClient.$queryRawUnsafe(
    `SELECT "employeeId","employeeNumber","details"
       FROM "payroll_run_lines"
      WHERE "organizationId"=$1 AND "runId"=$2`,
    organizationId,
    runId
  );
  if (!lines.length) return { valid: true, missingTax: [], missingPension: [] };

  const employeeIds = lines.map((line) => line.employeeId);
  const onboardings = await prismaClient.employeeOnboarding.findMany({
    where: { organizationId, employeeId: { in: employeeIds } },
    select: { employeeId: true, sectionData: true, updatedAt: true, createdAt: true },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });
  const latestByEmployee = new Map();
  for (const onboarding of onboardings) {
    if (!latestByEmployee.has(onboarding.employeeId)) latestByEmployee.set(onboarding.employeeId, onboarding);
  }

  const missingTax = [];
  const missingPension = [];
  for (const line of lines) {
    const details = parseDetails(line.details);
    const statutory = details.statutory || {};
    const onboarding = latestByEmployee.get(line.employeeId);
    const statutoryData = sectionDataFor(onboarding, "statutory-details", "statutoryDetails");
    if (Number(statutory.payeTax || 0) > 0) {
      const taxReady = hasText(statutoryData.taxIdentificationNumber) && hasText(statutoryData.payeState);
      if (!taxReady) missingTax.push(line.employeeNumber);
    }
    if (Number(statutory.employeePension || 0) > 0) {
      const pensionReady = hasText(statutoryData.pensionPfa) && hasText(statutoryData.pensionPin);
      if (!pensionReady) missingPension.push(line.employeeNumber);
    }
  }

  if (missingTax.length || missingPension.length) {
    throw complianceError(
      "NIGERIA_STATUTORY_IDENTIFIERS_INCOMPLETE",
      "Payroll approval is blocked because one or more employees with calculated PAYE/pension do not have the required statutory identifiers in their employee record.",
      {
        missingTax: missingTax.slice(0, 50),
        missingTaxCount: missingTax.length,
        missingPension: missingPension.slice(0, 50),
        missingPensionCount: missingPension.length,
      }
    );
  }

  return { valid: true, missingTax: [], missingPension: [] };
}

module.exports = {
  validateNigeriaPayrollApproval,
};
