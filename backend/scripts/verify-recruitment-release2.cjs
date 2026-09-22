require("dotenv").config();
const prisma = require("../src/config/prisma");

const TABLES = [
  "recruitment_candidate_counters",
  "recruitment_candidates",
  "recruitment_application_counters",
  "recruitment_applications",
  "recruitment_application_stage_history",
  "recruitment_interviews",
  "recruitment_offer_counters",
  "recruitment_offers",
];

async function main() {
  const organization = await prisma.organization.findFirst({
    where: { slug: "zermatt-liquor-limited" },
    select: { id: true, name: true, slug: true },
  });
  if (!organization) throw new Error("ZERMATT organization was not found.");

  const tableExpr = TABLES.map((name) => `to_regclass('public.${name}')::text AS "${name}"`).join(",\n            ");
  const tableRows = await prisma.$queryRawUnsafe(`SELECT ${tableExpr}`);
  const tables = tableRows[0] || {};
  const missingTables = TABLES.filter((name) => !tables[name]);
  if (missingTables.length) {
    throw new Error(`Recruitment Release-2 migration has not been deployed. Missing: ${missingTables.join(", ")}`);
  }

  const [candidateRows, applicationRows, interviewRows, offerRows, branches] = await Promise.all([
    prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS "total",
              COUNT(*) FILTER (WHERE "talentPoolStatus"='AVAILABLE')::int AS "talentPool",
              COUNT(*) FILTER (WHERE "privacyConsent"=TRUE)::int AS "consented"
         FROM "recruitment_candidates" WHERE "organizationId"=$1`,
      organization.id
    ),
    prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS "total",
              COUNT(*) FILTER (WHERE "stage"='APPLIED')::int AS "applied",
              COUNT(*) FILTER (WHERE "stage"='SCREENING')::int AS "screening",
              COUNT(*) FILTER (WHERE "stage"='SHORTLISTED')::int AS "shortlisted",
              COUNT(*) FILTER (WHERE "stage"='INTERVIEW')::int AS "interview",
              COUNT(*) FILTER (WHERE "stage"='OFFER')::int AS "offer",
              COUNT(*) FILTER (WHERE "stage"='HIRED')::int AS "hired",
              COUNT(*) FILTER (WHERE "stage"='REJECTED')::int AS "rejected",
              COUNT(*) FILTER (WHERE "stage"='WITHDRAWN')::int AS "withdrawn",
              COUNT(*) FILTER (WHERE "stage"='TALENT_POOL')::int AS "talentPool"
         FROM "recruitment_applications" WHERE "organizationId"=$1`,
      organization.id
    ),
    prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS "total",
              COUNT(*) FILTER (WHERE "status"='SCHEDULED')::int AS "scheduled",
              COUNT(*) FILTER (WHERE "status"='COMPLETED')::int AS "completed"
         FROM "recruitment_interviews" WHERE "organizationId"=$1`,
      organization.id
    ),
    prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS "total",
              COUNT(*) FILTER (WHERE "status"='PENDING_APPROVAL')::int AS "pendingApproval",
              COUNT(*) FILTER (WHERE "status"='ISSUED')::int AS "issued",
              COUNT(*) FILTER (WHERE "status"='ACCEPTED')::int AS "accepted"
         FROM "recruitment_offers" WHERE "organizationId"=$1`,
      organization.id
    ),
    prisma.organizationLocation.findMany({
      where: { organizationId: organization.id, isActive: true, type: "BRANCH" },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
  ]);

  const duplicateCandidateEmails = await prisma.$queryRawUnsafe(
    `SELECT LOWER("email") AS "email", COUNT(*)::int AS "count"
       FROM "recruitment_candidates"
      WHERE "organizationId"=$1
      GROUP BY LOWER("email") HAVING COUNT(*) > 1`,
    organization.id
  );
  const duplicateApplications = await prisma.$queryRawUnsafe(
    `SELECT "candidateId","vacancyId",COUNT(*)::int AS "count"
       FROM "recruitment_applications"
      WHERE "organizationId"=$1
      GROUP BY "candidateId","vacancyId" HAVING COUNT(*) > 1`,
    organization.id
  );
  const invalidReferences = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS "count"
       FROM "recruitment_applications" a
       LEFT JOIN "recruitment_candidates" c
         ON c."organizationId"=a."organizationId" AND c."id"=a."candidateId"
       LEFT JOIN "recruitment_vacancies" v
         ON v."organizationId"=a."organizationId" AND v."id"=a."vacancyId"
       LEFT JOIN "organization_locations" l
         ON l."organizationId"=a."organizationId" AND l."id"=a."locationId"
      WHERE a."organizationId"=$1 AND (c."id" IS NULL OR v."id" IS NULL OR l."id" IS NULL OR v."locationId"<>a."locationId")`,
    organization.id
  );
  const badConsent = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS "count" FROM "recruitment_candidates"
      WHERE "organizationId"=$1 AND ("privacyConsent"=FALSE OR "privacyConsentAt" IS NULL)`,
    organization.id
  );
  const badInterviewRefs = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS "count"
       FROM "recruitment_interviews" i
       LEFT JOIN "recruitment_applications" a
         ON a."organizationId"=i."organizationId" AND a."id"=i."applicationId"
      WHERE i."organizationId"=$1 AND (a."id" IS NULL OR a."locationId"<>i."locationId")`,
    organization.id
  );
  const badOfferRefs = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS "count"
       FROM "recruitment_offers" o
       LEFT JOIN "recruitment_applications" a
         ON a."organizationId"=o."organizationId" AND a."id"=o."applicationId"
      WHERE o."organizationId"=$1 AND (a."id" IS NULL OR a."locationId"<>o."locationId")`,
    organization.id
  );

  const integrity = {
    duplicateCandidateEmails: duplicateCandidateEmails.length,
    duplicateCandidateVacancyApplications: duplicateApplications.length,
    invalidApplicationReferences: Number(invalidReferences[0]?.count || 0),
    candidatesWithoutConsentEvidence: Number(badConsent[0]?.count || 0),
    invalidInterviewReferences: Number(badInterviewRefs[0]?.count || 0),
    invalidOfferReferences: Number(badOfferRefs[0]?.count || 0),
  };
  const failures = Object.entries(integrity).filter(([, value]) => value !== 0);
  if (failures.length) {
    throw new Error(`Recruitment Release-2 integrity failure: ${failures.map(([key, value]) => `${key}=${value}`).join(", ")}`);
  }

  const branchEvidence = [];
  for (const branch of branches) {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT
         (SELECT COUNT(DISTINCT a."candidateId") FROM "recruitment_applications" a WHERE a."organizationId"=$1 AND a."locationId"=$2)::int AS "candidates",
         (SELECT COUNT(*) FROM "recruitment_applications" a WHERE a."organizationId"=$1 AND a."locationId"=$2)::int AS "applications",
         (SELECT COUNT(*) FROM "recruitment_interviews" i WHERE i."organizationId"=$1 AND i."locationId"=$2)::int AS "interviews",
         (SELECT COUNT(*) FROM "recruitment_offers" o WHERE o."organizationId"=$1 AND o."locationId"=$2)::int AS "offers"`,
      organization.id,
      branch.id
    );
    branchEvidence.push({
      code: branch.code,
      name: branch.name,
      candidates: Number(rows[0]?.candidates || 0),
      applications: Number(rows[0]?.applications || 0),
      interviews: Number(rows[0]?.interviews || 0),
      offers: Number(rows[0]?.offers || 0),
    });
  }

  const numberify = (row) => Object.fromEntries(Object.entries(row || {}).map(([key, value]) => [key, Number(value || 0)]));
  console.log("============================================================");
  console.log("RECRUITMENT RELEASE-2 — READ ONLY VERIFY");
  console.log("============================================================");
  console.log(JSON.stringify({
    mode: "READ_ONLY_RECRUITMENT_RELEASE2_VERIFY",
    organization: organization.name,
    tables,
    totals: {
      candidates: numberify(candidateRows[0]),
      applications: numberify(applicationRows[0]),
      interviews: numberify(interviewRows[0]),
      offers: numberify(offerRows[0]),
    },
    branches: branchEvidence,
    integrity,
    databaseWrites: 0,
  }, null, 2));
  console.log("PASS: Recruitment Release-2 database foundation verified read-only.");
}

main()
  .catch((error) => {
    console.error("FAIL:", error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
