-- CreateTable
CREATE TABLE "employee_employment_episodes" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "startStatus" "EmployeeStatus" NOT NULL,
    "endStatus" "EmployeeStatus",
    "startDepartmentId" TEXT,
    "endDepartmentId" TEXT,
    "startDesignationId" TEXT,
    "endDesignationId" TEXT,
    "startLocationId" TEXT,
    "endLocationId" TEXT,
    "startReason" TEXT,
    "endReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_employment_episodes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_employment_episodes_organizationId_idx" ON "employee_employment_episodes"("organizationId");

-- CreateIndex
CREATE INDEX "employee_employment_episodes_employeeId_idx" ON "employee_employment_episodes"("employeeId");

-- CreateIndex
CREATE INDEX "employee_employment_episodes_startDate_idx" ON "employee_employment_episodes"("startDate");

-- CreateIndex
CREATE INDEX "employee_employment_episodes_endDate_idx" ON "employee_employment_episodes"("endDate");

-- CreateIndex
CREATE INDEX "employee_employment_episodes_startDepartmentId_idx" ON "employee_employment_episodes"("startDepartmentId");

-- CreateIndex
CREATE INDEX "employee_employment_episodes_endDepartmentId_idx" ON "employee_employment_episodes"("endDepartmentId");

-- CreateIndex
CREATE INDEX "employee_employment_episodes_startDesignationId_idx" ON "employee_employment_episodes"("startDesignationId");

-- CreateIndex
CREATE INDEX "employee_employment_episodes_endDesignationId_idx" ON "employee_employment_episodes"("endDesignationId");

-- CreateIndex
CREATE INDEX "employee_employment_episodes_startLocationId_idx" ON "employee_employment_episodes"("startLocationId");

-- CreateIndex
CREATE INDEX "employee_employment_episodes_endLocationId_idx" ON "employee_employment_episodes"("endLocationId");

-- CreateIndex
CREATE UNIQUE INDEX "employee_employment_episodes_organizationId_employeeId_sequ_key" ON "employee_employment_episodes"("organizationId", "employeeId", "sequenceNumber");

-- AddForeignKey
ALTER TABLE "employee_employment_episodes" ADD CONSTRAINT "employee_employment_episodes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_employment_episodes" ADD CONSTRAINT "employee_employment_episodes_organizationId_employeeId_fkey" FOREIGN KEY ("organizationId", "employeeId") REFERENCES "employees"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_employment_episodes" ADD CONSTRAINT "employee_employment_episodes_organizationId_startDepartmen_fkey" FOREIGN KEY ("organizationId", "startDepartmentId") REFERENCES "departments"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_employment_episodes" ADD CONSTRAINT "employee_employment_episodes_organizationId_endDepartmentI_fkey" FOREIGN KEY ("organizationId", "endDepartmentId") REFERENCES "departments"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_employment_episodes" ADD CONSTRAINT "employee_employment_episodes_organizationId_startDesignati_fkey" FOREIGN KEY ("organizationId", "startDesignationId") REFERENCES "designations"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_employment_episodes" ADD CONSTRAINT "employee_employment_episodes_organizationId_endDesignation_fkey" FOREIGN KEY ("organizationId", "endDesignationId") REFERENCES "designations"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_employment_episodes" ADD CONSTRAINT "employee_employment_episodes_organizationId_startLocationI_fkey" FOREIGN KEY ("organizationId", "startLocationId") REFERENCES "organization_locations"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_employment_episodes" ADD CONSTRAINT "employee_employment_episodes_organizationId_endLocationId_fkey" FOREIGN KEY ("organizationId", "endLocationId") REFERENCES "organization_locations"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
