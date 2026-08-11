-- AlterTable
ALTER TABLE "designations" ADD COLUMN     "departmentId" TEXT;

-- CreateIndex
CREATE INDEX "designations_departmentId_idx" ON "designations"("departmentId");

-- CreateIndex
CREATE INDEX "designations_organizationId_departmentId_idx" ON "designations"("organizationId", "departmentId");

-- AddForeignKey
ALTER TABLE "designations" ADD CONSTRAINT "designations_organizationId_departmentId_fkey" FOREIGN KEY ("organizationId", "departmentId") REFERENCES "departments"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
