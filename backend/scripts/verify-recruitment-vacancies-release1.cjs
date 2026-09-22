require("dotenv").config();
const prisma = require("../src/config/prisma");

async function main() {
  const organization = await prisma.organization.findFirst({
    where: { slug: "zermatt-liquor-limited" },
    select: { id: true, name: true, slug: true },
  });
  if (!organization) throw new Error("ZERMATT organization was not found.");

  const tableRows = await prisma.$queryRawUnsafe(
    `SELECT to_regclass('public.recruitment_vacancies')::text AS "vacancies",
            to_regclass('public.recruitment_vacancy_counters')::text AS "counters"`
  );
  const tables = tableRows[0] || {};
  if (!tables.vacancies || !tables.counters) {
    throw new Error("Recruitment Vacancies Release-1 migration has not been deployed.");
  }

  const [counts, branches] = await Promise.all([
    prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS "total",
              COUNT(*) FILTER (WHERE "status"='DRAFT')::int AS "draft",
              COUNT(*) FILTER (WHERE "status"='PUBLISHED')::int AS "published",
              COUNT(*) FILTER (WHERE "status"='CLOSED')::int AS "closed",
              COUNT(*) FILTER (WHERE "status"='CANCELLED')::int AS "cancelled"
         FROM "recruitment_vacancies"
        WHERE "organizationId"=$1`,
      organization.id
    ),
    prisma.organizationLocation.findMany({
      where: {
        organizationId: organization.id,
        isActive: true,
        type: "BRANCH",
      },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
  ]);

  const branchEvidence = [];
  for (const branch of branches) {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS "vacancies",
              COUNT(*) FILTER (WHERE "status"='PUBLISHED')::int AS "published"
         FROM "recruitment_vacancies"
        WHERE "organizationId"=$1 AND "locationId"=$2`,
      organization.id,
      branch.id
    );
    branchEvidence.push({
      code: branch.code,
      name: branch.name,
      vacancies: Number(rows[0]?.vacancies || 0),
      published: Number(rows[0]?.published || 0),
    });
  }

  const duplicateRows = await prisma.$queryRawUnsafe(
    `SELECT "requisitionId", COUNT(*)::int AS "count"
       FROM "recruitment_vacancies"
      WHERE "organizationId"=$1
      GROUP BY "requisitionId"
     HAVING COUNT(*) > 1`,
    organization.id
  );
  if (duplicateRows.length) throw new Error("Duplicate vacancy records exist for a requisition.");

  console.log("============================================================");
  console.log("RECRUITMENT VACANCIES RELEASE-1 — READ ONLY VERIFY");
  console.log("============================================================");
  console.log(JSON.stringify({
    mode: "READ_ONLY_VACANCY_VERIFY",
    organization: organization.name,
    tables,
    totals: {
      total: Number(counts[0]?.total || 0),
      draft: Number(counts[0]?.draft || 0),
      published: Number(counts[0]?.published || 0),
      closed: Number(counts[0]?.closed || 0),
      cancelled: Number(counts[0]?.cancelled || 0),
    },
    branches: branchEvidence,
    duplicateRequisitionVacancies: 0,
    databaseWrites: 0,
  }, null, 2));
  console.log("PASS: Recruitment Vacancies Release-1 database foundation verified read-only.");
}

main()
  .catch((error) => {
    console.error("FAIL:", error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
