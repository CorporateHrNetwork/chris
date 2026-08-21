CREATE TABLE "employee_line_manager_assignments" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "managerEmployeeId" TEXT NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "reason" TEXT,
  "notes" TEXT,
  "performedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "employee_line_manager_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "employee_line_manager_assignments_not_self_check"
    CHECK ("employeeId" <> "managerEmployeeId"),
  CONSTRAINT "employee_line_manager_assignments_dates_check"
    CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom")
);

CREATE INDEX "employee_line_manager_assignments_organizationId_idx"
  ON "employee_line_manager_assignments"("organizationId");
CREATE INDEX "employee_line_manager_assignments_organizationId_employeeId_idx"
  ON "employee_line_manager_assignments"("organizationId", "employeeId");
CREATE INDEX "employee_line_manager_assignments_organizationId_managerEmployeeId_idx"
  ON "employee_line_manager_assignments"("organizationId", "managerEmployeeId");
CREATE INDEX "employee_line_manager_assignments_employeeId_effectiveFrom_idx"
  ON "employee_line_manager_assignments"("employeeId", "effectiveFrom");
CREATE INDEX "employee_line_manager_assignments_managerEmployeeId_effectiveTo_idx"
  ON "employee_line_manager_assignments"("managerEmployeeId", "effectiveTo");
CREATE INDEX "employee_line_manager_assignments_performedByUserId_idx"
  ON "employee_line_manager_assignments"("performedByUserId");

CREATE UNIQUE INDEX "employee_line_manager_assignments_one_current_per_employee"
  ON "employee_line_manager_assignments"("organizationId", "employeeId")
  WHERE "effectiveTo" IS NULL;

ALTER TABLE "employee_line_manager_assignments"
  ADD CONSTRAINT "employee_line_manager_assignments_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employee_line_manager_assignments"
  ADD CONSTRAINT "employee_line_manager_assignments_employee_fkey"
  FOREIGN KEY ("organizationId", "employeeId") REFERENCES "employees"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employee_line_manager_assignments"
  ADD CONSTRAINT "employee_line_manager_assignments_manager_fkey"
  FOREIGN KEY ("organizationId", "managerEmployeeId") REFERENCES "employees"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employee_line_manager_assignments"
  ADD CONSTRAINT "employee_line_manager_assignments_performedByUserId_fkey"
  FOREIGN KEY ("performedByUserId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
