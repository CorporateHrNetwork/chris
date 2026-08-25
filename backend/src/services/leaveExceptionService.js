const crypto = require("crypto");
const prisma = require("../config/prisma");
const { calculateLeaveDays, utcDay } = require("./leaveDayCalculator");
const { detectLeaveMismatch, projectProtectedBalance } = require("./leaveExceptionSemantics");

const MISMATCH = "EMPLOYEE_LEAVE_WITHOUT_ACTIVE_REQUEST";
const WORKING_STATUSES = new Set(["ACTIVE", "PROBATION"]);
const RECONSTRUCTION_STATUSES = new Set(["ACTIVE", "COMPLETED"]);
const exceptionId = (employeeId) => `${employeeId}:${MISMATCH}`;
const number = (value) => Number(value || 0);

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value.toJSON === "function") return stable(value.toJSON());
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}
const fingerprint = (value) => crypto.createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");

async function protectedState(tx, organizationId, targetEmployeeId) {
  const [balances, allocations, requests, pendingRequests, policies, unrelatedStatuses] = await Promise.all([
    tx.leaveBalance.findMany({ where: { organizationId }, orderBy: { id: "asc" } }),
    tx.leaveEntitlementAllocation.findMany({ where: { organizationId }, orderBy: { id: "asc" } }),
    tx.leaveRequest.findMany({ where: { organizationId }, orderBy: { id: "asc" } }),
    tx.leaveRequest.findMany({ where: { organizationId, status: "PENDING" }, orderBy: { id: "asc" } }),
    tx.leavePolicy.findMany({ where: { organizationId }, orderBy: { id: "asc" } }),
    tx.employee.findMany({ where: { organizationId, id: { not: targetEmployeeId } }, select: { id: true, status: true, updatedAt: true }, orderBy: { id: "asc" } }),
  ]);
  return {
    rows: { balances, allocations, requests },
    fingerprints: {
      balances: fingerprint(balances), allocations: fingerprint(allocations), requests: fingerprint(requests),
      pendingRequests: fingerprint(pendingRequests), policies: fingerprint(policies), unrelatedStatuses: fingerprint(unrelatedStatuses),
    },
  };
}

async function assertProtectedState(tx, organizationId, targetEmployeeId, before, { allowNewRequest = false } = {}) {
  const [balances, allocations, requests, pendingRequests, policies, unrelatedStatuses] = await Promise.all([
    tx.leaveBalance.findMany({ where: { organizationId }, orderBy: { id: "asc" } }),
    tx.leaveEntitlementAllocation.findMany({ where: { organizationId }, orderBy: { id: "asc" } }),
    tx.leaveRequest.findMany({ where: { organizationId, ...(allowNewRequest ? { id: { in: before.rows.requests.map((row) => row.id) } } : {}) }, orderBy: { id: "asc" } }),
    tx.leaveRequest.findMany({ where: { organizationId, status: "PENDING" }, orderBy: { id: "asc" } }),
    tx.leavePolicy.findMany({ where: { organizationId }, orderBy: { id: "asc" } }),
    tx.employee.findMany({ where: { organizationId, id: { not: targetEmployeeId } }, select: { id: true, status: true, updatedAt: true }, orderBy: { id: "asc" } }),
  ]);
  const after = {
    balances: fingerprint(balances), allocations: fingerprint(allocations), requests: fingerprint(requests),
    pendingRequests: fingerprint(pendingRequests), policies: fingerprint(policies), unrelatedStatuses: fingerprint(unrelatedStatuses),
  };
  for (const key of Object.keys(after)) {
    if (after[key] !== before.fingerprints[key]) throw new Error(`LEAVE_EXCEPTION_PRESERVATION_FAILED:${key}`);
  }
  if (balances.length !== before.rows.balances.length) throw new Error("LEAVE_EXCEPTION_PRESERVATION_FAILED:balanceCount");
  if (allocations.length !== before.rows.allocations.length) throw new Error("LEAVE_EXCEPTION_PRESERVATION_FAILED:allocationCount");
  return after;
}

async function currentMismatch(tx, organizationId, employeeNumber) {
  const employee = await tx.employee.findFirst({
    where: { organizationId, employeeNumber },
    include: { department: true, designation: { include: { employmentLevel: true } }, location: true },
  });
  if (!employee) throw new Error("EMPLOYEE_NOT_FOUND");
  const activeRequest = await tx.leaveRequest.findFirst({ where: { organizationId, employeeId: employee.id, status: "ACTIVE" }, include: { leavePolicy: true, leaveType: true } });
  if (employee.status !== "LEAVE" || activeRequest) throw new Error("LEAVE_EXCEPTION_NO_LONGER_ACTIVE");
  return { employee, activeRequest };
}

async function exceptionDetail(tx, organizationId, employee) {
  const year = new Date().getFullYear();
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year + 1, 0, 1));
  const [balances, policies, pending, latestAudit] = await Promise.all([
    tx.leaveBalance.findMany({ where: { organizationId, employeeId: employee.id, leaveYear: year }, include: { leaveType: true, entitlementAllocations: { where: { leaveYear: year }, orderBy: { createdAt: "desc" } } }, orderBy: { leaveType: { name: "asc" } } }),
    tx.leavePolicy.findMany({ where: { organizationId, effectiveFrom: { lt: end }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: start } }] }, include: { leaveType: true }, orderBy: [{ leaveType: { name: "asc" } }, { versionNumber: "desc" }] }),
    tx.leaveRequest.findMany({ where: { organizationId, employeeId: employee.id, status: "PENDING", startDate: { gte: start, lt: end } }, select: { leaveTypeId: true, requestedUnits: true } }),
    tx.organizationAudit.findFirst({ where: { organizationId, entityType: "LEAVE_EXCEPTION", entityId: exceptionId(employee.id) }, include: { actor: { select: { id: true, firstName: true, lastName: true } } }, orderBy: { createdAt: "desc" } }),
  ]);
  return {
    id: exceptionId(employee.id), mismatchCode: MISMATCH, mismatch: "Employee marked on leave without active request",
    employee: { id: employee.id, employeeNumber: employee.employeeNumber, firstName: employee.firstName, middleName: employee.middleName, lastName: employee.lastName, department: employee.department, designation: employee.designation, employmentLevel: employee.designation?.employmentLevel || null, status: employee.status },
    activeRequestStatus: "None", leaveYear: year, detectedAt: employee.updatedAt,
    balances: balances.map((balance) => {
      const committed = pending.filter((request) => request.leaveTypeId === balance.leaveTypeId).reduce((sum, request) => sum + number(request.requestedUnits), 0);
      return { id: balance.id, leaveTypeId: balance.leaveTypeId, leaveType: balance.leaveType, ...projectProtectedBalance(balance, committed) };
    }),
    policies, resolutionStatus: latestAudit?.action === "LEAVE_EXCEPTION_INVESTIGATION_NOTE" ? "UNDER_INVESTIGATION" : "OPEN",
    latestInvestigation: latestAudit?.action === "LEAVE_EXCEPTION_INVESTIGATION_NOTE" ? { note: latestAudit.reason, actor: latestAudit.actor, createdAt: latestAudit.createdAt } : null,
  };
}

async function listLeaveExceptions({ organizationId }) {
  const [employees, activeRequests] = await Promise.all([
    prisma.employee.findMany({ where: { organizationId, status: "LEAVE" }, include: { department: true, designation: { include: { employmentLevel: true } }, location: true }, orderBy: { employeeNumber: "asc" } }),
    prisma.leaveRequest.findMany({ where: { organizationId, status: "ACTIVE" }, select: { employeeId: true } }),
  ]);
  const activeIds = new Set(activeRequests.map((request) => request.employeeId));
  return Promise.all(employees.filter((employee) => detectLeaveMismatch(employee, activeIds)).map((employee) => exceptionDetail(prisma, organizationId, employee)));
}

async function keepExceptionOpen({ organizationId, employeeNumber, actorUserId, note }) {
  if (!String(note || "").trim()) throw new Error("LEAVE_EXCEPTION_NOTE_REQUIRED");
  return prisma.$transaction(async (tx) => {
    const { employee } = await currentMismatch(tx, organizationId, employeeNumber);
    return tx.organizationAudit.create({ data: { organizationId, actorUserId, entityType: "LEAVE_EXCEPTION", entityId: exceptionId(employee.id), action: "LEAVE_EXCEPTION_INVESTIGATION_NOTE", reason: String(note).trim(), previousValue: { employeeStatus: employee.status, activeRequest: null }, newValue: { resolutionStatus: "UNDER_INVESTIGATION" } } });
  }, { isolationLevel: "Serializable" });
}

async function restoreWorkingStatus({ organizationId, employeeNumber, actorUserId, newStatus, reason }) {
  if (!WORKING_STATUSES.has(newStatus)) throw new Error("INVALID_LEAVE_EXCEPTION_RETURN_STATUS");
  if (!String(reason || "").trim()) throw new Error("LEAVE_EXCEPTION_REASON_REQUIRED");
  return prisma.$transaction(async (tx) => {
    const { employee } = await currentMismatch(tx, organizationId, employeeNumber);
    const before = await protectedState(tx, organizationId, employee.id);
    const updated = await tx.employee.update({ where: { id: employee.id }, data: { status: newStatus } });
    const lifecycle = await tx.employeeLifecycleEvent.create({ data: { organizationId, employeeId: employee.id, eventType: "RETURNED_FROM_LEAVE", effectiveDate: new Date(), previousStatus: "LEAVE", newStatus, reason: String(reason).trim(), notes: "Administrative Leave Exception resolution", performedByUserId: actorUserId } });
    const protectedAfter = await assertProtectedState(tx, organizationId, employee.id, before);
    const audit = await tx.organizationAudit.create({ data: { organizationId, actorUserId, entityType: "LEAVE_EXCEPTION", entityId: exceptionId(employee.id), action: "LEAVE_EXCEPTION_STATUS_RESTORED", reason: String(reason).trim(), previousValue: { status: "LEAVE", protected: before.fingerprints }, newValue: { status: newStatus, protected: protectedAfter } } });
    return { employee: updated, lifecycleEventId: lifecycle.id, auditEventId: audit.id };
  }, { isolationLevel: "Serializable" });
}

async function governingPolicy(tx, { organizationId, leavePolicyId, leaveTypeId, startDate }) {
  const selected = await tx.leavePolicy.findFirst({ where: { id: leavePolicyId, organizationId }, include: { leaveType: true } });
  if (!selected || selected.leaveTypeId !== leaveTypeId) throw new Error("TENANT_LEAVE_POLICY_NOT_FOUND");
  const family = selected.versionGroupId ? { versionGroupId: selected.versionGroupId } : { id: selected.id };
  const policy = await tx.leavePolicy.findFirst({ where: { organizationId, leaveTypeId, ...family, effectiveFrom: { lte: startDate }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: startDate } }] }, include: { leaveType: true }, orderBy: { versionNumber: "desc" } });
  if (!policy) throw new Error("HISTORICAL_GOVERNING_POLICY_NOT_FOUND");
  return policy;
}

async function reconstructHistoricalLeave({ organizationId, employeeNumber, actorUserId, input }) {
  const status = String(input?.status || "").toUpperCase();
  const returnStatus = String(input?.returnStatus || "").toUpperCase();
  const reason = String(input?.reason || "").trim();
  const startDate = utcDay(input?.startDate);
  const endDate = utcDay(input?.endDate);
  const actualReturnDate = input?.actualReturnDate ? utcDay(input.actualReturnDate) : null;
  if (!RECONSTRUCTION_STATUSES.has(status)) throw new Error("INVALID_RECONSTRUCTED_LEAVE_STATUS");
  if (!WORKING_STATUSES.has(returnStatus)) throw new Error("INVALID_LEAVE_EXCEPTION_RETURN_STATUS");
  if (!reason) throw new Error("LEAVE_EXCEPTION_REASON_REQUIRED");
  if (endDate < startDate || (actualReturnDate && actualReturnDate < startDate) || (status === "COMPLETED" && !actualReturnDate)) throw new Error("INVALID_LEAVE_DATES");
  return prisma.$transaction(async (tx) => {
    const { employee } = await currentMismatch(tx, organizationId, employeeNumber);
    const before = await protectedState(tx, organizationId, employee.id);
    const policy = await governingPolicy(tx, { organizationId, leavePolicyId: input.leavePolicyId, leaveTypeId: input.leaveTypeId, startDate });
    const holidays = await tx.publicHoliday.findMany({ where: { organizationId, holidayDate: { gte: startDate, lte: endDate } }, select: { holidayDate: true } });
    const calculation = calculateLeaveDays({ startDate, endDate, policy, publicHolidays: holidays.map((holiday) => holiday.holidayDate) });
    const request = await tx.leaveRequest.create({ data: {
      organizationId, employeeId: employee.id, leaveTypeId: policy.leaveTypeId, leavePolicyId: policy.id,
      startDate, endDate, requestedUnits: calculation.requestedUnits, reason: `Administrative historical reconstruction: ${reason}`,
      status, createdByUserId: actorUserId, reviewedByUserId: actorUserId, reviewedAt: new Date(), reviewNotes: reason,
      commencedAt: new Date(), commencementDate: startDate, commencedByUserId: actorUserId, preLeaveStatus: returnStatus,
      ...(status === "COMPLETED" ? { returnedAt: new Date(), actualReturnDate, returnedByUserId: actorUserId } : {}),
      administrativeReconstruction: true, reconstructionReason: reason,
    } });
    let employeeAfter = employee;
    if (status === "COMPLETED") {
      employeeAfter = await tx.employee.update({ where: { id: employee.id }, data: { status: returnStatus } });
      await tx.employeeLifecycleEvent.create({ data: { organizationId, employeeId: employee.id, eventType: "RETURNED_FROM_LEAVE", effectiveDate: actualReturnDate, previousStatus: "LEAVE", newStatus: returnStatus, reason, notes: "Administrative historical leave reconstruction", performedByUserId: actorUserId } });
    }
    const protectedAfter = await assertProtectedState(tx, organizationId, employee.id, before, { allowNewRequest: true });
    const audit = await tx.organizationAudit.create({ data: { organizationId, actorUserId, entityType: "LEAVE_EXCEPTION", entityId: exceptionId(employee.id), action: "LEAVE_EXCEPTION_HISTORY_RECONSTRUCTED", reason, previousValue: { employeeStatus: employee.status, protected: before.fingerprints }, newValue: { requestId: request.id, policyId: policy.id, policyVersion: policy.versionNumber, leaveTypeId: policy.leaveTypeId, startDate, endDate, actualReturnDate, status, employeeStatus: employeeAfter.status, protected: protectedAfter } } });
    return { request, employee: employeeAfter, auditEventId: audit.id, protectedBalanceFingerprints: before.fingerprints.balances };
  }, { isolationLevel: "Serializable" });
}

module.exports = { MISMATCH, listLeaveExceptions, keepExceptionOpen, restoreWorkingStatus, reconstructHistoricalLeave, protectedState, assertProtectedState };
