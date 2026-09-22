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

async function synchronizePayrollAuthorityFromMappings({
  organizationId,
  actorUserId = null,
  prismaClient = prisma,
}) {
  const organization = await prismaClient.organization.findUnique({
    where: { id: organizationId },
    select: { slug: true },
  });
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

    if (!Object.keys(updates).length) continue;

    await prismaClient.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id: employee.id },
        data: updates,
      });

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
    });

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
