const prisma = require("../src/config/prisma");

async function main() {
  const organization = await prisma.organization.findUnique({
    where: { slug: "zermatt-liquor-limited" },
    select: { id: true, name: true, slug: true },
  });
  if (!organization) throw new Error("ZERMATT organization was not found.");

  const tables = await prisma.$queryRawUnsafe(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema='public'
        AND table_name IN ('recruitment_job_requisitions','recruitment_requisition_counters')
      ORDER BY table_name`
  );
  const tableNames = new Set(tables.map((row) => row.table_name));
  for (const expected of ["recruitment_job_requisitions", "recruitment_requisition_counters"]) {
    if (!tableNames.has(expected)) {
      throw new Error(`Recruitment migration is not deployed: missing ${expected}.`);
    }
  }

  const [summary] = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS "total",
            COUNT(*) FILTER (WHERE "status"='DRAFT')::int AS "draft",
            COUNT(*) FILTER (WHERE "status"='PENDING_APPROVAL')::int AS "pendingApproval",
            COUNT(*) FILTER (WHERE "status"='RETURNED')::int AS "returned",
            COUNT(*) FILTER (WHERE "status"='OPEN')::int AS "open",
            COUNT(*) FILTER (WHERE "status"='REJECTED')::int AS "rejected",
            COUNT(*) FILTER (WHERE "status"='CLOSED')::int AS "closed",
            COUNT(*) FILTER (WHERE "status"='CANCELLED')::int AS "cancelled",
            COALESCE(SUM("requestedHeadcount") FILTER (WHERE "status"='OPEN'),0)::int AS "openHeadcount"
       FROM "recruitment_job_requisitions"
      WHERE "organizationId"=$1`,
    organization.id
  );

  const duplicates = await prisma.$queryRawUnsafe(
    `SELECT "requisitionNumber", COUNT(*)::int AS count
       FROM "recruitment_job_requisitions"
      WHERE "organizationId"=$1
      GROUP BY "requisitionNumber"
     HAVING COUNT(*) > 1`,
    organization.id
  );
  if (duplicates.length) throw new Error("Duplicate requisition numbers detected.");

  const invalidReferences = await prisma.$queryRawUnsafe(
    `SELECT r."id",r."requisitionNumber"
       FROM "recruitment_job_requisitions" r
       LEFT JOIN "organization_locations" l
         ON l."organizationId"=r."organizationId" AND l."id"=r."locationId"
       LEFT JOIN "designations" d
         ON d."organizationId"=r."organizationId" AND d."id"=r."designationId"
      WHERE r."organizationId"=$1
        AND (l."id" IS NULL OR d."id" IS NULL)`,
    organization.id
  );
  if (invalidReferences.length) throw new Error("Tenant-safe requisition references failed verification.");

  const branches = await prisma.organizationLocation.findMany({
    where: { organizationId: organization.id, type: "BRANCH", isActive: true },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });
  const branchCounts = await Promise.all(
    branches.map(async (branch) => {
      const [row] = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*)::int AS "requisitions",
                COALESCE(SUM("requestedHeadcount") FILTER (WHERE "status"='OPEN'),0)::int AS "openHeadcount"
           FROM "recruitment_job_requisitions"
          WHERE "organizationId"=$1 AND "locationId"=$2`,
        organization.id,
        branch.id
      );
      return {
        code: branch.code,
        name: branch.name,
        requisitions: Number(row?.requisitions || 0),
        openHeadcount: Number(row?.openHeadcount || 0),
      };
    })
  );

  console.log(JSON.stringify({
    mode: "READ_ONLY_RECRUITMENT_RELEASE1_VERIFY",
    organization: organization.name,
    tables: Array.from(tableNames),
    summary: Object.fromEntries(
      Object.entries(summary || {}).map(([key, value]) => [key, Number(value || 0)])
    ),
    branchCounts,
    duplicateRequisitionNumbers: 0,
    invalidTenantReferences: 0,
    databaseWrites: 0,
  }, null, 2));
  console.log("PASS: Recruitment Release-1 database foundation verified read-only.");
}

main()
  .catch((error) => {
    console.error("FAIL: Recruitment Release-1 verifier:", error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
