const prisma = require("../config/prisma");

const CHRIS_LEVEL_DEFAULTS = [
  [1,"Entry / Support","Assistants, trainees and junior support roles"],
  [2,"Officer / Professional","Officers and professional individual contributors"],
  [3,"Senior Officer / Specialist","Experienced officers, specialists and senior individual contributors"],
  [4,"Supervisor / Manager","Supervisors and first/mid-level managers"],
  [5,"Senior Manager / Head","Senior managers, functional heads and major unit leaders"],
  [6,"Executive / Director","Directors and executive leadership"],
].map(([levelNumber,name,description])=>({levelNumber,name,description,code:`LEVEL_${levelNumber}`,displayOrder:levelNumber}));

async function ensureEmploymentLevels({ organizationId, tx = prisma }) {
  if (!organizationId) throw new Error("ORGANIZATION_REQUIRED");

  for (const level of CHRIS_LEVEL_DEFAULTS) {
    await tx.organizationEmploymentLevel.upsert({
      where: {
        organizationId_levelNumber: {
          organizationId,
          levelNumber: level.levelNumber,
        },
      },
      update: {},
      create: { organizationId, ...level },
    });
    // Enrich only untouched CHRIS placeholders; tenant terminology and stable
    // LEVEL_n codes remain authoritative and are never overwritten here.
    await tx.organizationEmploymentLevel.updateMany({
      where: { organizationId, levelNumber: level.levelNumber, name: `Level ${level.levelNumber}` },
      data: { name: level.name, description: level.description },
    });
  }

  return tx.organizationEmploymentLevel.findMany({
    where: { organizationId },
    orderBy: [{ displayOrder: "asc" }, { levelNumber: "asc" }],
  });
}

async function listEmploymentLevels({ organizationId }) {
  await ensureEmploymentLevels({ organizationId });
  return prisma.organizationEmploymentLevel.findMany({
    where: { organizationId },
    include: { _count: { select: { designations: true } } },
    orderBy: [{ displayOrder: "asc" }, { levelNumber: "asc" }],
  });
}

async function saveEmploymentLevel({ organizationId, input }) {
  const levelNumber = Number(input?.levelNumber);
  const name = String(input?.name || "").trim();
  const code = String(input?.code || `LEVEL_${levelNumber}`)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!Number.isInteger(levelNumber) || levelNumber < 1) {
    throw new Error("INVALID_EMPLOYMENT_LEVEL");
  }
  if (!name) throw new Error("EMPLOYMENT_LEVEL_NAME_REQUIRED");

  return prisma.organizationEmploymentLevel.upsert({
    where: {
      organizationId_levelNumber: { organizationId, levelNumber },
    },
    update: {
      name,
      code,
      description: input?.description || null,
      displayOrder: Number(input?.displayOrder ?? levelNumber),
      ...(typeof input?.isActive === "boolean"
        ? { isActive: input.isActive }
        : {}),
    },
    create: {
      organizationId,
      levelNumber,
      name,
      code,
      description: input?.description || null,
      displayOrder: Number(input?.displayOrder ?? levelNumber),
      isActive: input?.isActive !== false,
    },
  });
}

async function resolveEmploymentLevelFromDesignation({
  organizationId,
  designationId,
  tx = prisma,
  requireActive = true,
}) {
  if (!designationId) throw new Error("DESIGNATION_REQUIRED");

  const designation = await tx.designation.findFirst({
    where: { id: designationId, organizationId },
    include: { employmentLevel: true },
  });

  if (!designation) throw new Error("DESIGNATION_NOT_FOUND");
  if (
    designation.careerLevel == null ||
    !designation.employmentLevel ||
    (requireActive && !designation.employmentLevel.isActive)
  ) {
    const error = new Error("EMPLOYMENT_LEVEL_MAPPING_REQUIRED");
    error.details = {
      designationId: designation.id,
      designationName: designation.name,
      careerLevel: designation.careerLevel,
    };
    throw error;
  }

  return {
    designation,
    employmentLevel: designation.employmentLevel,
    levelNumber: designation.careerLevel,
  };
}

async function listEmploymentLevelExceptions({ organizationId }) {
  const employees = await prisma.employee.findMany({
    where: {
      organizationId,
      status: { in: ["ACTIVE", "PROBATION", "LEAVE"] },
      OR: [
        { designationId: null },
        { designation: { careerLevel: null } },
      ],
    },
    select: {
      employeeNumber: true,
      firstName: true,
      middleName: true,
      lastName: true,
      designation: {
        select: { id: true, name: true, careerLevel: true },
      },
    },
    orderBy: { employeeNumber: "asc" },
  });

  return employees.map((employee) => ({
    ...employee,
    code: "EMPLOYMENT_LEVEL_MAPPING_REQUIRED",
    message: employee.designation
      ? "The employee's designation has no Employment Level configured."
      : "The employee has no designation.",
  }));
}

module.exports = {
  CHRIS_LEVEL_DEFAULTS,
  ensureEmploymentLevels,
  listEmploymentLevels,
  saveEmploymentLevel,
  resolveEmploymentLevelFromDesignation,
  listEmploymentLevelExceptions,
};
