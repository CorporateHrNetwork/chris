const prisma = require("../config/prisma");
const { getEmployeePolicyBalance } = require("./leaveBalanceService");
const {
  resolveEmploymentLevelFromDesignation,
} = require("./designationEmploymentLevelService");

function number(value) {
  return Number(value || 0);
}

function yearRange(leaveYear) {
  const year = Number(leaveYear || new Date().getFullYear());
  if (!Number.isInteger(year) || year < 2000 || year > 2200) {
    throw new Error("INVALID_LEAVE_YEAR");
  }
  return {
    year,
    start: new Date(Date.UTC(year, 0, 1)),
    end: new Date(Date.UTC(year + 1, 0, 1)),
  };
}

async function getEmployeeLeaveLedger({
  organizationId,
  employeeNumber,
  leavePolicyId,
  leaveYear,
  proposedUnits = 0,
  tx = prisma,
}) {
  const range = yearRange(leaveYear);
  const employee = await tx.employee.findFirst({
    where: { organizationId, employeeNumber },
    include: {
      department: true,
      designation: { include: { employmentLevel: true } },
      location: true,
    },
  });

  if (!employee) throw new Error("EMPLOYEE_NOT_FOUND");

  let employmentLevel = null;
  let levelException = null;
  try {
    const resolved = await resolveEmploymentLevelFromDesignation({
      organizationId,
      designationId: employee.designationId,
      tx,
    });
    employmentLevel = resolved.employmentLevel;
  } catch (error) {
    if (error.message !== "EMPLOYMENT_LEVEL_MAPPING_REQUIRED" && error.message !== "DESIGNATION_REQUIRED") throw error;
    levelException = {
      code: "EMPLOYMENT_LEVEL_MAPPING_REQUIRED",
      message: "Employee designation requires an Employment Level mapping.",
    };
  }

  const policies = await tx.leavePolicy.findMany({
    where: {
      organizationId,
      status: "ACTIVE",
      isActive: true,
      effectiveFrom: { lt: range.end },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: range.start } }],
    },
    include: { leaveType: true },
    orderBy: [{ leaveType: { name: "asc" } }, { name: "asc" }],
  });

  const selectedPolicy = leavePolicyId
    ? policies.find((policy) => policy.id === leavePolicyId)
    : null;
  if (leavePolicyId && !selectedPolicy) {
    throw new Error("TENANT_ACTIVE_LEAVE_POLICY_NOT_FOUND");
  }

  let ledger = null;
  if (selectedPolicy) {
    const [projection, allocations, requests, adjustments] = await Promise.all([
      getEmployeePolicyBalance({
        organizationId,
        employeeNumber,
        leavePolicyId: selectedPolicy.id,
        leaveYear: range.year,
        tx,
      }),
      tx.leaveEntitlementAllocation.findMany({
        where: {
          organizationId,
          employeeId: employee.id,
          leavePolicyId: selectedPolicy.id,
          leaveYear: range.year,
        },
        include: { createdBy: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
      }),
      tx.leaveRequest.findMany({
        where: {
          organizationId,
          employeeId: employee.id,
          leavePolicyId: selectedPolicy.id,
          startDate: { gte: range.start, lt: range.end },
        },
        orderBy: [{ startDate: "desc" }, { submittedAt: "desc" }],
      }),
      tx.leaveEntitlementAdjustment.findMany({
        where: {
          organizationId,
          employeeId: employee.id,
          leavePolicyId: selectedPolicy.id,
          leaveYear: range.year,
        },
        include: { createdBy: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
      }),
    ]);

    const pending = requests.filter((request) => request.status === "PENDING");
    const approvedUpcoming = requests.filter((request) =>
      request.status === "APPROVED" && new Date(request.startDate) >= new Date()
    );
    const active = requests.filter((request) => request.status === "ACTIVE");
    const proposed = Math.max(0, number(proposedUnits));
    const latestAllocation = allocations[0] || null;

    ledger = {
      policy: selectedPolicy,
      policyVersion: selectedPolicy.versionNumber,
      leaveYear: range.year,
      employmentLevel,
      allocation: latestAllocation,
      baseEntitlement: latestAllocation
        ? number(latestAllocation.baseEntitlement)
        : projection.entitlement,
      allocatedEntitlement: latestAllocation
        ? number(latestAllocation.allocatedEntitlement)
        : projection.entitlement,
      carryover: projection.carryover,
      accrued: projection.accrued,
      adjustments: projection.adjustments,
      totalEntitlement:
        number(projection.openingBalance) +
        projection.accrued +
        projection.carryover +
        projection.adjustments,
      used: projection.used,
      pending: projection.committed,
      approvedUpcoming: approvedUpcoming.reduce((sum, request) => sum + number(request.requestedUnits), 0),
      activeLeave: active.reduce((sum, request) => sum + number(request.requestedUnits), 0),
      grossAvailableBeforeCommitments: projection.ledgerAvailable,
      requestableAvailable: projection.available,
      available: projection.available,
      maximumRequestable: projection.maximumRequestable,
      proposedUnits: proposed,
      projectedRemainingBalance: Math.max(0, projection.available - proposed),
      unit: projection.unit,
      hasEntitlement: projection.hasEntitlement,
      lastUpdated: projection.hasEntitlement
        ? (await tx.leaveBalance.findUnique({
            where: {
              organizationId_employeeId_leaveTypeId_leaveYear: {
                organizationId,
                employeeId: employee.id,
                leaveTypeId: selectedPolicy.leaveTypeId,
                leaveYear: range.year,
              },
            },
            select: { updatedAt: true },
          }))?.updatedAt || null
        : null,
      buckets: { pending, approvedUpcoming, active },
      history: { allocations, adjustments, requests },
    };
  }

  return {
    employee,
    employmentLevel,
    leaveYear: range.year,
    policies,
    ledger,
    exceptions: levelException ? [levelException] : [],
  };
}

module.exports = { getEmployeeLeaveLedger, yearRange };
