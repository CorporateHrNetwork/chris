CREATE TABLE "workforce_snapshots" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "snapshotDate" TIMESTAMP(3) NOT NULL,
  "totalCurrent" INTEGER NOT NULL,
  "activeCount" INTEGER NOT NULL,
  "probationCount" INTEGER NOT NULL,
  "leaveCount" INTEGER NOT NULL,
  "suspendedCount" INTEGER NOT NULL,
  "totalHistorical" INTEGER NOT NULL,
  "exitedCount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "workforce_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workforce_snapshots_organizationId_snapshotDate_key"
  ON "workforce_snapshots"("organizationId", "snapshotDate");
CREATE INDEX "workforce_snapshots_organizationId_snapshotDate_idx"
  ON "workforce_snapshots"("organizationId", "snapshotDate");

ALTER TABLE "workforce_snapshots"
  ADD CONSTRAINT "workforce_snapshots_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
