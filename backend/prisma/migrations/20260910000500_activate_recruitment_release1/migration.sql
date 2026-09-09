-- CHRiS Recruitment Release-1 foundation
-- Activates controlled, tenant-safe job requisitions without changing accepted employee/payroll/leave structures.

CREATE TABLE "recruitment_requisition_counters" (
  "organizationId" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "nextValue" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "recruitment_requisition_counters_pkey" PRIMARY KEY ("organizationId", "year"),
  CONSTRAINT "recruitment_requisition_counters_next_check" CHECK ("nextValue" > 0),
  CONSTRAINT "recruitment_requisition_counters_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "recruitment_job_requisitions" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "requisitionNumber" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "departmentId" TEXT,
  "designationId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "employmentType" TEXT NOT NULL,
  "requestedHeadcount" INTEGER NOT NULL DEFAULT 1,
  "reason" TEXT NOT NULL,
  "targetStartDate" DATE,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "createdByUserId" TEXT,
  "submittedByUserId" TEXT,
  "submittedAt" TIMESTAMP(3),
  "decidedByUserId" TEXT,
  "decidedAt" TIMESTAMP(3),
  "decisionNotes" TEXT,
  "closedByUserId" TEXT,
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "recruitment_job_requisitions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "recruitment_job_requisitions_headcount_check" CHECK ("requestedHeadcount" > 0),
  CONSTRAINT "recruitment_job_requisitions_status_check" CHECK (
    "status" IN ('DRAFT','PENDING_APPROVAL','RETURNED','OPEN','REJECTED','CLOSED','CANCELLED')
  ),
  CONSTRAINT "recruitment_job_requisitions_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "recruitment_job_requisitions_location_tenant_fkey"
    FOREIGN KEY ("organizationId", "locationId") REFERENCES "organization_locations"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "recruitment_job_requisitions_department_tenant_fkey"
    FOREIGN KEY ("organizationId", "departmentId") REFERENCES "departments"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "recruitment_job_requisitions_designation_tenant_fkey"
    FOREIGN KEY ("organizationId", "designationId") REFERENCES "designations"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "recruitment_job_requisitions_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "recruitment_job_requisitions_submittedByUserId_fkey"
    FOREIGN KEY ("submittedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "recruitment_job_requisitions_decidedByUserId_fkey"
    FOREIGN KEY ("decidedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "recruitment_job_requisitions_closedByUserId_fkey"
    FOREIGN KEY ("closedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "recruitment_job_requisitions_org_number_key"
  ON "recruitment_job_requisitions"("organizationId", "requisitionNumber");
CREATE INDEX "recruitment_job_requisitions_org_status_idx"
  ON "recruitment_job_requisitions"("organizationId", "status");
CREATE INDEX "recruitment_job_requisitions_org_location_status_idx"
  ON "recruitment_job_requisitions"("organizationId", "locationId", "status");
CREATE INDEX "recruitment_job_requisitions_org_designation_idx"
  ON "recruitment_job_requisitions"("organizationId", "designationId");
CREATE INDEX "recruitment_job_requisitions_created_idx"
  ON "recruitment_job_requisitions"("createdAt");
