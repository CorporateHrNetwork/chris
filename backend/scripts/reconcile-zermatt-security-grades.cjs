require("dotenv").config();
const { resolveEffectiveEmploymentLevel } = require("../src/services/employeeEmploymentLevelAssignmentService");
const { synchronizeZermattEmployeeLevelLive } = require("../src/services/zermattEmployeeLevelLiveService");

const targets = { "SEC-SO": 201, "SEC-SUP": 202 };
const leviNumber = "ZLL000262";
const currentStatuses = ["ACTIVE", "PROBATION", "LEAVE", "SUSPENDED"];
const reason = "Management-approved Zermatt security grading: Security Officers L1; Levi Ment Ahmed L2.";

async function inspect(db, organizationId) {
  const [levels, designations] = await Promise.all([
    db.organizationEmploymentLevel.findMany({
      where: { organizationId, levelNumber: { in: [201, 202] }, isActive: true },
      select: { levelNumber: true, code: true },
    }),
    db.designation.findMany({
      where: { organizationId, code: { in: Object.keys(targets) } },
      select: { id: true, code: true, name: true, careerLevel: true },
    }),
  ]);
  if (levels.length !== 2 || !levels.some((x) => x.levelNumber === 201 && x.code === "L1") ||
      !levels.some((x) => x.levelNumber === 202 && x.code === "L2")) throw new Error("ZERMATT_L1_L2_LEVELS_REQUIRED");
  if (designations.length !== 2 || designations.some((x) =>
    (x.code === "SEC-SO" && x.name !== "Security Officer") ||
    (x.code === "SEC-SUP" && x.name !== "Security Supervisor") ||
    ![targets[x.code], x.code === "SEC-SO" ? 202 : 203].includes(x.careerLevel)
  )) throw new Error("ZERMATT_SECURITY_DESIGNATIONS_UNEXPECTED");

  const employees = await db.employee.findMany({
    where: { organizationId, designationId: { in: designations.map((x) => x.id) } },
    select: { id: true, employeeNumber: true, firstName: true, middleName: true,
      lastName: true, designationId: true, status: true, exitDate: true },
  });
  const supervisor = employees.filter((x) => x.designationId === designations.find((d) => d.code === "SEC-SUP").id);
  const levi = supervisor.find((x) => x.employeeNumber === leviNumber);
  if (supervisor.length !== 1 || !levi ||
      [levi.firstName, levi.middleName, levi.lastName].join(" ").trim().toLowerCase() !== "levi ment ahmed" ||
      !currentStatuses.includes(levi.status) || levi.exitDate) throw new Error("ZERMATT_LEVI_IDENTITY_OR_ROLE_MISMATCH");
  const current = employees.filter((x) => currentStatuses.includes(x.status) && !x.exitDate);
  const overrides = current.length ? await db.employeeEmploymentLevelAssignment.findMany({
    where: { organizationId, employeeId: { in: current.map((x) => x.id) }, effectiveTo: null },
    select: { employeeId: true, levelNumber: true },
  }) : [];
  const codeByDesignationId = new Map(designations.map((x) => [x.id, x.code]));
  if (overrides.some((x) => targets[codeByDesignationId.get(current.find((e) => e.id === x.employeeId)?.designationId)] !== x.levelNumber)) {
    throw new Error("ZERMATT_SECURITY_OVERRIDE_REVIEW_REQUIRED");
  }
  return { designations, employees: current, supervisor: levi, overrides };
}

async function main(prisma) {
  const apply = process.argv.includes("--apply");
  const organization = await prisma.organization.findUnique({
    where: { slug: "zermatt-liquor-limited" }, select: { id: true },
  });
  if (!organization) throw new Error("ZERMATT_ORGANIZATION_NOT_FOUND");
  const before = await inspect(prisma, organization.id);
  console.log(JSON.stringify({ mode: apply ? "APPLY" : "PREVIEW_ONLY",
    designations: before.designations.map((x) => ({ code: x.code, from: x.careerLevel, to: targets[x.code] })),
    currentEmployees: before.employees.length, supervisorVerified: Boolean(before.supervisor),
    compatibleOverrides: before.overrides.length, databaseWritesIssued: 0 }, null, 2));
  if (!apply) return;
  const result = await prisma.$transaction(async (tx) => {
    const state = await inspect(tx, organization.id);
    const previous = new Map();
    for (const employee of state.employees) {
      const effective = await resolveEffectiveEmploymentLevel(tx, {
        organizationId: organization.id, employeeId: employee.id,
      });
      previous.set(employee.employeeNumber, {
        levelNumber: effective.levelNumber, source: effective.source,
        employmentLevel: effective.employmentLevel,
      });
    }
    const changes = [];
    for (const designation of state.designations) {
      const target = targets[designation.code];
      if (designation.careerLevel === target) continue;
      await tx.designation.update({ where: { id: designation.id }, data: { careerLevel: target } });
      changes.push({ designation: designation.code, from: designation.careerLevel, to: target });
    }
    for (const employee of state.employees) {
      const expected = targets[state.designations.find((x) => x.id === employee.designationId).code];
      const effective = await resolveEffectiveEmploymentLevel(tx, {
        organizationId: organization.id, employeeId: employee.id,
      });
      if (effective.levelNumber !== expected) throw new Error("ZERMATT_SECURITY_LEVEL_VERIFICATION_FAILED");
      if (previous.get(employee.employeeNumber).levelNumber !== expected) {
        await synchronizeZermattEmployeeLevelLive(tx, {
          organizationId: organization.id, employeeNumber: employee.employeeNumber,
          leaveYear: 2026, previousEffective: previous.get(employee.employeeNumber), reason,
        });
      }
    }
    if (changes.length) await tx.organizationAudit.create({ data: {
      organizationId: organization.id, entityType: "Organization", entityId: organization.id,
      action: "ZERMATT_SECURITY_GRADE_CORRECTION", previousValue: { designations: changes.map((x) => ({ code: x.designation, level: x.from })) },
      newValue: { designations: changes.map((x) => ({ code: x.designation, level: x.to })),
        currentEmployees: state.employees.length }, reason,
    } });
    return { status: changes.length ? "APPLIED" : "ALREADY_RECONCILED",
      designations: changes, verifiedEmployees: state.employees.length,
      leviLevel: 202 };
  }, { isolationLevel: "Serializable", timeout: 120000 });
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  const prisma = require("../src/config/prisma");
  main(prisma).catch((error) => { console.error(error); process.exitCode = 1; })
    .finally(async () => prisma.$disconnect());
}

module.exports = { inspect, main };
