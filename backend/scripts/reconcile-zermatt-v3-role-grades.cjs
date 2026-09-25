require("dotenv").config();
const { ZERMATT_EMPLOYMENT_LEVELS_V3, resolveZermattV3DesignationLevel } = require("../src/config/zermattEmploymentLevelsV3");
const { getEmploymentLevelState, applyRemoveEmploymentLevelOverride } = require("../src/services/employeeEmploymentLevelAssignmentService");
const { synchronizeZermattEmployeeLevelLive } = require("../src/services/zermattEmployeeLevelLiveService");

const TARGET_CODES = ["ZOP-SR", "ZOP-SSR", "PROC-CCO"];
const TARGET_EMPLOYEE_NUMBER = "ZLL000085";
const TARGET_EMPLOYEE_NAME = "nnaemeka kingsley nnenna";
const reason = "Approved Zermatt correction: Sales Representatives to L1 and Procurement Cost Control Officer to L3.";

function employeeName(employee) {
  return [employee.firstName, employee.middleName, employee.lastName]
    .filter(Boolean).join(" ").trim().replace(/\s+/g, " ").toLowerCase();
}

async function inspect(db, organizationId) {
  const [levels, designations, employee] = await Promise.all([
    db.organizationEmploymentLevel.findMany({
      where: { organizationId, levelNumber: { in: [201, 203] }, isActive: true },
      select: { levelNumber: true, code: true, name: true },
    }),
    db.designation.findMany({
      where: { organizationId, code: { in: TARGET_CODES } },
      select: { id: true, code: true, name: true, careerLevel: true },
    }),
    db.employee.findFirst({
      where: { organizationId, employeeNumber: TARGET_EMPLOYEE_NUMBER },
      select: { id: true, employeeNumber: true, firstName: true, middleName: true, lastName: true, designationId: true },
    }),
  ]);

  if (levels.length !== 2 || !levels.some((x) => x.levelNumber === 201 && x.code === "L1") ||
      !levels.some((x) => x.levelNumber === 203 && x.code === "L3")) {
    throw new Error("ZERMATT_V3_L1_L3_MUST_BE_ACTIVE");
  }
  if (designations.length !== TARGET_CODES.length) throw new Error("ZERMATT_TARGET_DESIGNATIONS_MISSING");
  if (employee && employeeName(employee) !== TARGET_EMPLOYEE_NAME) {
    throw new Error("ZERMATT_TARGET_EMPLOYEE_IDENTITY_MISMATCH");
  }
  const cco = designations.find((x) => x.code === "PROC-CCO");
  if (employee && employee.designationId !== cco.id) {
    throw new Error("ZERMATT_TARGET_EMPLOYEE_DESIGNATION_MISMATCH");
  }

  const employees = await db.employee.findMany({
    where: { organizationId, designationId: { in: designations.map((x) => x.id) } },
    select: { id: true, employeeNumber: true, designationId: true, status: true, exitDate: true },
  });
  const overrides = await db.employeeEmploymentLevelAssignment.findMany({
    where: { organizationId, employeeId: { in: employees.map((x) => x.id) }, effectiveTo: null },
    select: { employeeId: true, levelNumber: true },
  });
  const overrideByEmployee = new Map(overrides.map((x) => [x.employeeId, x.levelNumber]));
  const designationById = new Map(designations.map((x) => [x.id, x]));
  const conflicts = [];
  for (const row of employees) {
    const designation = designationById.get(row.designationId);
    const expected = resolveZermattV3DesignationLevel(designation).levelNumber;
    const override = overrideByEmployee.get(row.id);
    if (override && override !== expected &&
        !(row.employeeNumber === TARGET_EMPLOYEE_NUMBER && override === 202 && expected === 203)) {
      conflicts.push({ employeeNumber: row.employeeNumber, designationCode: designation.code, override, expected });
    }
  }
  return { levels, designations, employees, conflicts, targetEmployee: employee,
    targetOverride: employee ? overrideByEmployee.get(employee.id) || null : null };
}

async function main(prisma) {
  const apply = process.argv.includes("--apply");
  const year = Number(process.argv.find((x) => x.startsWith("--leave-year="))?.split("=")[1] || new Date().getFullYear());
  if (!Number.isInteger(year) || year < 2026 || year > 2100) throw new Error("INVALID_LEAVE_YEAR");
  const organization = await prisma.organization.findUnique({
    where: { slug: "zermatt-liquor-limited" }, select: { id: true, name: true },
  });
  if (!organization) throw new Error("ZERMATT_ORGANIZATION_NOT_FOUND");
  const preview = await inspect(prisma, organization.id);
  console.log(JSON.stringify({ mode: apply ? "APPLY" : "PREVIEW_ONLY", organization: organization.name,
    leaveYear: year, designations: preview.designations.map((row) => ({
      code: row.code, current: row.careerLevel,
      approved: resolveZermattV3DesignationLevel(row).levelNumber,
    })), affectedEmployees: preview.employees.length,
    namedEmployeePresent: Boolean(preview.targetEmployee), namedEmployeeOverride: preview.targetOverride,
    currentL1Label: preview.levels.find((row) => row.levelNumber === 201).name,
    approvedL1Label: ZERMATT_EMPLOYMENT_LEVELS_V3[0].name,
    overrideConflicts: preview.conflicts, databaseWritesIssued: 0 }, null, 2));
  if (!apply) return;
  if (preview.conflicts.length) throw new Error("ZERMATT_EMPLOYMENT_LEVEL_OVERRIDE_REVIEW_REQUIRED");

  const actorEmail = String(process.env.ZERMATT_V3_ACTOR_EMAIL || "").trim().toLowerCase();
  if (!actorEmail) throw new Error("ZERMATT_V3_ACTOR_EMAIL_REQUIRED");
  const actor = await prisma.user.findFirst({
    where: { organizationId: organization.id, email: actorEmail, isActive: true }, select: { id: true },
  });
  if (!actor) throw new Error("ZERMATT_V3_ACTOR_NOT_FOUND");

  const result = await prisma.$transaction(async (tx) => {
    const state = await inspect(tx, organization.id);
    if (state.conflicts.length) throw new Error("ZERMATT_EMPLOYMENT_LEVEL_OVERRIDE_REVIEW_REQUIRED");
    const existingL1 = state.levels.find((row) => row.levelNumber === 201);
    const approvedL1 = ZERMATT_EMPLOYMENT_LEVELS_V3[0];
    if (state.designations.every((row) => Number(row.careerLevel) === resolveZermattV3DesignationLevel(row).levelNumber) &&
        state.targetOverride !== 202 && existingL1.name === approvedL1.name) {
      return { changes: [], affectedEmployees: 0, namedEmployeeOverrideRemoved: false, mode: "ALREADY_RECONCILED" };
    }
    if (!["Operations Support", approvedL1.name].includes(existingL1.name)) {
      throw new Error("ZERMATT_UNEXPECTED_L1_LABEL");
    }
    const before = new Map();
    for (const employee of state.employees) {
      if (["ACTIVE", "PROBATION", "LEAVE", "SUSPENDED"].includes(employee.status) && !employee.exitDate) {
        const prior = await getEmploymentLevelState(tx, { organizationId: organization.id, employeeNumber: employee.employeeNumber });
        before.set(employee.employeeNumber, prior.effective);
      }
    }
    const changes = [];
    if (existingL1.name !== approvedL1.name) {
      await tx.organizationEmploymentLevel.update({
        where: { organizationId_levelNumber: { organizationId: organization.id, levelNumber: 201 } },
        data: { name: approvedL1.name, description: approvedL1.description },
      });
    }
    for (const designation of state.designations) {
      const expected = resolveZermattV3DesignationLevel(designation);
      if (Number(designation.careerLevel) === expected.levelNumber) continue;
      if (Number(designation.careerLevel) !== 202) {
        throw new Error(`ZERMATT_UNEXPECTED_OLD_DESIGNATION_LEVEL:${designation.code}`);
      }
      await tx.designation.update({ where: { id: designation.id }, data: { careerLevel: expected.levelNumber } });
      changes.push({ code: designation.code, from: designation.careerLevel, to: expected.levelNumber });
    }
    if (state.targetEmployee && state.targetOverride === 202) {
      await applyRemoveEmploymentLevelOverride(tx, {
        organizationId: organization.id, employeeNumber: TARGET_EMPLOYEE_NUMBER,
        effectiveTo: new Date(), performedByUserId: actor.id,
        reason: "Approved Senior Officer classification for Nnaemeka Kingsley Nnenna; restore L3 designation default.",
      });
    }
    const activated = [];
    for (const employee of state.employees) {
      if (!before.has(employee.employeeNumber)) continue;
      activated.push(await synchronizeZermattEmployeeLevelLive(tx, {
        organizationId: organization.id, employeeNumber: employee.employeeNumber,
        actorUserId: actor.id, leaveYear: year, previousEffective: before.get(employee.employeeNumber), reason,
      }));
    }
    if (changes.length || state.targetOverride === 202 || existingL1.name !== approvedL1.name) {
      await tx.organizationAudit.create({ data: {
        organizationId: organization.id, actorUserId: actor.id, entityType: "Organization", entityId: organization.id,
        action: "ZERMATT_V3_ROLE_GRADE_CORRECTION", previousValue: { designations: changes.map(({ code, from }) => ({ code, level: from })) },
        newValue: { designations: changes.map(({ code, to }) => ({ code, level: to })),
          l1Label: approvedL1.name, leaveYear: year, affectedEmployees: activated.length }, reason,
      } });
    }
    return { changes, affectedEmployees: activated.length, l1Label: approvedL1.name,
      namedEmployeeOverrideRemoved: state.targetOverride === 202 };
  }, { isolationLevel: "Serializable", timeout: 120000 });
  console.log(JSON.stringify({ status: "APPLIED", ...result }, null, 2));
}

if (require.main === module) {
  const prisma = require("../src/config/prisma");
  main(prisma).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  }).finally(async () => prisma.$disconnect());
}

module.exports = { inspect };
