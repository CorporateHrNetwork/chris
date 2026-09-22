CREATE TABLE "employee_export_jobs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "format" TEXT NOT NULL DEFAULT 'XLSX',
    "filters" JSONB NOT NULL DEFAULT '{}',
    "columns" JSONB NOT NULL DEFAULT '[]',
    "rowCount" INTEGER,
    "fileName" TEXT,
    "storagePath" TEXT,
    "errorMessage" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_export_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "employee_self_onboarding_invites" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "employeeId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "designationId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "employmentStatus" "EmployeeStatus" NOT NULL DEFAULT 'PROBATION',
    "hireDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "openedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "submittedData" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_self_onboarding_invites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "employee_self_onboarding_invites_tokenHash_key"
ON "employee_self_onboarding_invites"("tokenHash");

CREATE INDEX "employee_export_jobs_organizationId_createdAt_idx"
ON "employee_export_jobs"("organizationId", "createdAt");

CREATE INDEX "employee_export_jobs_organizationId_status_idx"
ON "employee_export_jobs"("organizationId", "status");

CREATE INDEX "employee_export_jobs_requestedByUserId_idx"
ON "employee_export_jobs"("requestedByUserId");

CREATE INDEX "employee_self_onboarding_invites_organizationId_createdAt_idx"
ON "employee_self_onboarding_invites"("organizationId", "createdAt");

CREATE INDEX "employee_self_onboarding_invites_organizationId_status_idx"
ON "employee_self_onboarding_invites"("organizationId", "status");

CREATE INDEX "employee_self_onboarding_invites_recipientEmail_idx"
ON "employee_self_onboarding_invites"("recipientEmail");

CREATE INDEX "employee_self_onboarding_invites_expiresAt_idx"
ON "employee_self_onboarding_invites"("expiresAt");

ALTER TABLE "employee_export_jobs"
ADD CONSTRAINT "employee_export_jobs_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "employee_export_jobs"
ADD CONSTRAINT "employee_export_jobs_requestedByUserId_fkey"
FOREIGN KEY ("requestedByUserId") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "employee_self_onboarding_invites"
ADD CONSTRAINT "employee_self_onboarding_invites_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "employee_self_onboarding_invites"
ADD CONSTRAINT "employee_self_onboarding_invites_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
