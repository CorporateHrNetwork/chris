-- AlterTable
ALTER TABLE "employee_lifecycle_events" ADD COLUMN     "suspensionEndDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "suspensionEndDate" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "employee_lifecycle_events_suspensionEndDate_idx" ON "employee_lifecycle_events"("suspensionEndDate");
