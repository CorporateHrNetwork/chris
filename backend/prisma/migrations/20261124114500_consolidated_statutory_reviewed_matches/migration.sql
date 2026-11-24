-- Per-source historical employee and branch matches require explicit HR review.
-- Do not modify source payload or approved payroll.
CREATE UNIQUE INDEX IF NOT EXISTS "statutory_one_verified_batch_per_year"
  ON "consolidated_statutory_import_batches" ("organizationId","reportYear") WHERE "status"='VERIFIED';
CREATE TABLE IF NOT EXISTS "consolidated_statutory_import_matches" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "reviewNote" TEXT NOT NULL,
  "reviewedByUserId" TEXT NOT NULL,
  "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "statutory_match_batch_fk" FOREIGN KEY ("organizationId","batchId")
    REFERENCES "consolidated_statutory_import_batches"("organizationId","id") ON DELETE CASCADE,
  CONSTRAINT "statutory_match_employee_fk" FOREIGN KEY ("organizationId","employeeId")
    REFERENCES "employees"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "statutory_match_location_fk" FOREIGN KEY ("organizationId","locationId")
    REFERENCES "organization_locations"("organizationId","id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS "statutory_match_source_unique"
  ON "consolidated_statutory_import_matches" ("organizationId","batchId","sourceId");
CREATE INDEX IF NOT EXISTS "statutory_match_employee_idx"
  ON "consolidated_statutory_import_matches" ("organizationId","employeeId");
