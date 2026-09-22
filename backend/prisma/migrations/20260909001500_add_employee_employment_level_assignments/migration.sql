CREATE TABLE "employee_employment_level_assignments" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "levelNumber" INTEGER NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "reason" TEXT NOT NULL,
  "notes" TEXT,
  "performedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "employee_employment_level_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "employee_employment_level_assignments_dates_check"
    CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom")
);

CREATE INDEX "employee_employment_level_assignments_organizationId_employeeId_effectiveFrom_idx"
  ON "employee_employment_level_assignments"("organizationId", "employeeId", "effectiveFrom");
CREATE INDEX "employee_employment_level_assignments_organizationId_levelNumber_idx"
  ON "employee_employment_level_assignments"("organizationId", "levelNumber");
CREATE INDEX "employee_employment_level_assignments_employeeId_effectiveTo_idx"
  ON "employee_employment_level_assignments"("employeeId", "effectiveTo");
CREATE INDEX "employee_employment_level_assignments_performedByUserId_idx"
  ON "employee_employment_level_assignments"("performedByUserId");

CREATE UNIQUE INDEX "employee_employment_level_assignments_one_current_per_employee"
  ON "employee_employment_level_assignments"("organizationId", "employeeId")
  WHERE "effectiveTo" IS NULL;

ALTER TABLE "employee_employment_level_assignments"
  ADD CONSTRAINT "employee_employment_level_assignments_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employee_employment_level_assignments"
  ADD CONSTRAINT "employee_employment_level_assignments_employee_fkey"
  FOREIGN KEY ("organizationId", "employeeId") REFERENCES "employees"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employee_employment_level_assignments"
  ADD CONSTRAINT "employee_employment_level_assignments_level_fkey"
  FOREIGN KEY ("organizationId", "levelNumber") REFERENCES "organization_employment_levels"("organizationId", "levelNumber")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employee_employment_level_assignments"
  ADD CONSTRAINT "employee_employment_level_assignments_performedByUserId_fkey"
  FOREIGN KEY ("performedByUserId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
