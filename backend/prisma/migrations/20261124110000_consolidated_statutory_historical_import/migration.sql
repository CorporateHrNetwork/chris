-- Draft-only historical statutory import storage (no automatic posting to payroll or remittance ledgers).
-- Deliberately isolated by organization ID and source hash.
CREATE TABLE IF NOT EXISTS "consolidated_statutory_import_batches" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "reportYear" INTEGER NOT NULL,
  "sourceHash" TEXT NOT NULL,
  "originalFilename" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING_RECONCILIATION',
  "payload" JSONB NOT NULL,
  "diagnostics" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "consolidated_statutory_import_batches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "consolidated_statutory_import_year_check" CHECK ("reportYear" BETWEEN 2000 AND 2100),
  CONSTRAINT "consolidated_statutory_import_status_check" CHECK ("status" IN ('PENDING_RECONCILIATION','VERIFIED','REJECTED')),
  CONSTRAINT "consolidated_statutory_import_org_fk" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "consolidated_statutory_import_org_id_key"
  ON "consolidated_statutory_import_batches" ("organizationId","id");
CREATE UNIQUE INDEX IF NOT EXISTS "consolidated_statutory_import_org_hash_year_key"
  ON "consolidated_statutory_import_batches" ("organizationId", "sourceHash", "reportYear");
CREATE INDEX IF NOT EXISTS "consolidated_statutory_import_org_year_status_idx"
  ON "consolidated_statutory_import_batches" ("organizationId", "reportYear", "status");
