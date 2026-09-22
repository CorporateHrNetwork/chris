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

function employeeName(employee) {
  return [employee?.firstName, employee?.middleName, employee?.lastName]
    .filter(Boolean)
    .join(" ");
}

function candidateScore(employee, candidate) {
  let score = 0;
  if (employee.locationId && candidate.locationId === employee.locationId) score += 100;
  if (employee.departmentId && candidate.departmentId === employee.departmentId) score += 20;
  return score;
}

function summarizeDesignation(designation) {
  if (!designation) return null;
  return {
    id: designation.id,
    code: designation.code,
    name: designation.name,
    careerLevel: designation.careerLevel,
  };
}

async function resolveManagerCandidates(tx, { organizationId, employeeId }) {
  const employee = await tx.employee.findFirst({
    where: { id: employeeId, organizationId },
    include: {
      department: true,
      location: true,
      designation: true,
    },
  });
  if (!employee) throw new Error("EMPLOYEE_NOT_FOUND");
  if (!CURRENT_STATUSES.includes(employee.status) || employee.exitDate) {
    throw new Error("EMPLOYEE_NOT_CURRENT");
  }
  if (!employee.designationId || !employee.designation) {
    throw new Error("EMPLOYEE_DESIGNATION_REQUIRED");
  }

  const designations = await tx.designation.findMany({
    where: { organizationId },
    select: {
      id: true,
      code: true,
      name: true,
      careerLevel: true,
      reportsToDesignationId: true,
    },
  });
  const designationById = new Map(designations.map((item) => [item.id, item]));
  const chain = [];
  const seen = new Set([employee.designationId]);
  let cursor = designationById.get(employee.designationId) || null;

  while (cursor?.reportsToDesignationId) {
    const parent = designationById.get(cursor.reportsToDesignationId) || null;
    if (!parent) throw new Error("REPORTING_DESIGNATION_NOT_FOUND");
    if (seen.has(parent.id)) throw new Error("DESIGNATION_HIERARCHY_CYCLE");
    seen.add(parent.id);
    chain.push(parent);
    cursor = parent;
  }

  if (!chain.length) {
    return {
      employee,
      hierarchyStatus: "TOP_LEVEL_NO_MANAGER",
      directReportsToDesignation: null,
      resolvedManagerDesignation: null,
      hierarchyHops: 0,
      chain: [],
      candidates: [],
      topCandidates: [],
      requiresManualSelection: false,
    };
  }

  let resolvedManagerDesignation = null;
  let hierarchyHops = 0;
  let candidates = [];

  for (let index = 0; index < chain.length; index += 1) {
    const ancestor = chain[index];
    const rows = await tx.employee.findMany({
      where: {
        organizationId,
        designationId: ancestor.id,
        status: { in: CURRENT_STATUSES },
        exitDate: null,
        NOT: { id: employee.id },
      },
      include: { department: true, designation: true, location: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }, { employeeNumber: "asc" }],
    });
    if (!rows.length) continue;
    resolvedManagerDesignation = ancestor;
    hierarchyHops = index + 1;
    candidates = rows;
    break;
  }

  if (!resolvedManagerDesignation) {
    return {
      employee,
      hierarchyStatus: "NO_MANAGER_IN_HIERARCHY",
      directReportsToDesignation: summarizeDesignation(chain[0]),
      resolvedManagerDesignation: null,
      hierarchyHops: 0,
      chain: chain.map(summarizeDesignation),
      candidates: [],
      topCandidates: [],
      requiresManualSelection: false,
    };
  }

  const ranked = candidates
    .map((candidate) => ({
      ...candidate,
      hierarchyScore: candidateScore(employee, candidate),
      hierarchyMatch: {
        sameLocation: Boolean(employee.locationId && candidate.locationId === employee.locationId),
        sameDepartment: Boolean(employee.departmentId && candidate.departmentId === employee.departmentId),
      },
    }))
    .sort(
      (left, right) =>
        right.hierarchyScore - left.hierarchyScore ||
        String(left.employeeNumber).localeCompare(String(right.employeeNumber))
    );
  const topScore = ranked[0]?.hierarchyScore ?? null;
  const topCandidates = topScore == null
    ? []
    : ranked.filter((candidate) => candidate.hierarchyScore === topScore);

  return {
    employee,
    hierarchyStatus: hierarchyHops === 1 ? "DIRECT_HIERARCHY" : "FALLBACK_HIERARCHY",
    directReportsToDesignation: summarizeDesignation(chain[0]),
    resolvedManagerDesignation: summarizeDesignation(resolvedManagerDesignation),
    hierarchyHops,
    chain: chain.map(summarizeDesignation),
    candidates: ranked,
    topCandidates,
    requiresManualSelection: topCandidates.length > 1,
  };
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
      tx.employee.findFirst({
        where: { id: managerEmployeeId, organizationId },
        include: { department: true, designation: true, location: true },
      }),
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

    const hierarchy = await resolveManagerCandidates(tx, { organizationId, employeeId });
    const hierarchyCandidateIds = new Set(hierarchy.candidates.map((candidate) => candidate.id));
    const hierarchyOverride = Boolean(input.hierarchyOverride);
    const hierarchyOverrideReason = String(input.hierarchyOverrideReason || "").trim();

    if (!hierarchyCandidateIds.has(manager.id)) {
      if (!hierarchyOverride) throw new Error("MANAGER_OUTSIDE_DESIGNATION_HIERARCHY");
      if (!hierarchyOverrideReason) throw new Error("HIERARCHY_OVERRIDE_REASON_REQUIRED");
    }

    await assertNoCycle(tx, organizationId, employee.id, manager.id);

    if (current?.managerEmployeeId === manager.id) {
      return tx.employeeLineManagerAssignment.findUnique({
        where: { id: current.id },
        include: assignmentInclude,
      });
    }

    if (current) {
      await tx.employeeLineManagerAssignment.update({
        where: { id: current.id },
        data: { effectiveTo: effectiveFrom },
      });
    }

    const created = await tx.employeeLineManagerAssignment.create({
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

    await tx.organizationAudit.create({
      data: {
        organizationId,
        actorUserId: input.performedByUserId || null,
        entityType: "EmployeeLineManagerAssignment",
        entityId: created.id,
        action: hierarchyOverride ? "LINE_MANAGER_HIERARCHY_OVERRIDE_ASSIGNED" : "LINE_MANAGER_ASSIGNED",
        previousValue: current
          ? { managerEmployeeId: current.managerEmployeeId, effectiveFrom: current.effectiveFrom }
          : null,
        newValue: {
          employeeId,
          managerEmployeeId,
          effectiveFrom,
          hierarchyStatus: hierarchy.hierarchyStatus,
          directReportsToDesignation: hierarchy.directReportsToDesignation,
          resolvedManagerDesignation: hierarchy.resolvedManagerDesignation,
          hierarchyHops: hierarchy.hierarchyHops,
          hierarchyOverride,
          hierarchyOverrideReason: hierarchyOverride ? hierarchyOverrideReason : null,
        },
        reason: hierarchyOverride
          ? hierarchyOverrideReason
          : String(input.reason || "").trim() || "Designation hierarchy line-manager assignment",
      },
    });

    return created;
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
    const updated = await tx.employeeLineManagerAssignment.update({
      where: { id: current.id },
      data: {
        effectiveTo: input.effectiveTo,
        reason: String(input.reason).trim(),
        notes: String(input.notes || "").trim() || current.notes,
        performedByUserId: input.performedByUserId || null,
      },
      include: assignmentInclude,
    });
    await tx.organizationAudit.create({
      data: {
        organizationId: input.organizationId,
        actorUserId: input.performedByUserId || null,
        entityType: "EmployeeLineManagerAssignment",
        entityId: current.id,
        action: "LINE_MANAGER_REMOVED",
        previousValue: {
          employeeId: current.employeeId,
          managerEmployeeId: current.managerEmployeeId,
          effectiveFrom: current.effectiveFrom,
        },
        newValue: { effectiveTo: input.effectiveTo },
        reason: String(input.reason).trim(),
      },
    });
    return updated;
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
  resolveManagerCandidates,
  setLineManager,
  removeLineManager,
  closeLineManagerAssignmentsForExit,
};
