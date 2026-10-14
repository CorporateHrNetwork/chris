CREATE TABLE IF NOT EXISTS "payroll_approval_assignments" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "responsibility" TEXT NOT NULL,
  "assignedUserId" TEXT NOT NULL,
  "assignedByUserId" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_approval_assignments_org_fk" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "payroll_approval_assignments_user_fk" FOREIGN KEY ("assignedUserId") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "payroll_approval_assignments_assigner_fk" FOREIGN KEY ("assignedByUserId") REFERENCES "users"("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "payroll_approval_assignments_active_key"
ON "payroll_approval_assignments"("organizationId","responsibility")
WHERE "isActive"=true;
CREATE INDEX IF NOT EXISTS "payroll_approval_assignments_user_idx"
ON "payroll_approval_assignments"("organizationId","assignedUserId","isActive");