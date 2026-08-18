-- CreateEnum
CREATE TYPE "AttendancePayrollBasis" AS ENUM ('SYSTEM', 'ADMIN_ENTERED');

-- CreateTable
CREATE TABLE "attendance_payroll_settings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "basis" "AttendancePayrollBasis" NOT NULL DEFAULT 'SYSTEM',
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_payroll_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_payroll_inputs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "workedHours" DOUBLE PRECISION,
    "workedDays" DOUBLE PRECISION,
    "notes" TEXT,
    "recordedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_payroll_inputs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "attendance_payroll_settings_organizationId_key" ON "attendance_payroll_settings"("organizationId");

-- CreateIndex
CREATE INDEX "attendance_payroll_settings_basis_idx" ON "attendance_payroll_settings"("basis");

-- CreateIndex
CREATE INDEX "attendance_payroll_inputs_organizationId_periodStart_period_idx" ON "attendance_payroll_inputs"("organizationId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "attendance_payroll_inputs_employeeId_idx" ON "attendance_payroll_inputs"("employeeId");

-- CreateIndex
CREATE INDEX "attendance_payroll_inputs_recordedByUserId_idx" ON "attendance_payroll_inputs"("recordedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_payroll_inputs_organizationId_employeeId_periodS_key" ON "attendance_payroll_inputs"("organizationId", "employeeId", "periodStart", "periodEnd");

-- AddForeignKey
ALTER TABLE "attendance_payroll_settings" ADD CONSTRAINT "attendance_payroll_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_payroll_settings" ADD CONSTRAINT "attendance_payroll_settings_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_payroll_inputs" ADD CONSTRAINT "attendance_payroll_inputs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_payroll_inputs" ADD CONSTRAINT "attendance_payroll_inputs_organizationId_employeeId_fkey" FOREIGN KEY ("organizationId", "employeeId") REFERENCES "employees"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_payroll_inputs" ADD CONSTRAINT "attendance_payroll_inputs_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
