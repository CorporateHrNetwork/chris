const prisma = require("../config/prisma");

const ZERMATT_SLUG = "zermatt-liquor-limited";
const ANNUAL_POLICY_CODE = "ZLL-ANNUAL-FT";
const Q1_EXPIRY_MONTH = 3;
const Q1_EXPIRY_DAY = 31;
const FORFEIT_REASON_PREFIX = "ZERMATT_ANNUAL_CARRYOVER_FORFEIT";
const CURRENT_STATUSES = ["ACTIVE", "PROBATION", "LEAVE", "SUSPENDED"];

const n = (value) => Number(value || 0);

function yearBounds(year) {
  return {
    start: new Date(Date.UTC(year, 0, 1)),
    next: new Date(Date.UTC(year + 1, 0, 1)),
  };
}

function carryoverExpiryDate(year) {
  return new Date(Date.UTC(year, Q1_EXPIRY_MONTH - 1, Q1_EXPIRY_DAY, 23, 59, 59, 999));
}

function sourceYearClosed(sourceYear, asOfDate = new Date()) {
  return new Date(asOfDate) >= new Date(Date.UTC(sourceYear + 1, 0, 1));
}

async function assertZermattAnnualPolicy(organizationId, tx = prisma) {
  const organization = await tx.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, slug: true, name: true },
  });
  if (!organization || organization.slug !== ZERMATT_SLUG) throw new Error("ZERMATT_TENANT_REQUIRED");
  const policy = await tx.leavePolicy.findFirst({
    where: {
      organizationId,
      code: ANNUAL_POLICY_CODE,
      status: "ACTIVE",
      isActive: true,
    },
    include: { leaveType: true },
    orderBy: [{ versionNumber: "desc" }, { effectiveFrom: "desc" }],
  });
  if (!policy) throw new Error("ZERMATT_ANNUAL_POLICY_NOT_CONFIGURED");
  return { organization, policy };
}

async function q1AnnualUsage({ organizationId, employeeId, leavePolicyId, leaveYear, tx = prisma }) {
  const q1EndExclusive = new Date(Date.UTC(leaveYear, 3, 1));
  const result = await tx.leaveRequest.aggregate({
    where: {
      organizationId,
      employeeId,
      leavePolicyId,
      status: { in: ["APPROVED", "ACTIVE", "COMPLETED"] },
      startDate: { gte: new Date(Date.UTC(leaveYear, 0, 1)), lt: q1EndExclusive },
    },
    _sum: { requestedUnits: true },
  });
  return n(result._sum.requestedUnits);
}

async function priorForfeit({ organizationId, employeeId, leavePolicyId, leaveYear, tx = prisma }) {
  const rows = await tx.leaveEntitlementAdjustment.findMany({
    where: {
      organizationId,
      employeeId,
      leavePolicyId,
      leaveYear,
      reason: { startsWith: `${FORFEIT_REASON_PREFIX}:${leaveYear}:` },
    },
    select: { amount: true },
  });
  return rows.reduce((sum, row) => sum + Math.abs(Math.min(0, n(row.amount))), 0);
}

async function carryoverStatus({ organizationId, balance, policy, leaveYear, asOfDate = new Date(), tx = prisma }) {
  const granted = n(balance?.carriedForward);
  const usedInQ1 = granted > 0
    ? await q1AnnualUsage({ organizationId, employeeId: balance.employeeId, leavePolicyId: policy.id, leaveYear, tx })
    : 0;
  const consumed = Math.min(granted, usedInQ1);
  const forfeited = granted > 0
    ? await priorForfeit({ organizationId, employeeId: balance.employeeId, leavePolicyId: policy.id, leaveYear, tx })
    : 0;
  const remaining = Math.max(0, granted - consumed - forfeited);
  const expiryDate = carryoverExpiryDate(leaveYear);
  return {
    granted,
    consumed,
    forfeited,
    remaining,
    expiryDate,
    expired: new Date(asOfDate) > expiryDate,
    rule: "Unused Annual Leave carried forward from the prior operational year must be used by 31 March or is forfeited.",
    consumptionPriority: "CARRYOVER_FIRST",
  };
}

async function previewAnnualCarryover({ organizationId, sourceYear, targetYear = Number(sourceYear) + 1, tx = prisma }) {
  const fromYear = Number(sourceYear);
  const toYear = Number(targetYear);
  if (!Number.isInteger(fromYear) || toYear !== fromYear + 1) throw new Error("INVALID_CARRYOVER_YEARS");
  const { policy } = await assertZermattAnnualPolicy(organizationId, tx);
  const { start, next } = yearBounds(fromYear);
  const employees = await tx.employee.findMany({
    where: {
      organizationId,
      employmentType: "Full-Time",
      status: { in: CURRENT_STATUSES },
    },
    select: {
      id: true,
      employeeNumber: true,
      firstName: true,
      middleName: true,
      lastName: true,
    },
    orderBy: { employeeNumber: "asc" },
  });
  const balances = await tx.leaveBalance.findMany({
    where: {
      organizationId,
      leaveTypeId: policy.leaveTypeId,
      leaveYear: fromYear,
      employeeId: { in: employees.map((employee) => employee.id) },
    },
  });
  const balanceByEmployee = new Map(balances.map((balance) => [balance.employeeId, balance]));
  const pendingRows = await tx.leaveRequest.groupBy({
    by: ["employeeId"],
    where: {
      organizationId,
      leavePolicyId: policy.id,
      status: "PENDING",
      startDate: { gte: start, lt: next },
      employeeId: { in: employees.map((employee) => employee.id) },
    },
    _sum: { requestedUnits: true },
  });
  const pendingByEmployee = new Map(pendingRows.map((row) => [row.employeeId, n(row._sum.requestedUnits)]));

  const rows = employees.map((employee) => {
    const balance = balanceByEmployee.get(employee.id) || null;
    const pending = pendingByEmployee.get(employee.id) || 0;
    const ledgerAvailable = balance
      ? n(balance.openingBalance) + n(balance.accrued) + n(balance.carriedForward) + n(balance.adjusted) - n(balance.used)
      : 0;
    const carryable = Math.max(0, ledgerAvailable - pending);
    return {
      employeeId: employee.id,
      employeeNumber: employee.employeeNumber,
      employeeName: [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(" "),
      sourceYear: fromYear,
      targetYear: toYear,
      ledgerAvailable,
      pending,
      carryable,
      blocked: pending > 0,
      status: pending > 0 ? "PENDING_REQUEST_REVIEW_REQUIRED" : carryable > 0 ? "READY" : "NO_UNUSED_BALANCE",
    };
  });

  return {
    sourceYear: fromYear,
    targetYear: toYear,
    annualPolicyId: policy.id,
    annualPolicyName: policy.name,
    expiryDate: carryoverExpiryDate(toYear),
    rule: "Carry forward unused Annual Leave only. Carryover is consumed before the new-year entitlement and expires after 31 March.",
    summary: {
      employees: rows.length,
      ready: rows.filter((row) => row.status === "READY").length,
      blocked: rows.filter((row) => row.blocked).length,
      totalCarryable: rows.reduce((sum, row) => sum + row.carryable, 0),
    },
    rows,
  };
}

async function applyAnnualCarryover({ organizationId, actorUserId, sourceYear, targetYear = Number(sourceYear) + 1, asOfDate = new Date(), tx = prisma }) {
  const preview = await previewAnnualCarryover({ organizationId, sourceYear, targetYear, tx });
  if (!sourceYearClosed(preview.sourceYear, asOfDate)) throw new Error("CARRYOVER_SOURCE_YEAR_NOT_CLOSED");
  if (preview.summary.blocked) {
    const error = new Error("CARRYOVER_PENDING_ANNUAL_REQUESTS");
    error.details = preview.rows.filter((row) => row.blocked).map((row) => ({ employeeNumber: row.employeeNumber, pending: row.pending }));
    throw error;
  }
  const { policy } = await assertZermattAnnualPolicy(organizationId, tx);
  const results = [];
  for (const row of preview.rows) {
    const existing = await tx.leaveBalance.findUnique({
      where: {
        organizationId_employeeId_leaveTypeId_leaveYear: {
          organizationId,
          employeeId: row.employeeId,
          leaveTypeId: policy.leaveTypeId,
          leaveYear: preview.targetYear,
        },
      },
    });
    if (existing && n(existing.used) > 0 && n(existing.carriedForward) !== row.carryable) {
      const error = new Error("CARRYOVER_TARGET_YEAR_ALREADY_IN_USE");
      error.details = { employeeNumber: row.employeeNumber, targetYear: preview.targetYear };
      throw error;
    }
    const balance = await tx.leaveBalance.upsert({
      where: {
        organizationId_employeeId_leaveTypeId_leaveYear: {
          organizationId,
          employeeId: row.employeeId,
          leaveTypeId: policy.leaveTypeId,
          leaveYear: preview.targetYear,
        },
      },
      update: { carriedForward: row.carryable },
      create: {
        organizationId,
        employeeId: row.employeeId,
        leaveTypeId: policy.leaveTypeId,
        leaveYear: preview.targetYear,
        openingBalance: 0,
        carriedForward: row.carryable,
      },
    });
    results.push({ employeeNumber: row.employeeNumber, carryover: row.carryable, balanceId: balance.id });
  }
  return {
    ...preview,
    applied: true,
    actorUserId: actorUserId || null,
    appliedCount: results.filter((row) => row.carryover > 0).length,
    results,
  };
}

async function forfeitExpiredCarryoverForEmployee({ organizationId, employeeId, employeeNumber, leavePolicyId, leaveYear, actorUserId, asOfDate = new Date(), tx = prisma }) {
  const year = Number(leaveYear);
  const { policy } = await assertZermattAnnualPolicy(organizationId, tx);
  if (leavePolicyId && leavePolicyId !== policy.id) return { forfeited: 0, skipped: "NOT_ANNUAL_POLICY" };
  if (new Date(asOfDate) <= carryoverExpiryDate(year)) return { forfeited: 0, skipped: "Q1_NOT_EXPIRED" };
  let employee = null;
  if (employeeId) employee = await tx.employee.findFirst({ where: { id: employeeId, organizationId }, select: { id: true, employeeNumber: true } });
  if (!employee && employeeNumber) employee = await tx.employee.findFirst({ where: { employeeNumber, organizationId }, select: { id: true, employeeNumber: true } });
  if (!employee) throw new Error("EMPLOYEE_NOT_FOUND");
  const balance = await tx.leaveBalance.findUnique({
    where: {
      organizationId_employeeId_leaveTypeId_leaveYear: {
        organizationId,
        employeeId: employee.id,
        leaveTypeId: policy.leaveTypeId,
        leaveYear: year,
      },
    },
  });
  if (!balance || n(balance.carriedForward) <= 0) return { employeeNumber: employee.employeeNumber, forfeited: 0, skipped: "NO_CARRYOVER" };
  const status = await carryoverStatus({ organizationId, balance, policy, leaveYear: year, asOfDate, tx });
  if (status.remaining <= 0) return { employeeNumber: employee.employeeNumber, forfeited: 0, skipped: status.forfeited > 0 ? "ALREADY_FORFEITED" : "FULLY_USED" };

  const before = n(balance.openingBalance) + n(balance.accrued) + n(balance.carriedForward) + n(balance.adjusted) - n(balance.used);
  const amount = -status.remaining;
  const updatedBalance = await tx.leaveBalance.update({
    where: { id: balance.id },
    data: { adjusted: { increment: amount } },
  });
  await tx.leaveEntitlementAdjustment.create({
    data: {
      organizationId,
      employeeId: employee.id,
      leaveBalanceId: balance.id,
      leaveTypeId: policy.leaveTypeId,
      leavePolicyId: policy.id,
      leaveYear: year,
      amount,
      balanceBefore: before,
      balanceAfter: before + amount,
      reason: `${FORFEIT_REASON_PREFIX}:${year}:Unused carryover expired after Q1`,
      effectiveDate: new Date(Date.UTC(year, 3, 1)),
      createdByUserId: actorUserId || null,
    },
  });
  return { employeeNumber: employee.employeeNumber, forfeited: status.remaining, balance: updatedBalance, status: { ...status, forfeited: status.forfeited + status.remaining, remaining: 0 } };
}

async function forfeitExpiredCarryover({ organizationId, actorUserId, leaveYear, asOfDate = new Date(), tx = prisma }) {
  const year = Number(leaveYear || new Date(asOfDate).getUTCFullYear());
  const { policy } = await assertZermattAnnualPolicy(organizationId, tx);
  if (new Date(asOfDate) <= carryoverExpiryDate(year)) throw new Error("CARRYOVER_Q1_NOT_EXPIRED");
  const balances = await tx.leaveBalance.findMany({
    where: { organizationId, leaveTypeId: policy.leaveTypeId, leaveYear: year, carriedForward: { gt: 0 } },
    select: { employeeId: true },
  });
  const results = [];
  for (const balance of balances) {
    results.push(await forfeitExpiredCarryoverForEmployee({
      organizationId,
      employeeId: balance.employeeId,
      leavePolicyId: policy.id,
      leaveYear: year,
      actorUserId,
      asOfDate,
      tx,
    }));
  }
  return {
    leaveYear: year,
    expiryDate: carryoverExpiryDate(year),
    forfeitedEmployees: results.filter((row) => row.forfeited > 0).length,
    totalForfeited: results.reduce((sum, row) => sum + n(row.forfeited), 0),
    results,
  };
}

module.exports = {
  ANNUAL_POLICY_CODE,
  FORFEIT_REASON_PREFIX,
  carryoverExpiryDate,
  previewAnnualCarryover,
  applyAnnualCarryover,
  carryoverStatus,
  forfeitExpiredCarryover,
  forfeitExpiredCarryoverForEmployee,
};
