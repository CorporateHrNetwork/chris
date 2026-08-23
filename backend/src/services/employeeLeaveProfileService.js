const prisma = require("../config/prisma");
const { getEntitlementRegister } = require("./leaveOperationalService");
const { listEntitlementAdjustments } = require("./leaveEntitlementAdjustmentService");

async function getEmployeeLeaveProfile({ organizationId, employeeNumber, asOfDate = new Date() }) {
  const employee = await prisma.employee.findFirst({
    where: { organizationId, employeeNumber },
    select: { id: true, employeeNumber: true, firstName: true, middleName: true, lastName: true, status: true, department: { select: { id: true, name: true } }, designation: { select: { id: true, name: true } }, location: { select: { id: true, name: true } } },
  });
  if (!employee) throw new Error("EMPLOYEE_NOT_FOUND");

  const now = new Date(asOfDate);
  const [entitlementRows, requests, adjustments] = await Promise.all([
    getEntitlementRegister({ organizationId, asOfDate: now, employeeNumber }),
    prisma.leaveRequest.findMany({
      where: { organizationId, employeeId: employee.id },
      include: { leaveType: true, leavePolicy: true },
      orderBy: [{ startDate: "desc" }, { submittedAt: "desc" }],
    }),
    listEntitlementAdjustments({ organizationId, employeeNumber }),
  ]);

  const activeLeave = requests.find((request) => request.status === "ACTIVE") || null;
  const nextUpcomingApprovedLeave = requests
    .filter((request) => request.status === "APPROVED" && new Date(request.startDate) >= now)
    .sort((left, right) => new Date(left.startDate) - new Date(right.startDate))[0] || null;
  const warnings = [];
  if (employee.status === "LEAVE" && !activeLeave) warnings.push("Leave data requires review: Employee is marked On Leave but no active commenced leave request exists.");
  if (employee.status !== "LEAVE" && activeLeave) warnings.push("An ACTIVE leave request exists while employee status is not Leave.");
  entitlementRows.forEach((row) => {
    if (Number(row.available) < 0) warnings.push(`${row.policyName} has a negative authoritative available balance.`);
  });

  return {
    employee,
    assignedPolicies: entitlementRows.map((row) => ({
      id: row.policyId,
      name: row.policyName,
      versionNumber: row.policyVersion,
      leaveType: row.leaveType,
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo,
    })),
    entitlements: entitlementRows,
    balances: entitlementRows.map((row) => ({
      policyId: row.policyId,
      policyName: row.policyName,
      leaveYear: row.leaveYear,
      entitlement: row.entitlement,
      carryover: row.carryover,
      used: row.used,
      committed: row.committed,
      available: row.available,
      maximumRequestable: row.maximumRequestable,
      adjustment: row.adjustments,
      unit: row.unit,
    })),
    utilizationHistory: requests,
    adjustmentHistory: adjustments,
    activeLeave,
    nextUpcomingApprovedLeave,
    exceptionWarnings: warnings,
    balanceDefinitions: {
      entitlement: "Policy/year entitlement.",
      used: "Already consumed through approved lifecycle semantics.",
      committed: "Pending requests only.",
      available: "Authoritative available balance less committed pending requests.",
      adjustment: "Signed audited entitlement/balance adjustment.",
    },
  };
}

module.exports = { getEmployeeLeaveProfile };
