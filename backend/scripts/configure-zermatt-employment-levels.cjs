require("dotenv").config();
const prisma = require("../src/config/prisma");
const { ZERMATT_EMPLOYMENT_LEVELS } = require("../src/config/zermattEmploymentLevels");

async function main() {
  const organization = await prisma.organization.findUnique({
    where: { slug: "zermatt-liquor-limited" },
    select: { id: true, name: true },
  });
  if (!organization) throw new Error("ZERMATT_ORGANIZATION_NOT_FOUND");

  const before = await prisma.organizationEmploymentLevel.findMany({
    where: { organizationId: organization.id },
    orderBy: { levelNumber: "asc" },
  });

  const updates = [];
  for (const level of ZERMATT_EMPLOYMENT_LEVELS) {
    const existing = before.find((row) => row.levelNumber === level.levelNumber) || null;
    const saved = await prisma.organizationEmploymentLevel.upsert({
      where: { organizationId_levelNumber: { organizationId: organization.id, levelNumber: level.levelNumber } },
      update: {
        name: level.name,
        code: level.code,
        description: level.description,
        displayOrder: level.displayOrder,
        isActive: true,
      },
      create: { organizationId: organization.id, ...level },
    });
    updates.push({
      levelNumber: level.levelNumber,
      previousName: existing?.name || null,
      name: saved.name,
      code: saved.code,
    });
  }

  // Preserve designation.careerLevel mappings. This script normalizes the
  // hierarchy labels only; it does not silently move employees or designations
  // between grades because those mappings drive leave entitlements and other HR controls.
  const designationCounts = await prisma.designation.groupBy({
    by: ["careerLevel"],
    where: { organizationId: organization.id, careerLevel: { not: null } },
    _count: { _all: true },
    orderBy: { careerLevel: "asc" },
  });

  console.log(JSON.stringify({
    organization: organization.name,
    levels: updates,
    designationCountsByExistingLevel: designationCounts.map((row) => ({
      levelNumber: row.careerLevel,
      designations: row._count._all,
    })),
    control: "Level labels normalized; existing designation and employee level mappings preserved.",
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
