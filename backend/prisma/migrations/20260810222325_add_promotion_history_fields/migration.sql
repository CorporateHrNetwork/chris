/*
  Warnings:

  - A unique constraint covering the columns `[organizationId,id]` on the table `departments` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[organizationId,id]` on the table `designations` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "employee_lifecycle_events" ADD COLUMN     "newDepartmentId" TEXT,
ADD COLUMN     "newDesignationId" TEXT,
ADD COLUMN     "previousDepartmentId" TEXT,
ADD COLUMN     "previousDesignationId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "departments_organizationId_id_key" ON "departments"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "designations_organizationId_id_key" ON "designations"("organizationId", "id");

-- CreateIndex
CREATE INDEX "employee_lifecycle_events_previousDepartmentId_idx" ON "employee_lifecycle_events"("previousDepartmentId");

-- CreateIndex
CREATE INDEX "employee_lifecycle_events_newDepartmentId_idx" ON "employee_lifecycle_events"("newDepartmentId");

-- CreateIndex
CREATE INDEX "employee_lifecycle_events_previousDesignationId_idx" ON "employee_lifecycle_events"("previousDesignationId");

-- CreateIndex
CREATE INDEX "employee_lifecycle_events_newDesignationId_idx" ON "employee_lifecycle_events"("newDesignationId");

-- AddForeignKey
ALTER TABLE "employee_lifecycle_events" ADD CONSTRAINT "employee_lifecycle_events_organizationId_previousDepartmen_fkey" FOREIGN KEY ("organizationId", "previousDepartmentId") REFERENCES "departments"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_lifecycle_events" ADD CONSTRAINT "employee_lifecycle_events_organizationId_newDepartmentId_fkey" FOREIGN KEY ("organizationId", "newDepartmentId") REFERENCES "departments"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_lifecycle_events" ADD CONSTRAINT "employee_lifecycle_events_organizationId_previousDesignati_fkey" FOREIGN KEY ("organizationId", "previousDesignationId") REFERENCES "designations"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_lifecycle_events" ADD CONSTRAINT "employee_lifecycle_events_organizationId_newDesignationId_fkey" FOREIGN KEY ("organizationId", "newDesignationId") REFERENCES "designations"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
