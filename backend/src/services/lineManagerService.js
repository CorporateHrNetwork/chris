const CURRENT_STATUSES = ["ACTIVE", "PROBATION", "LEAVE", "SUSPENDED"];

const assignmentInclude = {
  manager: { include: { department: true, designation: true, location: true } },
  employee: { include: { department: true, designation: true, location: true } },
  performedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
};

function parseEffectiveDate(value) {
  if (!value) return null;
  const result = new Date(value);
  return Number.isNaN(result.getTime()) ? null : result;
}

async function assertNoCycle(tx, organizationId, employeeId, managerEmployeeId) {
  const visited = new Set();
  let cursor = managerEmployeeId;
  while (cursor) {
    if (cursor === employeeId || visited.has(cursor)) throw new Error("MANAGEMENT_CYCLE");
    visited.add(cursor);
    const assignment = await tx.employeeLineManagerAssignment.findFirst({
      where: { organizationId, employeeId: cursor, effectiveTo: null },
      select: { managerEmployeeId: true },
    });
    cursor = assignment?.managerEmployeeId || null;
  }
}

async function setLineManager(prisma, input) {
  const { organizationId, employeeId, managerEmployeeId, effectiveFrom } = input;
  if (effectiveFrom > new Date()) throw new Error("FUTURE_EFFECTIVE_DATE");
  return prisma.$transaction(async (tx) => {
    const [employee, manager, current] = await Promise.all([
      tx.employee.findFirst({ where: { id: employeeId, organizationId } }),
      tx.employee.findFirst({ where: { id: managerEmployeeId, organizationId } }),
      tx.employeeLineManagerAssignment.findFirst({
        where: { organizationId, employeeId, effectiveTo: null },
      }),
    ]);
    if (!employee) throw new Error("EMPLOYEE_NOT_FOUND");
    if (!manager) throw new Error("MANAGER_NOT_FOUND");
    if (!CURRENT_STATUSES.includes(employee.status) || employee.exitDate) throw new Error("EMPLOYEE_NOT_CURRENT");
    if (employee.id === manager.id) throw new Error("SELF_MANAGER");
    if (!CURRENT_STATUSES.includes(manager.status) || manager.exitDate) throw new Error("MANAGER_NOT_CURRENT");
    if (current && effectiveFrom < current.effectiveFrom) throw new Error("INVALID_EFFECTIVE_DATE");
    if (current && !String(input.reason || "").trim()) throw new Error("CHANGE_REASON_REQUIRED");
    await assertNoCycle(tx, organizationId, employee.id, manager.id);
    if (current) {
      await tx.employeeLineManagerAssignment.update({
        where: { id: current.id },
        data: { effectiveTo: effectiveFrom },
      });
    }
    return tx.employeeLineManagerAssignment.create({
      data: {
        organizationId,
        employeeId,
        managerEmployeeId,
        effectiveFrom,
        reason: String(input.reason || "").trim() || null,
        notes: String(input.notes || "").trim() || null,
        performedByUserId: input.performedByUserId || null,
      },
      include: assignmentInclude,
    });
  });
}

async function removeLineManager(prisma, input) {
  if (input.effectiveTo > new Date()) throw new Error("FUTURE_EFFECTIVE_DATE");
  return prisma.$transaction(async (tx) => {
    const current = await tx.employeeLineManagerAssignment.findFirst({
      where: { organizationId: input.organizationId, employeeId: input.employeeId, effectiveTo: null },
    });
    if (!current) throw new Error("CURRENT_ASSIGNMENT_NOT_FOUND");
    if (input.effectiveTo < current.effectiveFrom) throw new Error("INVALID_EFFECTIVE_DATE");
    return tx.employeeLineManagerAssignment.update({
      where: { id: current.id },
      data: {
        effectiveTo: input.effectiveTo,
        reason: String(input.reason).trim(),
        notes: String(input.notes || "").trim() || current.notes,
        performedByUserId: input.performedByUserId || null,
      },
      include: assignmentInclude,
    });
  });
}

async function closeLineManagerAssignmentsForExit(tx, input) {
  return tx.employeeLineManagerAssignment.updateMany({
    where: {
      organizationId: input.organizationId,
      effectiveTo: null,
      OR: [{ employeeId: input.employeeId }, { managerEmployeeId: input.employeeId }],
    },
    data: {
      effectiveTo: input.effectiveTo,
      reason: "Employment exit completed",
      performedByUserId: input.performedByUserId || null,
    },
  });
}

module.exports = {
  CURRENT_STATUSES,
  assignmentInclude,
  parseEffectiveDate,
  setLineManager,
  removeLineManager,
  closeLineManagerAssignmentsForExit,
};
