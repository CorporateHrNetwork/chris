ALTER TABLE "employees" ADD COLUMN "employmentType" TEXT;

CREATE INDEX "employees_employmentType_idx" ON "employees"("employmentType");
