-- CreateTable
CREATE TABLE "employee_exit_processes" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "exitType" TEXT NOT NULL,
    "targetStatus" "EmployeeStatus" NOT NULL,
    "noticeDate" TIMESTAMP(3),
    "noticeStatus" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "lastWorkingDay" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "clearance" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "initiatedByUserId" TEXT,
    "completedByUserId" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_exit_processes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_exit_processes_organizationId_idx" ON "employee_exit_processes"("organizationId");

-- CreateIndex
CREATE INDEX "employee_exit_processes_employeeId_idx" ON "employee_exit_processes"("employeeId");

-- CreateIndex
CREATE INDEX "employee_exit_processes_status_idx" ON "employee_exit_processes"("status");

-- CreateIndex
CREATE INDEX "employee_exit_processes_lastWorkingDay_idx" ON "employee_exit_processes"("lastWorkingDay");

-- AddForeignKey
ALTER TABLE "employee_exit_processes" ADD CONSTRAINT "employee_exit_processes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_exit_processes" ADD CONSTRAINT "employee_exit_processes_organizationId_employeeId_fkey" FOREIGN KEY ("organizationId", "employeeId") REFERENCES "employees"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_exit_processes" ADD CONSTRAINT "employee_exit_processes_initiatedByUserId_fkey" FOREIGN KEY ("initiatedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_exit_processes" ADD CONSTRAINT "employee_exit_processes_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
