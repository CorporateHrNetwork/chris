const prisma = require("../config/prisma");

const CURRENT_PAYROLL_STATUSES = [
  "ACTIVE",
  "PROBATION",
  "LEAVE",
  "SUSPENDED",
];

function hasText(value) {
  return Boolean(String(value || "").trim());
}

function sectionDataFor(onboarding, key, fallbackKey) {
  const sectionData = onboarding?.sectionData;
  if (!sectionData || typeof sectionData !== "object") return {};
  const value = sectionData[key] || sectionData[fallbackKey];
  return value && typeof value === "object" ? value : {};
}

function paymentIsReady(payment) {
  const accountNumber = String(payment?.accountNumber || "").replace(/\D/g, "");
  return Boolean(
    hasText(payment?.bankName) &&
      hasText(payment?.accountName) &&
      accountNumber.length === 10 &&
      hasText(payment?.payrollCurrency) &&
      hasText(payment?.paymentMethod)
  );
}

function statutorySignals(statutory) {
  return {
    taxRecorded: Boolean(
      hasText(statutory?.taxIdentificationNumber) && hasText(statutory?.payeState)
    ),
    pensionRecorded: Boolean(
      hasText(statutory?.pensionPfa) && hasText(statutory?.pensionPin)
    ),
  };
}

async function activeSalaryRates(prismaClient, organizationId) {
  try {
    const rows = await prismaClient.$queryRawUnsafe(
      `SELECT DISTINCT ON ("employeeId") "employeeId", "amount", "currency", "effectiveFrom", "effectiveTo"
         FROM "payroll_salary_rates"
        WHERE "organizationId"=$1 AND "status"='ACTIVE'
          AND "effectiveFrom" <= CURRENT_DATE
          AND ("effectiveTo" IS NULL OR "effectiveTo" >= CURRENT_DATE)
        ORDER BY "employeeId", "effectiveFrom" DESC`,
      organizationId
    );
    return new Map(rows.map((row) => [row.employeeId, row]));
  } catch (error) {
    if (String(error?.message || "").includes("payroll_salary_rates")) return new Map();
    throw error;
  }
}

async function activePayrollPolicy(prismaClient, organizationId) {
  try {
    const rows = await prismaClient.$queryRawUnsafe(
      `SELECT "id","code","versionNumber","jurisdiction"
         FROM "payroll_policy_versions"
        WHERE "organizationId"=$1 AND "status"='ACTIVE'
          AND "effectiveFrom" <= CURRENT_DATE
          AND ("effectiveTo" IS NULL OR "effectiveTo" >= CURRENT_DATE)
        ORDER BY "effectiveFrom" DESC,"versionNumber" DESC LIMIT 1`,
      organizationId
    );
    return rows[0] || null;
  } catch (error) {
    if (String(error?.message || "").includes("payroll_policy_versions")) return null;
    throw error;
  }
}

async function getPayrollReadiness({ organizationId, prismaClient = prisma }) {
  const employees = await prismaClient.employee.findMany({
    where: { organizationId, status: { in: CURRENT_PAYROLL_STATUSES } },
    select: {
      id: true,
      employeeNumber: true,
      firstName: true,
      middleName: true,
      lastName: true,
      status: true,
      employmentType: true,
      costCentreId: true,
    },
    orderBy: { employeeNumber: "asc" },
  });

  const employeeIds = employees.map((employee) => employee.id);
  const [onboardings, attendanceSetting, salaryRateByEmployee, payrollPolicy] = await Promise.all([
    employeeIds.length
      ? prismaClient.employeeOnboarding.findMany({
          where: { organizationId, employeeId: { in: employeeIds } },
          select: {
            employeeId: true,
            sectionData: true,
            status: true,
            completionPercent: true,
            updatedAt: true,
            createdAt: true,
          },
          orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        })
      : Promise.resolve([]),
    prismaClient.attendancePayrollSetting.findUnique({
      where: { organizationId },
      select: { basis: true },
    }),
    activeSalaryRates(prismaClient, organizationId),
    activePayrollPolicy(prismaClient, organizationId),
  ]);

  const latestOnboardingByEmployee = new Map();
  for (const onboarding of onboardings) {
    if (!latestOnboardingByEmployee.has(onboarding.employeeId)) {
      latestOnboardingByEmployee.set(onboarding.employeeId, onboarding);
    }
  }

  const rows = employees.map((employee) => {
    const onboarding = latestOnboardingByEmployee.get(employee.id);
    const payment = sectionDataFor(onboarding, "payment-details", "paymentDetails");
    const statutory = sectionDataFor(onboarding, "statutory-details", "statutoryDetails");
    const salaryRate = salaryRateByEmployee.get(employee.id);
    const employmentReady = Boolean(hasText(employee.employmentType) && hasText(employee.costCentreId));
    const paymentReady = paymentIsReady(payment);
    const compensationReady = Boolean(salaryRate && Number(salaryRate.amount) > 0);
    const calculationReady = employmentReady && compensationReady;
    const paymentFinalizationReady = calculationReady && paymentReady;
    const { taxRecorded, pensionRecorded } = statutorySignals(statutory);
    const blockers = [];

    if (!hasText(employee.employmentType)) blockers.push("EMPLOYMENT_TYPE_MISSING");
    if (!hasText(employee.costCentreId)) blockers.push("COST_CENTRE_MISSING");
    if (!paymentReady) blockers.push("PAYMENT_PROFILE_INCOMPLETE");
    if (!compensationReady) blockers.push("AUTHORITATIVE_COMPENSATION_RATE_NOT_CONFIGURED");

    return {
      employeeId: employee.id,
      employeeNumber: employee.employeeNumber,
      employeeName: [employee.firstName, employee.middleName, employee.lastName]
        .filter(Boolean)
        .join(" "),
      status: employee.status,
      employmentType: employee.employmentType,
      employmentReady,
      paymentReady,
      compensationReady,
      calculationReady,
      paymentFinalizationReady,
      monthlyGrossSalary: compensationReady ? Number(salaryRate.amount) : null,
      salaryCurrency: compensationReady ? salaryRate.currency : null,
      taxRecorded,
      pensionRecorded,
      onboardingStatus: onboarding?.status || null,
      onboardingCompletionPercent: Number(onboarding?.completionPercent || 0),
      // Backward-compatible field consumed by the draft-payroll route/UI.
      // Draft calculation needs employment/costing + compensation authority;
      // bank/payment readiness is a separate finalization control.
      readyForExecution: calculationReady,
      blockers,
    };
  });

  const summary = rows.reduce(
    (accumulator, row) => {
      if (row.employmentReady) accumulator.employmentReady += 1;
      if (row.paymentReady) accumulator.paymentReady += 1;
      if (row.compensationReady) accumulator.compensationReady += 1;
      if (row.calculationReady) accumulator.calculationReady += 1;
      if (row.paymentFinalizationReady) accumulator.paymentFinalizationReady += 1;
      if (row.taxRecorded) accumulator.taxRecorded += 1;
      if (row.pensionRecorded) accumulator.pensionRecorded += 1;
      if (row.readyForExecution) accumulator.readyForExecution += 1;
      return accumulator;
    },
    {
      currentEmployees: rows.length,
      employmentReady: 0,
      paymentReady: 0,
      compensationReady: 0,
      calculationReady: 0,
      paymentFinalizationReady: 0,
      taxRecorded: 0,
      pensionRecorded: 0,
      readyForExecution: 0,
    }
  );

  const readinessDimensions = summary.currentEmployees > 0 ? summary.currentEmployees * 3 : 0;
  const completedDimensions = summary.employmentReady + summary.paymentReady + summary.compensationReady;
  summary.dataReadinessPercent = readinessDimensions
    ? Math.round((completedDimensions / readinessDimensions) * 100)
    : 0;
  summary.attendanceBasis = attendanceSetting?.basis || "SYSTEM";
  summary.statutoryPolicyConfigured = Boolean(payrollPolicy);
  summary.statutoryPolicyCode = payrollPolicy?.code || null;
  summary.statutoryPolicyVersion = payrollPolicy?.versionNumber || null;

  const missingEmployment = summary.currentEmployees - summary.employmentReady;
  const missingCompensation = summary.currentEmployees - summary.compensationReady;
  const missingPayment = summary.currentEmployees - summary.paymentReady;
  const systemBlockers = [];

  if (missingEmployment > 0) {
    systemBlockers.push({
      code: "EMPLOYMENT_COSTING_AUTHORITY_INCOMPLETE",
      message: `${missingEmployment} current employee(s) still require authoritative Employment Type and Cost Centre data.`,
    });
  }
  if (missingCompensation > 0) {
    systemBlockers.push({
      code: "AUTHORITATIVE_COMPENSATION_RATES_INCOMPLETE",
      message: `${missingCompensation} current employee(s) still require an effective salary rate.`,
    });
  }
  if (!payrollPolicy) {
    systemBlockers.push({
      code: "PAYROLL_STATUTORY_POLICY_NOT_CONFIGURED",
      message: "An effective Nigeria payroll policy must be configured before statutory payroll calculation.",
    });
  }

  const executionEnabled =
    summary.currentEmployees > 0 &&
    summary.calculationReady === summary.currentEmployees;

  const paymentFinalizationEnabled =
    executionEnabled &&
    summary.paymentFinalizationReady === summary.currentEmployees;

  const finalizationBlockers = [];
  if (!payrollPolicy) {
    finalizationBlockers.push({
      code: "PAYROLL_STATUTORY_POLICY_NOT_CONFIGURED",
      message: "Apply/configure the effective Nigeria payroll policy before payroll finalization.",
    });
  }
  if (missingPayment > 0) {
    finalizationBlockers.push({
      code: "PAYMENT_PROFILES_INCOMPLETE",
      message: `${missingPayment} current employee(s) have incomplete/invalid payment profiles. This does not block draft payroll calculation, but it must be resolved before payment finalization.`,
    });
  }
  finalizationBlockers.push({
    code: "PAYMENT_TRANSMISSION_SEPARATE_CONTROL",
    message: "PAYE and pension are calculated by CHRiS, but payroll approval does not itself transmit bank/payment instructions or statutory remittances.",
  });

  return {
    generatedAt: new Date().toISOString(),
    executionEnabled,
    calculationEnabled: executionEnabled,
    statutoryCalculationEnabled: executionEnabled && Boolean(payrollPolicy),
    paymentFinalizationEnabled,
    finalizationEnabled: paymentFinalizationEnabled && Boolean(payrollPolicy),
    paymentTransmissionEnabled: false,
    systemBlockers,
    finalizationBlockers,
    summary,
    employees: rows,
  };
}

module.exports = {
  CURRENT_PAYROLL_STATUSES,
  getPayrollReadiness,
};
