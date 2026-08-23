const prisma = require("../config/prisma");
const { projectBalance } = require("./leaveBalanceService");
const { policyEntitlementForService } = require("./leaveService");

const number = (value) => Number(value || 0);

async function createEntitlementAdjustment({
  organizationId,
  actorUserId,
  employeeNumber,
  leavePolicyId,
  leaveYear,
  amount,
  reason,
  effectiveDate,
}) {
  const adjustment = Number(amount);
  const year = Number(leaveYear || new Date().getFullYear());
  const date = effectiveDate ? new Date(effectiveDate) : new Date();
  const explanation = String(reason || "").trim();

  if (!organizationId) throw new Error("ORGANIZATION_REQUIRED");
  if (!employeeNumber) throw new Error("EMPLOYEE_REQUIRED");
  if (!leavePolicyId) throw new Error("LEAVE_POLICY_REQUIRED");
  if (!Number.isFinite(adjustment) || adjustment === 0) throw new Error("INVALID_ADJUSTMENT_AMOUNT");
  if (!Number.isInteger(year) || year < 2000 || year > 2200) throw new Error("INVALID_LEAVE_YEAR");
  if (!explanation) throw new Error("ADJUSTMENT_REASON_REQUIRED");
  if (Number.isNaN(date.getTime())) throw new Error("INVALID_ADJUSTMENT_DATE");

  return prisma.$transaction(async (tx) => {
    const [employee, policy] = await Promise.all([
      tx.employee.findFirst({
        where: { organizationId, employeeNumber },
        select: { id: true, employeeNumber: true, firstName: true, middleName: true, lastName: true, employmentEpisodes: { where: { endDate: null }, orderBy: { sequenceNumber: "desc" }, take: 1, select: { startDate: true } } },
      }),
      tx.leavePolicy.findFirst({
        where: { id: leavePolicyId, organizationId, status: "ACTIVE", isActive: true },
        include: { leaveType: true },
      }),
    ]);
    if (!employee) throw new Error("EMPLOYEE_NOT_FOUND");
    if (!policy) throw new Error("TENANT_ACTIVE_LEAVE_POLICY_NOT_FOUND");
    const episode = employee.employmentEpisodes[0];
    const serviceDays = episode ? Math.max(0, Math.floor((date - new Date(episode.startDate)) / 86400000)) : 0;
    const policyEntitlement = policyEntitlementForService(policy, { eligibility: { measured: { serviceDays } } });

    let balance = await tx.leaveBalance.findUnique({
      where: {
        organizationId_employeeId_leaveTypeId_leaveYear: {
          organizationId,
          employeeId: employee.id,
          leaveTypeId: policy.leaveTypeId,
          leaveYear: year,
        },
      },
    });
    if (!balance) {
      balance = await tx.leaveBalance.create({
        data: {
          organizationId,
          employeeId: employee.id,
          leaveTypeId: policy.leaveTypeId,
          leaveYear: year,
          openingBalance: policyEntitlement,
        },
      });
    }

    const yearStart = new Date(Date.UTC(year, 0, 1));
    const nextYearStart = new Date(Date.UTC(year + 1, 0, 1));
    const pending = await tx.leaveRequest.aggregate({
      where: {
        organizationId,
        employeeId: employee.id,
        leavePolicyId: policy.id,
        status: "PENDING",
        startDate: { gte: yearStart, lt: nextYearStart },
      },
      _sum: { requestedUnits: true },
    });

    const before = projectBalance({
      balance,
      policy,
      committed: pending._sum.requestedUnits,
      entitlement: policyEntitlement,
    });
    const candidate = {
      ...balance,
      adjusted: number(balance.adjusted) + adjustment,
    };
    const after = projectBalance({
      balance: candidate,
      policy,
      committed: pending._sum.requestedUnits,
      entitlement: policyEntitlement,
    });
    const permittedFloor = policy.allowNegativeBalance
      ? -number(policy.maxNegativeDays || policy.balanceRules?.maximumNegativeBalance)
      : 0;
    if (after.available < permittedFloor) throw new Error("ADJUSTMENT_EXCEEDS_AVAILABLE_BALANCE");

    const updatedBalance = await tx.leaveBalance.update({
      where: { id: balance.id },
      data: { adjusted: { increment: adjustment } },
    });
    const audit = await tx.leaveEntitlementAdjustment.create({
      data: {
        organizationId,
        employeeId: employee.id,
        leaveBalanceId: balance.id,
        leaveTypeId: policy.leaveTypeId,
        leavePolicyId: policy.id,
        leaveYear: year,
        amount: adjustment,
        balanceBefore: before.available,
        balanceAfter: after.available,
        reason: explanation,
        effectiveDate: date,
        createdByUserId: actorUserId || null,
      },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    return { adjustment: audit, balance: updatedBalance, projection: after };
  });
}

async function listEntitlementAdjustments({ organizationId, employeeNumber, leavePolicyId, leaveYear }) {
  const where = { organizationId };
  if (leavePolicyId) where.leavePolicyId = leavePolicyId;
  if (leaveYear) where.leaveYear = Number(leaveYear);
  if (employeeNumber) {
    where.employee = { employeeNumber };
  }
  return prisma.leaveEntitlementAdjustment.findMany({
    where,
    include: {
      employee: { select: { employeeNumber: true, firstName: true, middleName: true, lastName: true } },
      leavePolicy: { select: { id: true, name: true, versionNumber: true } },
      leaveType: { select: { id: true, name: true, code: true } },
      createdBy: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
  });
}

module.exports = { createEntitlementAdjustment, listEntitlementAdjustments };
