"use strict";

const prisma = require("../src/config/prisma");
const {
  ZERMATT_SLUG,
  ZERMATT_EMPLOYMENT_TYPES,
  normalizeZermattEmploymentType,
} = require("../src/services/employeeEmploymentAssignmentService");

const TAKEAWAY_COST_CENTRES = [
  {
    code: "BBT-GEN",
    name: "BB Takeaway",
    description: "Beer Barn Takeaway operating unit",
  },
  {
    code: "BBT-WSE",
    name: "BB Takeaway - WSE",
    description: "Beer Barn Takeaway operating unit - WSE",
  },
  {
    code: "BBT-GWP",
    name: "BB Takeaway - GWP",
    description: "Beer Barn Takeaway operating unit - GWP",
  },
];

const GENERIC_TAKEAWAY_EMPLOYEES = [
  "ZLL000139",
  "ZLL000146",
  "ZLL000181",
  "ZLL000199",
  "ZLL000226",
  "ZLL000238",
  "ZLL000264",
  "ZLL000269",
];

async function ensureCostCentre(tx, organizationId, definition) {
  const existing = await tx.costCentre.findFirst({
    where: { organizationId, code: definition.code },
  });

  if (existing) {
    return tx.costCentre.update({
      where: { id: existing.id },
      data: {
        name: definition.name,
        description: definition.description,
        status: "ACTIVE",
        effectiveTo: null,
      },
    });
  }

  return tx.costCentre.create({
    data: {
      organizationId,
      code: definition.code,
      name: definition.name,
      description: definition.description,
      status: "ACTIVE",
      effectiveFrom: new Date(),
      effectiveTo: null,
    },
  });
}

(async () => {
  const organization = await prisma.organization.findUnique({
    where: { slug: ZERMATT_SLUG },
    select: { id: true, name: true, slug: true },
  });

  if (!organization) {
    throw new Error("ZERMATT LIQUOR LIMITED organization was not found.");
  }

  const employees = await prisma.employee.findMany({
    where: { organizationId: organization.id },
    select: {
      id: true,
      employeeNumber: true,
      employmentType: true,
      costCentreId: true,
    },
  });

  const unsupported = employees.filter(
    (employee) =>
      employee.employmentType &&
      !normalizeZermattEmploymentType(employee.employmentType)
  );

  if (unsupported.length) {
    console.error("Unsupported ZERMATT Employment Type values found:");
    console.error(
      unsupported.map((employee) => ({
        employeeNumber: employee.employeeNumber,
        employmentType: employee.employmentType,
      }))
    );
    throw new Error(
      "Resolve unsupported Employment Type values before applying the ZERMATT foundation."
    );
  }

  const genericEmployees = new Map(
    employees
      .filter((employee) => GENERIC_TAKEAWAY_EMPLOYEES.includes(employee.employeeNumber))
      .map((employee) => [employee.employeeNumber, employee])
  );

  const missingGenericEmployees = GENERIC_TAKEAWAY_EMPLOYEES.filter(
    (employeeNumber) => !genericEmployees.has(employeeNumber)
  );
  if (missingGenericEmployees.length) {
    throw new Error(
      `Expected generic BB Takeaway employees were not found: ${missingGenericEmployees.join(", ")}`
    );
  }

  const conflictingGenericEmployees = GENERIC_TAKEAWAY_EMPLOYEES.filter(
    (employeeNumber) => genericEmployees.get(employeeNumber)?.costCentreId
  );
  if (conflictingGenericEmployees.length) {
    throw new Error(
      `Generic BB Takeaway employees already have Cost Centres; no overwrite performed: ${conflictingGenericEmployees.join(", ")}`
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    const costCentres = {};
    for (const definition of TAKEAWAY_COST_CENTRES) {
      costCentres[definition.code] = await ensureCostCentre(
        tx,
        organization.id,
        definition
      );
    }

    let employmentTypesNormalized = 0;
    for (const employee of employees) {
      if (!employee.employmentType) continue;
      const normalized = normalizeZermattEmploymentType(employee.employmentType);
      if (normalized !== employee.employmentType) {
        await tx.employee.update({
          where: { id: employee.id },
          data: { employmentType: normalized },
        });
        employmentTypesNormalized += 1;
      }
    }

    const genericCostCentre = costCentres["BBT-GEN"];
    let genericTakeawayAssignments = 0;
    for (const employeeNumber of GENERIC_TAKEAWAY_EMPLOYEES) {
      const employee = genericEmployees.get(employeeNumber);
      const updated = await tx.employee.updateMany({
        where: {
          id: employee.id,
          organizationId: organization.id,
          costCentreId: null,
        },
        data: { costCentreId: genericCostCentre.id },
      });
      genericTakeawayAssignments += updated.count;

      if (updated.count) {
        await tx.organizationAudit.create({
          data: {
            organizationId: organization.id,
            actorUserId: null,
            entityType: "Employee",
            entityId: employee.id,
            action: "ZERMATT_RELEASE1_COST_CENTRE_BACKFILL",
            previousValue: { costCentreId: null },
            newValue: {
              costCentreId: genericCostCentre.id,
              costCentreCode: genericCostCentre.code,
              costCentreName: genericCostCentre.name,
            },
            reason: "Authoritative ZERMATT source value: BB Takeaway",
          },
        });
      }
    }

    return {
      costCentres: TAKEAWAY_COST_CENTRES.map((definition) => ({
        code: definition.code,
        name: definition.name,
        id: costCentres[definition.code].id,
      })),
      employmentTypesNormalized,
      genericTakeawayAssignments,
    };
  });

  const after = await prisma.employee.findMany({
    where: { organizationId: organization.id },
    select: { employmentType: true, costCentreId: true },
  });

  const invalidEmploymentTypeCount = after.filter(
    (employee) =>
      !employee.employmentType ||
      !ZERMATT_EMPLOYMENT_TYPES.includes(employee.employmentType)
  ).length;
  const missingCostCentreCount = after.filter(
    (employee) => !employee.costCentreId
  ).length;

  console.log(
    JSON.stringify(
      {
        organization: organization.name,
        authoritativeEmploymentTypes: ZERMATT_EMPLOYMENT_TYPES,
        ...result,
        invalidOrMissingEmploymentTypeAfter: invalidEmploymentTypeCount,
        missingCostCentreAfter: missingCostCentreCount,
      },
      null,
      2
    )
  );

  if (invalidEmploymentTypeCount !== 0 || missingCostCentreCount !== 0) {
    process.exitCode = 2;
  }
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
