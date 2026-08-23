const prisma = require("../config/prisma");

const number = (value) => Number(value || 0);

function entitlementUnit(policy) {
  return (
    policy?.entitlementRules?.unit ||
    (policy?.leaveType?.unit === "HOURS"
      ? "HOURS"
      : "WORKING_DAYS")
  );
}

function maximumRequestable({
  available,
  policy,
}) {
  const requestRules =
    policy?.requestRules &&
    typeof policy.requestRules === "object"
      ? policy.requestRules
      : {};

  const balanceRules =
    policy?.balanceRules &&
    typeof policy.balanceRules === "object"
      ? policy.balanceRules
      : {};

  let usable = number(available);

  const negativeBalanceAllowed =
    policy?.allowNegativeBalance === true ||
    balanceRules.negativeBalanceAllowed === true;

  if (negativeBalanceAllowed) {
    usable += number(
      policy?.maxNegativeDays ??
        balanceRules.maximumNegativeBalance
    );
  }

  const configuredMaximum =
    requestRules.maximumDuration ??
    requestRules.maximumDaysPerRequest ??
    null;

  const requestCap =
    configuredMaximum == null
      ? Number.POSITIVE_INFINITY
      : number(configuredMaximum);

  return Math.max(
    0,
    Math.min(usable, requestCap)
  );
}

function projectBalance({
  balance,
  policy,
  committed = 0,
  entitlement,
}) {
  const opening = number(balance?.openingBalance);
  const accrued = number(balance?.accrued);
  const carryover = number(
    balance?.carriedForward
  );
  const adjustments = number(balance?.adjusted);
  const used = number(balance?.used);
  const committedUnits = number(committed);

  const baseEntitlement = number(
    entitlement ??
      policy?.entitlementDays ??
      balance?.openingBalance
  );

  const authoritativeAvailable =
    opening +
    accrued +
    carryover +
    adjustments -
    used;

  const requestableAvailable =
    authoritativeAvailable - committedUnits;

  return {
    entitlement: baseEntitlement,
    openingBalance: opening,
    accrued,
    carryover,
    adjustments,
    used,
    committed: committedUnits,
    available: requestableAvailable,
    ledgerAvailable: authoritativeAvailable,
    maximumRequestable: maximumRequestable({
      available: requestableAvailable,
      policy,
    }),
    unit: entitlementUnit(policy),
    hasEntitlement: Boolean(balance),
  };
}

async function getEmployeePolicyBalance({
  organizationId,
  employeeNumber,
  leavePolicyId,
  leaveYear,
  entitlement,
  tx = prisma,
}) {
  const year = Number(
    leaveYear || new Date().getFullYear()
  );

  if (!organizationId) {
    throw new Error("ORGANIZATION_REQUIRED");
  }

  if (!employeeNumber) {
    throw new Error("EMPLOYEE_REQUIRED");
  }

  if (!leavePolicyId) {
    throw new Error("LEAVE_POLICY_REQUIRED");
  }

  const employee = await tx.employee.findFirst({
    where: {
      organizationId,
      employeeNumber,
    },
    select: {
      id: true,
      employeeNumber: true,
      firstName: true,
      middleName: true,
      lastName: true,
    },
  });

  if (!employee) {
    throw new Error("EMPLOYEE_NOT_FOUND");
  }

  const policy = await tx.leavePolicy.findFirst({
    where: {
      id: leavePolicyId,
      organizationId,
      status: "ACTIVE",
      isActive: true,
    },
    include: {
      leaveType: true,
    },
  });

  if (!policy) {
    throw new Error(
      "TENANT_ACTIVE_LEAVE_POLICY_NOT_FOUND"
    );
  }

  const yearStart = new Date(
    Date.UTC(year, 0, 1)
  );

  const nextYearStart = new Date(
    Date.UTC(year + 1, 0, 1)
  );

  const [balance, pending] =
    await Promise.all([
      tx.leaveBalance.findUnique({
        where: {
          organizationId_employeeId_leaveTypeId_leaveYear:
            {
              organizationId,
              employeeId: employee.id,
              leaveTypeId: policy.leaveTypeId,
              leaveYear: year,
            },
        },
      }),

      tx.leaveRequest.aggregate({
        where: {
          organizationId,
          employeeId: employee.id,
          leavePolicyId: policy.id,
          status: "PENDING",
          startDate: {
            gte: yearStart,
            lt: nextYearStart,
          },
        },
        _sum: {
          requestedUnits: true,
        },
      }),
    ]);

  const projected = projectBalance({
    balance,
    policy,
    committed: pending._sum.requestedUnits,
    entitlement: entitlement ?? policy.entitlementDays,
  });

  return {
    employee,
    policy: {
      id: policy.id,
      name: policy.name,
      versionNumber: policy.versionNumber,
      leaveTypeId: policy.leaveTypeId,
      leaveType: policy.leaveType,
    },
    leaveYear: year,
    ...projected,
  };
}

module.exports = {
  entitlementUnit,
  maximumRequestable,
  projectBalance,
  getEmployeePolicyBalance,
};
