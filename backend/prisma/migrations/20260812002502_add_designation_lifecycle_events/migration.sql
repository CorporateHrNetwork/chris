-- CreateEnum
CREATE TYPE "DesignationLifecycleEventType" AS ENUM ('ACTIVATED', 'DEACTIVATED');

-- CreateTable
CREATE TABLE "designation_lifecycle_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "designationId" TEXT NOT NULL,
    "eventType" "DesignationLifecycleEventType" NOT NULL,
    "previousIsActive" BOOLEAN NOT NULL,
    "newIsActive" BOOLEAN NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "performedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "designation_lifecycle_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "designation_lifecycle_events_organizationId_idx" ON "designation_lifecycle_events"("organizationId");

-- CreateIndex
CREATE INDEX "designation_lifecycle_events_designationId_idx" ON "designation_lifecycle_events"("designationId");

-- CreateIndex
CREATE INDEX "designation_lifecycle_events_eventType_idx" ON "designation_lifecycle_events"("eventType");

-- CreateIndex
CREATE INDEX "designation_lifecycle_events_effectiveDate_idx" ON "designation_lifecycle_events"("effectiveDate");

-- CreateIndex
CREATE INDEX "designation_lifecycle_events_performedByUserId_idx" ON "designation_lifecycle_events"("performedByUserId");

-- AddForeignKey
ALTER TABLE "designation_lifecycle_events" ADD CONSTRAINT "designation_lifecycle_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "designation_lifecycle_events" ADD CONSTRAINT "designation_lifecycle_events_organizationId_designationId_fkey" FOREIGN KEY ("organizationId", "designationId") REFERENCES "designations"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "designation_lifecycle_events" ADD CONSTRAINT "designation_lifecycle_events_performedByUserId_fkey" FOREIGN KEY ("performedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
