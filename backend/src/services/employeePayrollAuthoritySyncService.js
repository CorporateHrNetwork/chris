const prisma = require("../config/prisma");

const CURRENT_STATUSES = ["ACTIVE", "PROBATION", "LEAVE", "SUSPENDED"];

function hasText(value) {
  return Boolean(String(value || "").trim());
}

function employmentTypeFromWorkflow(value, { zermatt = false } = {}) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;

  if (
    ["permanent", "permanent employee", "full-time", "full time", "full-time employment", "full time employment"].includes(normalized)
  ) {
    return "Full-Time";
  }
  if (["part-time", "part time", "part-time employment", "part time employment"].includes(normalized)) {
    return zermatt ? "Part-time" : "Part-Time";
  }
  if (normalized === "expatriate") return "Expatriate";
  if (
    normalized.includes("nysc") ||
    normalized.includes("intern") ||
    normalized.includes("trainee")
  ) {
    return zermatt ? "NYSC/Internship" : "NYSC / Internship";
  }
  if (normalized.includes("domestic") || normalized.includes("housekeeper")) {
    return "Domestic Staff - Housekeeper";
  }
  return null;
}

async function provisionNorthstarCostCentre(tx, organizationId, department) {
  const code = department ? `NS-DEPT-${department.id}` : "NS-GENERAL";
  const centre = await tx.costCentre.upsert({
    where: { organizationId_code: { organizationId, code } },
    create: {
      organizationId,
      code,
      name: department?.name || "Northstar General Operations",
      effectiveFrom: new Date("2026-01-01T00:00:00Z"),
    },
    update: {},
    select: { id: true },
  });
  if (department) {
    await tx.department.updateMany({
      where: { id: department.id, organizationId, costCentreId: null },
      data: { costCentreId: centre.id },
    });
    const mappedDepartment = await tx.department.findFirstOrThrow({
      where: { id: department.id, organizationId },
      select: { costCentreId: true },
    });
    return mappedDepartment.costCentreId;
  }
  return centre.id;
}

async function synchronizePayrollAuthorityFromMappings({
  organizationId,
  actorUserId = null,
  prismaClient = prisma,
}) {
  const organization = await prismaClient.organization.findUnique({
    where: { id: organizationId },
    select: { slug: true },
  });
  const northstar = organizationId === "chris-demo-org-20261022" && organization?.slug === "chris-demo-company";
  const zermatt =
    String(organization?.slug || "").trim().toLowerCase() ===
    "zermatt-liquor-limited";

  const employees = await prismaClient.employee.findMany({
    where: {
      organizationId,
      status: { in: CURRENT_STATUSES },
    },
    select: {
      id: true,
      employeeNumber: true,
      employmentType: true,
      costCentreId: true,
      department: {
        select: {
          id: true,
          name: true,
          costCentreId: true,
        },
      },
      onboardings: {
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        take: 1,
        select: {
          id: true,
          template: {
            select: {
              id: true,
              name: true,
              employmentType: true,
            },
          },
        },
      },
    },
  });

  const repaired = [];
  for (const employee of employees) {
    const updates = {};
    const source = {};

    if (!hasText(employee.costCentreId) && employee.department?.costCentreId) {
      updates.costCentreId = employee.department.costCentreId;
      source.costCentre = "DEPARTMENT_MAPPING";
    }

    if (!hasText(employee.employmentType)) {
      const onboarding = employee.onboardings?.[0];
      const derivedEmploymentType = employmentTypeFromWorkflow(
        onboarding?.template?.employmentType || onboarding?.template?.name,
        { zermatt }
      );
      if (derivedEmploymentType) {
        updates.employmentType = derivedEmploymentType;
        source.employmentType = "ONBOARDING_WORKFLOW";
      }
    }

    const missingNorthstarCentre = northstar && !hasText(employee.costCentreId) && !updates.costCentreId;
    if (!Object.keys(updates).length && !missingNorthstarCentre) continue;

    const applied = await prismaClient.$transaction(async (tx) => {
      if (missingNorthstarCentre) {
        updates.costCentreId = await provisionNorthstarCostCentre(tx, organizationId, employee.department);
        source.costCentre = employee.department ? "DEPARTMENT_MAPPING" : "NORTHSTAR_GENERAL_OPERATIONS";
      }

      if (northstar && updates.costCentreId) {
        const result = await tx.employee.updateMany({
          where: { id: employee.id, organizationId, costCentreId: null },
          data: updates,
        });
        if (!result.count) return false;
      } else {
        await tx.employee.update({
          where: { id: employee.id },
          data: updates,
        });
      }

      await tx.organizationAudit.create({
        data: {
          organizationId,
          actorUserId,
          entityType: "Employee",
          entityId: employee.id,
          action: "PAYROLL_AUTHORITY_AUTO_SYNC",
          previousValue: {
            employeeNumber: employee.employeeNumber,
            employmentType: employee.employmentType,
            costCentreId: employee.costCentreId,
          },
          newValue: {
            employeeNumber: employee.employeeNumber,
            employmentType:
              updates.employmentType || employee.employmentType || null,
            costCentreId:
              updates.costCentreId || employee.costCentreId || null,
            source,
          },
          reason:
            "Automatically synchronized missing payroll authority from existing CHRiS onboarding and organization mappings before payroll calculation.",
        },
      });
      return true;
    });
    if (!applied) continue;

    repaired.push({
      employeeNumber: employee.employeeNumber,
      updates,
      source,
    });
  }

  return repaired;
}

module.exports = {
  employmentTypeFromWorkflow,
  synchronizePayrollAuthorityFromMappings,
};
