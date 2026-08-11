-- AlterTable
ALTER TABLE "designations" ADD COLUMN     "careerLevel" INTEGER,
ADD COLUMN     "careerTrack" TEXT,
ADD COLUMN     "reportsToDesignationId" TEXT;

-- CreateIndex
CREATE INDEX "designations_careerTrack_idx" ON "designations"("careerTrack");

-- CreateIndex
CREATE INDEX "designations_careerLevel_idx" ON "designations"("careerLevel");

-- CreateIndex
CREATE INDEX "designations_reportsToDesignationId_idx" ON "designations"("reportsToDesignationId");

-- CreateIndex
CREATE INDEX "designations_organizationId_careerTrack_careerLevel_idx" ON "designations"("organizationId", "careerTrack", "careerLevel");

-- AddForeignKey
ALTER TABLE "designations" ADD CONSTRAINT "designations_organizationId_reportsToDesignationId_fkey" FOREIGN KEY ("organizationId", "reportsToDesignationId") REFERENCES "designations"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
