-- Additive, application-only tables. No existing employee is changed by migration.
CREATE TABLE "zermatt_probation_reviews" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "employeeId" TEXT NOT NULL,
  "episodeId" TEXT NOT NULL,
  "cycle" INTEGER NOT NULL DEFAULT 1 CHECK ("cycle" > 0),
  "startDate" DATE NOT NULL,
  "endDate" DATE NOT NULL,
  "noticeDate" DATE NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'AWAITING_ASSESSMENT' CHECK ("status" IN ('AWAITING_ASSESSMENT','SUBMITTED','RETURNED','DECIDED')),
  "assessment" JSONB,
  "decision" JSONB,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("organizationId","employeeId") REFERENCES "employees"("organizationId","id") ON DELETE RESTRICT,
  FOREIGN KEY ("episodeId") REFERENCES "employee_employment_episodes"("id") ON DELETE RESTRICT,
  UNIQUE ("organizationId","episodeId","cycle"),
  CHECK ("endDate" >= "startDate"),
  CHECK ("noticeDate" = "endDate" - 7)
);
CREATE INDEX ON "zermatt_probation_reviews" ("organizationId","status","noticeDate");
CREATE TABLE "zermatt_probation_notices" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "reviewId" TEXT NOT NULL REFERENCES "zermatt_probation_reviews"("id") ON DELETE RESTRICT,
  "recipientUserId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "eventKey" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readAt" TIMESTAMPTZ,
  UNIQUE ("reviewId","recipientUserId","eventKey")
);
CREATE INDEX ON "zermatt_probation_notices" ("organizationId","recipientUserId","readAt");
-- No Supabase Data API access: Express uses the existing authenticated DB connection.
ALTER TABLE "zermatt_probation_reviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "zermatt_probation_notices" ENABLE ROW LEVEL SECURITY;
