require("dotenv").config();
const prisma = require("../src/config/prisma");
const {
  ZERMATT_EMPLOYMENT_LEVELS,
  ZERMATT_DESIGNATION_LEVELS,
  resolveZermattDesignationLevel,
} = require("../src/config/zermattEmploymentLevels");

const ZERMATT_SLUG = "zermatt-liquor-limited";

function assignmentFingerprint(rows) {
  return JSON.stringify(
    rows
      .map((row) => ({ id: row.id, designationId: row.designationId || null }))
      .sort((a, b) => a.id.localeCompare(b.id))
  );
}

async function main() {
  const organization = await prisma.organization.findUnique({
    where: { slug: ZERMATT_SLUG },
    select: { id: true, name: true },
  });
  if (!organization) throw new Error("ZERMATT_ORGANIZATION_NOT_FOUND");

  const designations = await prisma.designation.findMany({
    where: { organizationId: organization.id },
    select: {
      id: true,
      name: true,
      code: true,
      careerTrack: true,
      careerLevel: true,
      isActive: true,
      _count: { select: { employees: true } },
    },
    orderBy: [{ name: "asc" }],
  });

  const mapped = [];
  const unmapped = [];
  for (const designation of designations) {
    const reference = resolveZermattDesignationLevel(designation);
    if (!reference) {
      unmapped.push({
        id: designation.id,
        name: designation.name,
        code: designation.code,
        careerLevel: designation.careerLevel,
        isActive: designation.isActive,
        employees: designation._count.employees,
      });
      continue;
    }
    mapped.push({ designation, reference });
  }

  // Production safety: never infer a grade for an unknown ZERMATT designation.
  // The transaction does not start until every designation in the tenant has an
  // exact authoritative code/name match.
  if (unmapped.length) {
    const error = new Error("ZERMATT_DESIGNATION_MAPPING_REQUIRED");
    error.details = { total: unmapped.length, designations: unmapped };
    throw error;
  }

  const matchedReferenceCodes = new Set(mapped.map(({ reference }) => reference.code));
  const referenceDesignationsNotPresent = ZERMATT_DESIGNATION_LEVELS
    .filter((reference) => !matchedReferenceCodes.has(reference.code))
    .map((reference) => ({
      name: reference.name,
      code: reference.code,
      levelNumber: reference.levelNumber,
    }));

  const result = await prisma.$transaction(
    async (tx) => {
      const employeeAssignmentsBefore = await tx.employee.findMany({
        where: { organizationId: organization.id },
        select: { id: true, designationId: true },
        orderBy: { id: "asc" },
      });
      const beforeFingerprint = assignmentFingerprint(employeeAssignmentsBefore);

      const existingLevels = await tx.organizationEmploymentLevel.findMany({
        where: { organizationId: organization.id },
        orderBy: { levelNumber: "asc" },
      });

      const levelChanges = [];
      for (const level of ZERMATT_EMPLOYMENT_LEVELS) {
        const previous =
          existingLevels.find((row) => row.levelNumber === level.levelNumber) || null;
        const saved = await tx.organizationEmploymentLevel.upsert({
          where: {
            organizationId_levelNumber: {
              organizationId: organization.id,
              levelNumber: level.levelNumber,
            },
          },
          update: {
            name: level.name,
            code: level.code,
            description: level.description,
            displayOrder: level.displayOrder,
            isActive: true,
          },
          create: { organizationId: organization.id, ...level },
        });
        levelChanges.push({
          levelNumber: level.levelNumber,
          previousName: previous?.name || null,
          name: saved.name,
          code: saved.code,
        });
      }

      const designationChanges = [];
      for (const { designation, reference } of mapped) {
        if (designation.careerLevel === reference.levelNumber) continue;

        await tx.designation.update({
          where: { id: designation.id },
          data: { careerLevel: reference.levelNumber },
        });

        await tx.organizationAudit.create({
          data: {
            organizationId: organization.id,
            actorUserId: null,
            entityType: "Designation",
            entityId: designation.id,
            action: "ZERMATT_EMPLOYMENT_LEVEL_REORGANIZED",
            previousValue: {
              careerLevel: designation.careerLevel,
              designationName: designation.name,
              designationCode: designation.code,
            },
            newValue: {
              careerLevel: reference.levelNumber,
              designationName: designation.name,
              designationCode: designation.code,
              referenceCareerTrack: reference.careerTrack,
            },
            reason:
              "Authoritative ZERMATT Designation -> Employment Level reference mapping",
          },
        });

        designationChanges.push({
          id: designation.id,
          name: designation.name,
          code: designation.code,
          from: designation.careerLevel,
          to: reference.levelNumber,
        });
      }

      const afterDesignations = await tx.designation.findMany({
        where: { organizationId: organization.id },
        select: { id: true, name: true, code: true, careerLevel: true },
      });
      const invalidAfter = afterDesignations
        .map((designation) => ({
          designation,
          reference: resolveZermattDesignationLevel(designation),
        }))
        .filter(
          ({ designation, reference }) =>
            !reference || designation.careerLevel !== reference.levelNumber
        )
        .map(({ designation, reference }) => ({
          id: designation.id,
          name: designation.name,
          code: designation.code,
          careerLevel: designation.careerLevel,
          expectedLevel: reference?.levelNumber || null,
        }));
      if (invalidAfter.length) {
        const error = new Error("ZERMATT_DESIGNATION_LEVEL_POSTCONDITION_FAILED");
        error.details = { designations: invalidAfter };
        throw error;
      }

      const employeeAssignmentsAfter = await tx.employee.findMany({
        where: { organizationId: organization.id },
        select: { id: true, designationId: true },
        orderBy: { id: "asc" },
      });
      if (beforeFingerprint !== assignmentFingerprint(employeeAssignmentsAfter)) {
        throw new Error("ZERMATT_EMPLOYEE_DESIGNATION_RELATIONSHIP_CHANGED");
      }

      return {
        levelChanges,
        designationChanges,
        employeesChecked: employeeAssignmentsAfter.length,
      };
    },
    { isolationLevel: "Serializable" }
  );

  console.log(
    JSON.stringify(
      {
        organization: organization.name,
        authoritativeDesignations: ZERMATT_DESIGNATION_LEVELS.length,
        currentDesignations: designations.length,
        referenceDesignationsNotPresent,
        ...result,
        controls: {
          employeeDesignationRelationshipsPreserved: true,
          leaveEntitlementModelsWritten: false,
          annualLeaveBandsPreserved: {
            L11: 30,
            "L9-L10": 28,
            "L5-L8": 21,
            "L1-L4": 14,
          },
        },
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    if (error?.details) console.error(JSON.stringify(error.details, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
