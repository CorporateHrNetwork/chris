-- CHRiS Recruitment Release-2 — Candidates, ATS, Interviews, Offers and Talent Pool
-- Tenant-safe foundation layered on approved requisitions and published vacancies.

CREATE TABLE "recruitment_candidate_counters" (
  "organizationId" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "nextValue" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "recruitment_candidate_counters_pkey" PRIMARY KEY ("organizationId", "year"),
  CONSTRAINT "recruitment_candidate_counters_next_check" CHECK ("nextValue" > 0),
  CONSTRAINT "recruitment_candidate_counters_org_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "recruitment_candidates" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "candidateNumber" TEXT NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "alternatePhone" TEXT,
  "source" TEXT NOT NULL DEFAULT 'DIRECT',
  "city" TEXT,
  "state" TEXT,
  "country" TEXT NOT NULL DEFAULT 'Nigeria',
  "cvFileName" TEXT,
  "cvReference" TEXT,
  "privacyConsent" BOOLEAN NOT NULL DEFAULT FALSE,
  "privacyConsentAt" TIMESTAMP(3),
  "talentPoolStatus" TEXT NOT NULL DEFAULT 'NONE',
  "talentPoolNotes" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "recruitment_candidates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "recruitment_candidates_talent_pool_status_check" CHECK (
    "talentPoolStatus" IN ('NONE','AVAILABLE','ARCHIVED')
  ),
  CONSTRAINT "recruitment_candidates_consent_check" CHECK (
    ("privacyConsent" = FALSE AND "privacyConsentAt" IS NULL) OR "privacyConsent" = TRUE
  ),
  CONSTRAINT "recruitment_candidates_org_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "recruitment_candidates_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "recruitment_candidates_org_number_key"
  ON "recruitment_candidates"("organizationId", "candidateNumber");
CREATE UNIQUE INDEX "recruitment_candidates_org_email_key"
  ON "recruitment_candidates"("organizationId", LOWER("email"));
CREATE UNIQUE INDEX "recruitment_candidates_org_id_key"
  ON "recruitment_candidates"("organizationId", "id");
CREATE INDEX "recruitment_candidates_org_pool_idx"
  ON "recruitment_candidates"("organizationId", "talentPoolStatus");
CREATE INDEX "recruitment_candidates_org_name_idx"
  ON "recruitment_candidates"("organizationId", "lastName", "firstName");

-- Needed for database-level tenant-safe application -> vacancy relation.
CREATE UNIQUE INDEX IF NOT EXISTS "recruitment_vacancies_org_id_key"
  ON "recruitment_vacancies"("organizationId", "id");

CREATE TABLE "recruitment_application_counters" (
  "organizationId" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "nextValue" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "recruitment_application_counters_pkey" PRIMARY KEY ("organizationId", "year"),
  CONSTRAINT "recruitment_application_counters_next_check" CHECK ("nextValue" > 0),
  CONSTRAINT "recruitment_application_counters_org_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "recruitment_applications" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "applicationNumber" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "vacancyId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "stage" TEXT NOT NULL DEFAULT 'APPLIED',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "coverNote" TEXT,
  "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  "closedReason" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "recruitment_applications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "recruitment_applications_stage_check" CHECK (
    "stage" IN ('APPLIED','SCREENING','SHORTLISTED','INTERVIEW','OFFER','HIRED','REJECTED','WITHDRAWN','TALENT_POOL')
  ),
  CONSTRAINT "recruitment_applications_status_check" CHECK (
    "status" IN ('ACTIVE','CLOSED')
  ),
  CONSTRAINT "recruitment_applications_org_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "recruitment_applications_candidate_tenant_fkey"
    FOREIGN KEY ("organizationId", "candidateId") REFERENCES "recruitment_candidates"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "recruitment_applications_vacancy_tenant_fkey"
    FOREIGN KEY ("organizationId", "vacancyId") REFERENCES "recruitment_vacancies"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "recruitment_applications_location_tenant_fkey"
    FOREIGN KEY ("organizationId", "locationId") REFERENCES "organization_locations"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "recruitment_applications_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "recruitment_applications_org_number_key"
  ON "recruitment_applications"("organizationId", "applicationNumber");
CREATE UNIQUE INDEX "recruitment_applications_org_candidate_vacancy_key"
  ON "recruitment_applications"("organizationId", "candidateId", "vacancyId");
CREATE UNIQUE INDEX "recruitment_applications_org_id_key"
  ON "recruitment_applications"("organizationId", "id");
CREATE INDEX "recruitment_applications_org_location_stage_idx"
  ON "recruitment_applications"("organizationId", "locationId", "stage");
CREATE INDEX "recruitment_applications_org_candidate_idx"
  ON "recruitment_applications"("organizationId", "candidateId");
CREATE INDEX "recruitment_applications_org_vacancy_idx"
  ON "recruitment_applications"("organizationId", "vacancyId");

CREATE TABLE "recruitment_application_stage_history" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "fromStage" TEXT,
  "toStage" TEXT NOT NULL,
  "reason" TEXT,
  "actorUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "recruitment_application_stage_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "recruitment_stage_history_org_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "recruitment_stage_history_application_tenant_fkey"
    FOREIGN KEY ("organizationId", "applicationId") REFERENCES "recruitment_applications"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "recruitment_stage_history_actor_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "recruitment_stage_history_application_idx"
  ON "recruitment_application_stage_history"("organizationId", "applicationId", "createdAt");

CREATE TABLE "recruitment_interviews" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "roundNumber" INTEGER NOT NULL DEFAULT 1,
  "title" TEXT NOT NULL,
  "scheduledAt" TIMESTAMPTZ NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'IN_PERSON',
  "venueOrLink" TEXT,
  "panel" TEXT,
  "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
  "overallScore" NUMERIC(5,2),
  "recommendation" TEXT,
  "notes" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "recruitment_interviews_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "recruitment_interviews_round_check" CHECK ("roundNumber" > 0),
  CONSTRAINT "recruitment_interviews_mode_check" CHECK ("mode" IN ('IN_PERSON','VIRTUAL','PHONE')),
  CONSTRAINT "recruitment_interviews_status_check" CHECK ("status" IN ('SCHEDULED','COMPLETED','CANCELLED','NO_SHOW')),
  CONSTRAINT "recruitment_interviews_score_check" CHECK ("overallScore" IS NULL OR ("overallScore" >= 0 AND "overallScore" <= 100)),
  CONSTRAINT "recruitment_interviews_org_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "recruitment_interviews_application_tenant_fkey"
    FOREIGN KEY ("organizationId", "applicationId") REFERENCES "recruitment_applications"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "recruitment_interviews_location_tenant_fkey"
    FOREIGN KEY ("organizationId", "locationId") REFERENCES "organization_locations"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "recruitment_interviews_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "recruitment_interviews_org_application_round_key"
  ON "recruitment_interviews"("organizationId", "applicationId", "roundNumber");
CREATE INDEX "recruitment_interviews_org_location_status_idx"
  ON "recruitment_interviews"("organizationId", "locationId", "status");
CREATE INDEX "recruitment_interviews_scheduled_idx"
  ON "recruitment_interviews"("scheduledAt");

CREATE TABLE "recruitment_offer_counters" (
  "organizationId" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "nextValue" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "recruitment_offer_counters_pkey" PRIMARY KEY ("organizationId", "year"),
  CONSTRAINT "recruitment_offer_counters_next_check" CHECK ("nextValue" > 0),
  CONSTRAINT "recruitment_offer_counters_org_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "recruitment_offers" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "offerNumber" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'NGN',
  "grossMonthly" NUMERIC(14,2) NOT NULL,
  "proposedStartDate" DATE,
  "expiryDate" DATE,
  "notes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "createdByUserId" TEXT,
  "approvedByUserId" TEXT,
  "approvedAt" TIMESTAMP(3),
  "issuedByUserId" TEXT,
  "issuedAt" TIMESTAMP(3),
  "respondedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "recruitment_offers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "recruitment_offers_gross_check" CHECK ("grossMonthly" > 0),
  CONSTRAINT "recruitment_offers_status_check" CHECK (
    "status" IN ('DRAFT','PENDING_APPROVAL','APPROVED','ISSUED','ACCEPTED','DECLINED','WITHDRAWN','EXPIRED')
  ),
  CONSTRAINT "recruitment_offers_date_check" CHECK (
    "expiryDate" IS NULL OR "proposedStartDate" IS NULL OR "expiryDate" <= "proposedStartDate"
  ),
  CONSTRAINT "recruitment_offers_org_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "recruitment_offers_application_tenant_fkey"
    FOREIGN KEY ("organizationId", "applicationId") REFERENCES "recruitment_applications"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "recruitment_offers_location_tenant_fkey"
    FOREIGN KEY ("organizationId", "locationId") REFERENCES "organization_locations"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "recruitment_offers_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "recruitment_offers_approvedByUserId_fkey"
    FOREIGN KEY ("approvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "recruitment_offers_issuedByUserId_fkey"
    FOREIGN KEY ("issuedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "recruitment_offers_org_number_key"
  ON "recruitment_offers"("organizationId", "offerNumber");
CREATE UNIQUE INDEX "recruitment_offers_org_application_key"
  ON "recruitment_offers"("organizationId", "applicationId");
CREATE INDEX "recruitment_offers_org_location_status_idx"
  ON "recruitment_offers"("organizationId", "locationId", "status");
