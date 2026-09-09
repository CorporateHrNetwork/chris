const CURRENT_STATUSES = ["ACTIVE", "PROBATION", "LEAVE", "SUSPENDED"];

function parseEffectiveDate(value) {
  if (!value) return null;
  const result = new Date(value);
  return Number.isNaN(result.getTime()) ? null : result;
}

function levelSummary(level) {
  if (!level) return null;
  return {
    levelNumber: level.levelNumber,
    code: level.code,
    name: level.name,
    description: level.description,
    displayOrder: level.displayOrder,
    isActive: level.isActive,
  };
}

function assignmentSummary(assignment) {
  if (!assignment) return null;
  return {
    id: assignment.id,
    levelNumber: assignment.levelNumber,
    employmentLevel: levelSummary(assignment.employmentLevel),
    effectiveFrom: assignment.effectiveFrom,
    effectiveTo: assignment.effectiveTo,
    reason: assignment.reason,
    notes: assignment.notes,
    performedByUserId: assignment.performedByUserId,
    performedBy: assignment.performedBy || null,
    createdAt: assignment.createdAt,
  };
}

async function resolveEmployee(prisma, organizationId, employeeNumberOrId) {
  return prisma.employee.findFirst({
    where: {
      organizationId,
      OR: [
        { id: employeeNumberOrId },
        { employeeNumber: String(employeeNumberOrId || "").trim().toUpperCase() },
      ],
    },
    include: {
      department: true,
      location: true,
      designation: {
        include: {
          employmentLevel: true,
          reportsToDesignation: {
            select: { id: true, code: true, name: true, careerLevel: true },
          },
        },
      },
    },
  });
}

async function findEffectiveOverride(prisma, { organizationId, employeeId, asOf = new Date() }) {
  return prisma.employeeEmploymentLevelAssignment.findFirst({
    where: {
      organizationId,
      employeeId,
      effectiveFrom: { lte: asOf },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: asOf } }],
    },
    include: {
      employmentLevel: true,
      performedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
    orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
  });
}

async function resolveEffectiveEmploymentLevel(prisma, {
  organizationId,
  employeeId,
  employeeNumber,
  asOf = new Date(),
}) {
  const employee = await resolveEmployee(
    prisma,
    organizationId,
    employeeId || employeeNumber
  );
  if (!employee) throw new Error("EMPLOYEE_NOT_FOUND");

  const override = await findEffectiveOverride(prisma, {
    organizationId,
    employeeId: employee.id,
    asOf,
  });

  if (override) {
    if (!override.employmentLevel?.isActive) {
      throw new Error("EMPLOYEE_LEVEL_OVERRIDE_INACTIVE");
    }
    return {
      employee,
      source: "EMPLOYEE_OVERRIDE",
      levelNumber: override.levelNumber,
      employmentLevel: override.employmentLevel,
      override: assignmentSummary(override),
      designationDefaultLevel: employee.designation?.employmentLevel || null,
      designationLevelNumber: employee.designation?.careerLevel ?? null,
    };
  }

  const designationLevel = employee.designation?.employmentLevel || null;
  if (
    !employee.designation ||
    employee.designation.careerLevel == null ||
    !designationLevel ||
    !designationLevel.isActive
  ) {
    const error = new Error("EMPLOYMENT_LEVEL_MAPPING_REQUIRED");
    error.details = {
      employeeId: employee.id,
      employeeNumber: employee.employeeNumber,
      designationId: employee.designation?.id || null,
      designationName: employee.designation?.name || null,
      careerLevel: employee.designation?.careerLevel ?? null,
    };
    throw error;
  }

  return {
    employee,
    source: "DESIGNATION_DEFAULT",
    levelNumber: employee.designation.careerLevel,
    employmentLevel: designationLevel,
    override: null,
    designationDefaultLevel: designationLevel,
    designationLevelNumber: employee.designation.careerLevel,
  };
}

async function getEmploymentLevelState(prisma, {
  organizationId,
  employeeNumber,
  asOf = new Date(),
}) {
  const effective = await resolveEffectiveEmploymentLevel(prisma, {
    organizationId,
    employeeNumber,
    asOf,
  });
  const history = await prisma.employeeEmploymentLevelAssignment.findMany({
    where: { organizationId, employeeId: effective.employee.id },
    include: {
      employmentLevel: true,
      performedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
    orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
  });

  return {
    employee: effective.employee,
    designationDefault: effective.designationDefaultLevel
      ? {
          ...levelSummary(effective.designationDefaultLevel),
          designationId: effective.employee.designation?.id || null,
          designationCode: effective.employee.designation?.code || null,
          designationName: effective.employee.designation?.name || null,
        }
      : null,
    effective: {
      source: effective.source,
      ...levelSummary(effective.employmentLevel),
      override: effective.override,
    },
    currentOverride: effective.override,
    history: history.map(assignmentSummary),
  };
}

function normalizeSetInput(input) {
  const normalized = {
    ...input,
    organizationId: input.organizationId,
    employeeNumber: String(input.employeeNumber || "").trim().toUpperCase(),
    levelNumber: Number(input.levelNumber),
    reason: String(input.reason || "").trim(),
    notes: String(input.notes || "").trim() || null,
  };

  if (!normalized.employeeNumber) throw new Error("EMPLOYEE_NUMBER_REQUIRED");
  if (!Number.isInteger(normalized.levelNumber)) throw new Error("INVALID_EMPLOYMENT_LEVEL");
  if (!(normalized.effectiveFrom instanceof Date) || Number.isNaN(normalized.effectiveFrom.getTime())) {
    throw new Error("INVALID_EFFECTIVE_DATE");
  }
  if (normalized.effectiveFrom > new Date()) throw new Error("FUTURE_EFFECTIVE_DATE");
  if (!normalized.reason) throw new Error("EMPLOYMENT_LEVEL_REASON_REQUIRED");
  return normalized;
}

async function applyEmploymentLevelOverride(tx, rawInput) {
  const input = normalizeSetInput(rawInput);
  const { organizationId, employeeNumber, levelNumber, effectiveFrom, reason, notes } = input;

  const [employee, targetLevel] = await Promise.all([
    resolveEmployee(tx, organizationId, employeeNumber),
    tx.organizationEmploymentLevel.findUnique({
      where: {
        organizationId_levelNumber: { organizationId, levelNumber },
      },
    }),
  ]);

  if (!employee) throw new Error("EMPLOYEE_NOT_FOUND");
  if (!CURRENT_STATUSES.includes(employee.status) || employee.exitDate) {
    throw new Error("EMPLOYEE_NOT_CURRENT");
  }
  if (!targetLevel || !targetLevel.isActive) throw new Error("EMPLOYMENT_LEVEL_NOT_ACTIVE");
  if (!employee.designation) throw new Error("DESIGNATION_REQUIRED");

  const current = await tx.employeeEmploymentLevelAssignment.findFirst({
    where: {
      organizationId,
      employeeId: employee.id,
      effectiveTo: null,
    },
    include: { employmentLevel: true },
    orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
  });

  if (current && effectiveFrom < current.effectiveFrom) {
    throw new Error("INVALID_EFFECTIVE_DATE");
  }

  if (current?.levelNumber === levelNumber) {
    return getEmploymentLevelState(tx, { organizationId, employeeNumber });
  }

  if (!current && Number(employee.designation.careerLevel) === levelNumber) {
    return getEmploymentLevelState(tx, { organizationId, employeeNumber });
  }

  const previousEffective = current
    ? {
        source: "EMPLOYEE_OVERRIDE",
        levelNumber: current.levelNumber,
        code: current.employmentLevel?.code || null,
        name: current.employmentLevel?.name || null,
      }
    : {
        source: "DESIGNATION_DEFAULT",
        levelNumber: employee.designation.careerLevel ?? null,
        code: employee.designation.employmentLevel?.code || null,
        name: employee.designation.employmentLevel?.name || null,
      };

  if (current) {
    await tx.employeeEmploymentLevelAssignment.update({
      where: { id: current.id },
      data: { effectiveTo: effectiveFrom },
    });
  }

  const created = await tx.employeeEmploymentLevelAssignment.create({
    data: {
      organizationId,
      employeeId: employee.id,
      levelNumber,
      effectiveFrom,
      reason,
      notes,
      performedByUserId: input.performedByUserId || null,
    },
    include: { employmentLevel: true },
  });

  await tx.organizationAudit.create({
    data: {
      organizationId,
      actorUserId: input.performedByUserId || null,
      entityType: "EmployeeEmploymentLevelAssignment",
      entityId: created.id,
      action: current
        ? "EMPLOYEE_EMPLOYMENT_LEVEL_CHANGED"
        : "EMPLOYEE_EMPLOYMENT_LEVEL_OVERRIDE_ASSIGNED",
      previousValue: {
        ...previousEffective,
        designationId: employee.designation.id,
        designationCode: employee.designation.code,
        designationName: employee.designation.name,
      },
      newValue: {
        source: "EMPLOYEE_OVERRIDE",
        levelNumber: targetLevel.levelNumber,
        code: targetLevel.code,
        name: targetLevel.name,
        designationId: employee.designation.id,
        designationCode: employee.designation.code,
        designationName: employee.designation.name,
        effectiveFrom,
      },
      reason,
    },
  });

  return getEmploymentLevelState(tx, { organizationId, employeeNumber });
}

async function setEmploymentLevelOverride(prisma, input) {
  return prisma.$transaction((tx) => applyEmploymentLevelOverride(tx, input));
}

function normalizeRemoveInput(input) {
  const normalized = {
    ...input,
    employeeNumber: String(input.employeeNumber || "").trim().toUpperCase(),
    reason: String(input.reason || "").trim(),
  };
  if (!(normalized.effectiveTo instanceof Date) || Number.isNaN(normalized.effectiveTo.getTime())) {
    throw new Error("INVALID_EFFECTIVE_DATE");
  }
  if (normalized.effectiveTo > new Date()) throw new Error("FUTURE_EFFECTIVE_DATE");
  if (!normalized.reason) throw new Error("EMPLOYMENT_LEVEL_REASON_REQUIRED");
  return normalized;
}

async function applyRemoveEmploymentLevelOverride(tx, rawInput) {
  const input = normalizeRemoveInput(rawInput);
  const { organizationId, employeeNumber, effectiveTo, reason } = input;
  const employee = await resolveEmployee(tx, organizationId, employeeNumber);
  if (!employee) throw new Error("EMPLOYEE_NOT_FOUND");
  if (
    !employee.designation ||
    employee.designation.careerLevel == null ||
    !employee.designation.employmentLevel ||
    !employee.designation.employmentLevel.isActive
  ) {
    throw new Error("EMPLOYMENT_LEVEL_MAPPING_REQUIRED");
  }

  const current = await tx.employeeEmploymentLevelAssignment.findFirst({
    where: { organizationId, employeeId: employee.id, effectiveTo: null },
    include: { employmentLevel: true },
    orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
  });
  if (!current) throw new Error("CURRENT_EMPLOYMENT_LEVEL_OVERRIDE_NOT_FOUND");
  if (effectiveTo < current.effectiveFrom) throw new Error("INVALID_EFFECTIVE_DATE");

  await tx.employeeEmploymentLevelAssignment.update({
    where: { id: current.id },
    data: { effectiveTo },
  });

  await tx.organizationAudit.create({
    data: {
      organizationId,
      actorUserId: input.performedByUserId || null,
      entityType: "EmployeeEmploymentLevelAssignment",
      entityId: current.id,
      action: "EMPLOYEE_EMPLOYMENT_LEVEL_OVERRIDE_REMOVED",
      previousValue: {
        source: "EMPLOYEE_OVERRIDE",
        levelNumber: current.levelNumber,
        code: current.employmentLevel?.code || null,
        name: current.employmentLevel?.name || null,
        originalReason: current.reason,
        originalNotes: current.notes,
        originallyPerformedByUserId: current.performedByUserId,
      },
      newValue: {
        source: "DESIGNATION_DEFAULT",
        levelNumber: employee.designation.careerLevel,
        code: employee.designation.employmentLevel.code,
        name: employee.designation.employmentLevel.name,
        designationId: employee.designation.id,
        designationCode: employee.designation.code,
        designationName: employee.designation.name,
        effectiveFrom: effectiveTo,
        removalNotes: String(input.notes || "").trim() || null,
      },
      reason,
    },
  });

  return getEmploymentLevelState(tx, { organizationId, employeeNumber });
}

async function removeEmploymentLevelOverride(prisma, input) {
  return prisma.$transaction((tx) => applyRemoveEmploymentLevelOverride(tx, input));
}

module.exports = {
  CURRENT_STATUSES,
  parseEffectiveDate,
  levelSummary,
  resolveEffectiveEmploymentLevel,
  getEmploymentLevelState,
  applyEmploymentLevelOverride,
  setEmploymentLevelOverride,
  applyRemoveEmploymentLevelOverride,
  removeEmploymentLevelOverride,
};
