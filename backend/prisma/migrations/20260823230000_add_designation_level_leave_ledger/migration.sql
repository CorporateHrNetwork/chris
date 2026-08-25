-- Tenant employment-level metadata around the existing authoritative
-- Designation.careerLevel value. No employee-level value is duplicated.
CREATE TABLE "organization_employment_levels" (
    "organizationId" TEXT NOT NULL,
    "levelNumber" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "organization_employment_levels_pkey" PRIMARY KEY ("organizationId", "levelNumber")
);

CREATE UNIQUE INDEX "organization_employment_levels_organizationId_code_key"
ON "organization_employment_levels"("organizationId", "code");
CREATE INDEX "organization_employment_levels_organizationId_isActive_idx"
ON "organization_employment_levels"("organizationId", "isActive");

-- Seed only missing numeric levels. Existing Designation.careerLevel values
-- are preserved, including tenant levels above the CHRIS Level 1-6 baseline.
INSERT INTO "organization_employment_levels"
    ("organizationId", "levelNumber", "name", "code", "displayOrder", "isActive")
SELECT o."id", levels."levelNumber", 'Level ' || levels."levelNumber", 'LEVEL_' || levels."levelNumber", levels."levelNumber", true
FROM "organizations" o
CROSS JOIN (VALUES (1), (2), (3), (4), (5), (6)) AS levels("levelNumber")
ON CONFLICT ("organizationId", "levelNumber") DO NOTHING;

INSERT INTO "organization_employment_levels"
    ("organizationId", "levelNumber", "name", "code", "displayOrder", "isActive")
SELECT DISTINCT d."organizationId", d."careerLevel", 'Level ' || d."careerLevel", 'LEVEL_' || d."careerLevel", d."careerLevel", true
FROM "designations" d
WHERE d."careerLevel" IS NOT NULL
ON CONFLICT ("organizationId", "levelNumber") DO NOTHING;

ALTER TABLE "organization_employment_levels"
ADD CONSTRAINT "organization_employment_levels_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "designations"
ADD CONSTRAINT "designations_organizationId_careerLevel_fkey"
FOREIGN KEY ("organizationId", "careerLevel")
REFERENCES "organization_employment_levels"("organizationId", "levelNumber")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TYPE "NewHireEntitlementTreatment" AS ENUM ('FULL', 'PRORATED', 'MANUAL');
CREATE TYPE "LeaveEntitlementAllocationMethod" AS ENUM ('LEVEL_DEFAULT', 'POLICY_DEFAULT', 'PRORATED', 'MANUAL_OVERRIDE', 'BASELINE_REPROVISION', 'AUTOMATIC_NEW_HIRE');

-- Required by tenant-safe policy foreign keys below. Prisma already treats
-- policy ids as globally unique, while this additionally enforces tenant+id.
CREATE UNIQUE INDEX "leave_policies_organizationId_id_key"
ON "leave_policies"("organizationId", "id");

CREATE TABLE "leave_entitlement_matrix_rules" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "levelNumber" INTEGER NOT NULL,
    "leavePolicyId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "defaultEntitlement" DECIMAL(8,2) NOT NULL,
    "unit" TEXT NOT NULL,
    "newHireTreatment" "NewHireEntitlementTreatment" NOT NULL DEFAULT 'FULL',
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "leave_entitlement_matrix_rules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "leave_entitlement_matrix_rules_organizationId_levelNumber_leavePolicyId_effectiveFrom_key"
ON "leave_entitlement_matrix_rules"("organizationId", "levelNumber", "leavePolicyId", "effectiveFrom");
CREATE INDEX "leave_entitlement_matrix_rules_organizationId_levelNumber_isActive_idx"
ON "leave_entitlement_matrix_rules"("organizationId", "levelNumber", "isActive");
CREATE INDEX "leave_entitlement_matrix_rules_leavePolicyId_idx" ON "leave_entitlement_matrix_rules"("leavePolicyId");
CREATE INDEX "leave_entitlement_matrix_rules_leaveTypeId_idx" ON "leave_entitlement_matrix_rules"("leaveTypeId");

CREATE TABLE "leave_entitlement_allocations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveBalanceId" TEXT NOT NULL,
    "leavePolicyId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "levelNumber" INTEGER NOT NULL,
    "leaveYear" INTEGER NOT NULL,
    "baseEntitlement" DECIMAL(8,2) NOT NULL,
    "allocatedEntitlement" DECIMAL(8,2) NOT NULL,
    "method" "LeaveEntitlementAllocationMethod" NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "leave_entitlement_allocations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "leave_entitlement_allocations_organizationId_employeeId_leaveYear_idx"
ON "leave_entitlement_allocations"("organizationId", "employeeId", "leaveYear");
CREATE INDEX "leave_entitlement_allocations_leaveBalanceId_createdAt_idx"
ON "leave_entitlement_allocations"("leaveBalanceId", "createdAt");
CREATE INDEX "leave_entitlement_allocations_leavePolicyId_idx" ON "leave_entitlement_allocations"("leavePolicyId");
CREATE INDEX "leave_entitlement_allocations_leaveTypeId_idx" ON "leave_entitlement_allocations"("leaveTypeId");
CREATE INDEX "leave_entitlement_allocations_createdByUserId_idx" ON "leave_entitlement_allocations"("createdByUserId");

ALTER TABLE "leave_entitlement_matrix_rules"
ADD CONSTRAINT "leave_entitlement_matrix_rules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leave_entitlement_matrix_rules"
ADD CONSTRAINT "leave_entitlement_matrix_rules_organizationId_levelNumber_fkey" FOREIGN KEY ("organizationId", "levelNumber") REFERENCES "organization_employment_levels"("organizationId", "levelNumber") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "leave_entitlement_matrix_rules"
ADD CONSTRAINT "leave_entitlement_matrix_rules_organizationId_leavePolicyId_fkey" FOREIGN KEY ("organizationId", "leavePolicyId") REFERENCES "leave_policies"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "leave_entitlement_matrix_rules"
ADD CONSTRAINT "leave_entitlement_matrix_rules_organizationId_leaveTypeId_fkey" FOREIGN KEY ("organizationId", "leaveTypeId") REFERENCES "leave_types"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "leave_entitlement_matrix_rules"
ADD CONSTRAINT "leave_entitlement_matrix_rules_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "leave_entitlement_allocations"
ADD CONSTRAINT "leave_entitlement_allocations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leave_entitlement_allocations"
ADD CONSTRAINT "leave_entitlement_allocations_organizationId_employeeId_fkey" FOREIGN KEY ("organizationId", "employeeId") REFERENCES "employees"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "leave_entitlement_allocations"
ADD CONSTRAINT "leave_entitlement_allocations_leaveBalanceId_fkey" FOREIGN KEY ("leaveBalanceId") REFERENCES "leave_balances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "leave_entitlement_allocations"
ADD CONSTRAINT "leave_entitlement_allocations_organizationId_leavePolicyId_fkey" FOREIGN KEY ("organizationId", "leavePolicyId") REFERENCES "leave_policies"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "leave_entitlement_allocations"
ADD CONSTRAINT "leave_entitlement_allocations_organizationId_leaveTypeId_fkey" FOREIGN KEY ("organizationId", "leaveTypeId") REFERENCES "leave_types"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "leave_entitlement_allocations"
ADD CONSTRAINT "leave_entitlement_allocations_organizationId_levelNumber_fkey" FOREIGN KEY ("organizationId", "levelNumber") REFERENCES "organization_employment_levels"("organizationId", "levelNumber") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "leave_entitlement_allocations"
ADD CONSTRAINT "leave_entitlement_allocations_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
