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

  if (!sectionData || typeof sectionData !== "object") {
    return {};
  }

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
  const taxRecorded = Boolean(
    hasText(statutory?.taxIdentificationNumber) && hasText(statutory?.payeState)
  );

  const pensionRecorded = Boolean(
    hasText(statutory?.pensionPfa) && hasText(statutory?.pensionPin)
  );

  return {
    taxRecorded,
    pensionRecorded,
  };
}

async function getPayrollReadiness({ organizationId, prismaClient = prisma }) {
  const employees = await prismaClient.employee.findMany({
    where: {
      organizationId,
      status: {
        in: CURRENT_PAYROLL_STATUSES,
      },
    },
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
    orderBy: {
      employeeNumber: "asc",
    },
  });

  const employeeIds = employees.map((employee) => employee.id);

  const [onboardings, attendanceSetting] = await Promise.all([
    employeeIds.length
      ? prismaClient.employeeOnboarding.findMany({
          where: {
            organizationId,
            employeeId: {
              in: employeeIds,
            },
          },
          select: {
            employeeId: true,
            sectionData: true,
            status: true,
            completionPercent: true,
            updatedAt: true,
            createdAt: true,
          },
          orderBy: [
            { updatedAt: "desc" },
            { createdAt: "desc" },
          ],
        })
      : Promise.resolve([]),
    prismaClient.attendancePayrollSetting.findUnique({
      where: {
        organizationId,
      },
      select: {
        basis: true,
      },
    }),
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
    const statutory = sectionDataFor(
      onboarding,
      "statutory-details",
      "statutoryDetails"
    );

    const employmentReady = Boolean(
      hasText(employee.employmentType) && hasText(employee.costCentreId)
    );
    const paymentReady = paymentIsReady(payment);
    const compensationReady = false;
    const { taxRecorded, pensionRecorded } = statutorySignals(statutory);

    const blockers = [];

    if (!hasText(employee.employmentType)) {
      blockers.push("EMPLOYMENT_TYPE_MISSING");
    }

    if (!hasText(employee.costCentreId)) {
      blockers.push("COST_CENTRE_MISSING");
    }

    if (!paymentReady) {
      blockers.push("PAYMENT_PROFILE_INCOMPLETE");
    }

    blockers.push("AUTHORITATIVE_COMPENSATION_RATE_NOT_CONFIGURED");

    return {
      employeeId: employee.id,
      employeeNumber: employee.employeeNumber,
      employeeName: [
        employee.firstName,
        employee.middleName,
        employee.lastName,
      ]
        .filter(Boolean)
        .join(" "),
      status: employee.status,
      employmentType: employee.employmentType,
      employmentReady,
      paymentReady,
      compensationReady,
      taxRecorded,
      pensionRecorded,
      onboardingStatus: onboarding?.status || null,
      onboardingCompletionPercent: Number(onboarding?.completionPercent || 0),
      readyForExecution: false,
      blockers,
    };
  });

  const summary = rows.reduce(
    (accumulator, row) => {
      if (row.employmentReady) accumulator.employmentReady += 1;
      if (row.paymentReady) accumulator.paymentReady += 1;
      if (row.compensationReady) accumulator.compensationReady += 1;
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
      taxRecorded: 0,
      pensionRecorded: 0,
      readyForExecution: 0,
    }
  );

  const readinessDimensions =
    summary.currentEmployees > 0
      ? summary.currentEmployees * 3
      : 0;
  const completedDimensions =
    summary.employmentReady + summary.paymentReady + summary.compensationReady;

  summary.dataReadinessPercent = readinessDimensions
    ? Math.round((completedDimensions / readinessDimensions) * 100)
    : 0;
  summary.attendanceBasis = attendanceSetting?.basis || "SYSTEM";

  return {
    generatedAt: new Date().toISOString(),
    executionEnabled: false,
    systemBlockers: [
      {
        code: "AUTHORITATIVE_COMPENSATION_RATE_MODEL_NOT_AVAILABLE",
        message:
          "Payroll execution remains disabled until effective-dated authoritative compensation rates are available.",
      },
    ],
    summary,
    employees: rows,
  };
}

module.exports = {
  CURRENT_PAYROLL_STATUSES,
  getPayrollReadiness,
};
