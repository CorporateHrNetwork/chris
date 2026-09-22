-- CHRiS Recruitment Vacancies Release-1
-- Creates tenant-safe vacancy records linked to approved/open job requisitions.

CREATE TABLE "recruitment_vacancy_counters" (
  "organizationId" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "nextValue" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "recruitment_vacancy_counters_pkey" PRIMARY KEY ("organizationId", "year"),
  CONSTRAINT "recruitment_vacancy_counters_next_check" CHECK ("nextValue" > 0),
  CONSTRAINT "recruitment_vacancy_counters_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "recruitment_vacancies" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "vacancyNumber" TEXT NOT NULL,
  "requisitionId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "departmentId" TEXT,
  "designationId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "employmentType" TEXT NOT NULL,
  "openings" INTEGER NOT NULL DEFAULT 1,
  "summary" TEXT NOT NULL,
  "responsibilities" TEXT,
  "requirements" TEXT NOT NULL,
  "openingDate" DATE,
  "closingDate" DATE,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "createdByUserId" TEXT,
  "publishedByUserId" TEXT,
  "publishedAt" TIMESTAMP(3),
  "closedByUserId" TEXT,
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "recruitment_vacancies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "recruitment_vacancies_openings_check" CHECK ("openings" > 0),
  CONSTRAINT "recruitment_vacancies_dates_check" CHECK (
    "closingDate" IS NULL OR "openingDate" IS NULL OR "closingDate" >= "openingDate"
  ),
  CONSTRAINT "recruitment_vacancies_status_check" CHECK (
    "status" IN ('DRAFT','PUBLISHED','CLOSED','CANCELLED')
  ),
  CONSTRAINT "recruitment_vacancies_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "recruitment_vacancies_requisition_fkey"
    FOREIGN KEY ("requisitionId") REFERENCES "recruitment_job_requisitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "recruitment_vacancies_location_tenant_fkey"
    FOREIGN KEY ("organizationId", "locationId") REFERENCES "organization_locations"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "recruitment_vacancies_department_tenant_fkey"
    FOREIGN KEY ("organizationId", "departmentId") REFERENCES "departments"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "recruitment_vacancies_designation_tenant_fkey"
    FOREIGN KEY ("organizationId", "designationId") REFERENCES "designations"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "recruitment_vacancies_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "recruitment_vacancies_publishedByUserId_fkey"
    FOREIGN KEY ("publishedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "recruitment_vacancies_closedByUserId_fkey"
    FOREIGN KEY ("closedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "recruitment_vacancies_org_number_key"
  ON "recruitment_vacancies"("organizationId", "vacancyNumber");
CREATE UNIQUE INDEX "recruitment_vacancies_org_requisition_key"
  ON "recruitment_vacancies"("organizationId", "requisitionId");
CREATE INDEX "recruitment_vacancies_org_status_idx"
  ON "recruitment_vacancies"("organizationId", "status");
CREATE INDEX "recruitment_vacancies_org_location_status_idx"
  ON "recruitment_vacancies"("organizationId", "locationId", "status");
CREATE INDEX "recruitment_vacancies_closing_date_idx"
  ON "recruitment_vacancies"("closingDate");
