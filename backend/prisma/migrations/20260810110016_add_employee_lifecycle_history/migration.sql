/*
  Warnings:

  - A unique constraint covering the columns `[organizationId,id]` on the table `employees` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "EmployeeLifecycleEventType" AS ENUM ('JOINED', 'CONFIRMED', 'TRANSFERRED', 'PROMOTED', 'SUSPENDED', 'REACTIVATED', 'DEACTIVATED', 'EXITED', 'REINSTATED', 'REHIRED');

-- CreateTable
CREATE TABLE "employee_lifecycle_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "eventType" "EmployeeLifecycleEventType" NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "previousStatus" "EmployeeStatus",
    "newStatus" "EmployeeStatus",
    "fromLocationId" TEXT,
    "toLocationId" TEXT,
    "reason" TEXT,
    "notes" TEXT,
    "performedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_lifecycle_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_lifecycle_events_organizationId_idx" ON "employee_lifecycle_events"("organizationId");

-- CreateIndex
CREATE INDEX "employee_lifecycle_events_employeeId_idx" ON "employee_lifecycle_events"("employeeId");

-- CreateIndex
CREATE INDEX "employee_lifecycle_events_eventType_idx" ON "employee_lifecycle_events"("eventType");

-- CreateIndex
CREATE INDEX "employee_lifecycle_events_effectiveDate_idx" ON "employee_lifecycle_events"("effectiveDate");

-- CreateIndex
CREATE INDEX "employee_lifecycle_events_fromLocationId_idx" ON "employee_lifecycle_events"("fromLocationId");

-- CreateIndex
CREATE INDEX "employee_lifecycle_events_toLocationId_idx" ON "employee_lifecycle_events"("toLocationId");

-- CreateIndex
CREATE INDEX "employee_lifecycle_events_performedByUserId_idx" ON "employee_lifecycle_events"("performedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "employees_organizationId_id_key" ON "employees"("organizationId", "id");

-- AddForeignKey
ALTER TABLE "employee_lifecycle_events" ADD CONSTRAINT "employee_lifecycle_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_lifecycle_events" ADD CONSTRAINT "employee_lifecycle_events_organizationId_employeeId_fkey" FOREIGN KEY ("organizationId", "employeeId") REFERENCES "employees"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_lifecycle_events" ADD CONSTRAINT "employee_lifecycle_events_organizationId_fromLocationId_fkey" FOREIGN KEY ("organizationId", "fromLocationId") REFERENCES "organization_locations"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_lifecycle_events" ADD CONSTRAINT "employee_lifecycle_events_organizationId_toLocationId_fkey" FOREIGN KEY ("organizationId", "toLocationId") REFERENCES "organization_locations"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_lifecycle_events" ADD CONSTRAINT "employee_lifecycle_events_performedByUserId_fkey" FOREIGN KEY ("performedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
