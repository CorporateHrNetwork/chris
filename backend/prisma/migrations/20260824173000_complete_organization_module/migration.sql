ALTER TABLE "organizations"
  ADD COLUMN "code" TEXT,
  ADD COLUMN "registrationNumber" TEXT,
  ADD COLUMN "taxNumber" TEXT,
  ADD COLUMN "industry" TEXT,
  ADD COLUMN "organizationType" TEXT,
  ADD COLUMN "website" TEXT,
  ADD COLUMN "logoUrl" TEXT;

CREATE TYPE "CostCentreStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TABLE "organization_audits" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "previousValue" JSONB,
  "newValue" JSONB,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organization_audits_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cost_centres" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" "CostCentreStatus" NOT NULL DEFAULT 'ACTIVE',
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cost_centres_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "departments" ADD COLUMN "costCentreId" TEXT;
ALTER TABLE "employees" ADD COLUMN "costCentreId" TEXT;

CREATE UNIQUE INDEX "cost_centres_organizationId_code_key" ON "cost_centres"("organizationId", "code");
CREATE UNIQUE INDEX "cost_centres_organizationId_id_key" ON "cost_centres"("organizationId", "id");
CREATE INDEX "cost_centres_organizationId_status_idx" ON "cost_centres"("organizationId", "status");
CREATE INDEX "cost_centres_effectiveFrom_idx" ON "cost_centres"("effectiveFrom");
CREATE INDEX "cost_centres_effectiveTo_idx" ON "cost_centres"("effectiveTo");
CREATE INDEX "organization_audits_organizationId_entityType_entityId_idx" ON "organization_audits"("organizationId", "entityType", "entityId");
CREATE INDEX "organization_audits_actorUserId_idx" ON "organization_audits"("actorUserId");
CREATE INDEX "organization_audits_createdAt_idx" ON "organization_audits"("createdAt");
CREATE INDEX "departments_costCentreId_idx" ON "departments"("costCentreId");
CREATE INDEX "employees_costCentreId_idx" ON "employees"("costCentreId");

ALTER TABLE "organization_audits" ADD CONSTRAINT "organization_audits_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_audits" ADD CONSTRAINT "organization_audits_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cost_centres" ADD CONSTRAINT "cost_centres_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "departments" ADD CONSTRAINT "departments_organizationId_costCentreId_fkey" FOREIGN KEY ("organizationId", "costCentreId") REFERENCES "cost_centres"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employees" ADD CONSTRAINT "employees_organizationId_costCentreId_fkey" FOREIGN KEY ("organizationId", "costCentreId") REFERENCES "cost_centres"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
