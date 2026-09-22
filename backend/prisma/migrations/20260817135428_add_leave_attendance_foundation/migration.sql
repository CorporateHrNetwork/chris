-- CreateEnum
CREATE TYPE "LeaveUnit" AS ENUM ('DAYS', 'HOURS');

-- CreateEnum
CREATE TYPE "LeaveAccrualMethod" AS ENUM ('ANNUAL', 'MONTHLY', 'NONE');

-- CreateEnum
CREATE TYPE "LeaveServiceBasis" AS ENUM ('CURRENT_EPISODE', 'CUMULATIVE');

-- CreateEnum
CREATE TYPE "LeaveRequestStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'ON_LEAVE', 'REST_DAY', 'HOLIDAY');

-- CreateEnum
CREATE TYPE "AttendanceSource" AS ENUM ('MANUAL', 'WEB', 'MOBILE', 'IMPORT', 'INTEGRATION');

-- CreateTable
CREATE TABLE "leave_types" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "unit" "LeaveUnit" NOT NULL DEFAULT 'DAYS',
    "isPaid" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "requiresAttachment" BOOLEAN NOT NULL DEFAULT false,
    "allowsHalfDay" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_policies" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "entitlementDays" DECIMAL(8,2) NOT NULL,
    "accrualMethod" "LeaveAccrualMethod" NOT NULL DEFAULT 'ANNUAL',
    "accrualRate" DECIMAL(8,4),
    "minimumServiceDays" INTEGER NOT NULL DEFAULT 0,
    "serviceBasis" "LeaveServiceBasis" NOT NULL DEFAULT 'CURRENT_EPISODE',
    "allowCarryForward" BOOLEAN NOT NULL DEFAULT false,
    "maxCarryForwardDays" DECIMAL(8,2),
    "allowNegativeBalance" BOOLEAN NOT NULL DEFAULT false,
    "maxNegativeDays" DECIMAL(8,2),
    "noticeDays" INTEGER NOT NULL DEFAULT 0,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_balances" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "leaveYear" INTEGER NOT NULL,
    "openingBalance" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "accrued" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "carriedForward" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "used" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "adjusted" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "requestedUnits" DECIMAL(8,2) NOT NULL,
    "reason" TEXT,
    "attachmentUrl" TEXT,
    "status" "LeaveRequestStatus" NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_shifts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "graceMinutes" INTEGER NOT NULL DEFAULT 0,
    "crossesMidnight" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_shift_assignments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_shift_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "shiftId" TEXT,
    "attendanceDate" TIMESTAMP(3) NOT NULL,
    "clockIn" TIMESTAMP(3),
    "clockOut" TIMESTAMP(3),
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,
    "overtimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "source" "AttendanceSource" NOT NULL DEFAULT 'MANUAL',
    "notes" TEXT,
    "recordedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "leave_types_organizationId_idx" ON "leave_types"("organizationId");

-- CreateIndex
CREATE INDEX "leave_types_isActive_idx" ON "leave_types"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "leave_types_organizationId_code_key" ON "leave_types"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "leave_types_organizationId_name_key" ON "leave_types"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "leave_types_organizationId_id_key" ON "leave_types"("organizationId", "id");

-- CreateIndex
CREATE INDEX "leave_policies_organizationId_idx" ON "leave_policies"("organizationId");

-- CreateIndex
CREATE INDEX "leave_policies_leaveTypeId_idx" ON "leave_policies"("leaveTypeId");

-- CreateIndex
CREATE INDEX "leave_policies_effectiveFrom_idx" ON "leave_policies"("effectiveFrom");

-- CreateIndex
CREATE INDEX "leave_policies_effectiveTo_idx" ON "leave_policies"("effectiveTo");

-- CreateIndex
CREATE INDEX "leave_policies_isActive_idx" ON "leave_policies"("isActive");

-- CreateIndex
CREATE INDEX "leave_balances_organizationId_idx" ON "leave_balances"("organizationId");

-- CreateIndex
CREATE INDEX "leave_balances_employeeId_idx" ON "leave_balances"("employeeId");

-- CreateIndex
CREATE INDEX "leave_balances_leaveTypeId_idx" ON "leave_balances"("leaveTypeId");

-- CreateIndex
CREATE INDEX "leave_balances_leaveYear_idx" ON "leave_balances"("leaveYear");

-- CreateIndex
CREATE UNIQUE INDEX "leave_balances_organizationId_employeeId_leaveTypeId_leaveY_key" ON "leave_balances"("organizationId", "employeeId", "leaveTypeId", "leaveYear");

-- CreateIndex
CREATE INDEX "leave_requests_organizationId_idx" ON "leave_requests"("organizationId");

-- CreateIndex
CREATE INDEX "leave_requests_employeeId_idx" ON "leave_requests"("employeeId");

-- CreateIndex
CREATE INDEX "leave_requests_leaveTypeId_idx" ON "leave_requests"("leaveTypeId");

-- CreateIndex
CREATE INDEX "leave_requests_status_idx" ON "leave_requests"("status");

-- CreateIndex
CREATE INDEX "leave_requests_startDate_idx" ON "leave_requests"("startDate");

-- CreateIndex
CREATE INDEX "leave_requests_endDate_idx" ON "leave_requests"("endDate");

-- CreateIndex
CREATE INDEX "leave_requests_reviewedByUserId_idx" ON "leave_requests"("reviewedByUserId");

-- CreateIndex
CREATE INDEX "work_shifts_organizationId_idx" ON "work_shifts"("organizationId");

-- CreateIndex
CREATE INDEX "work_shifts_isActive_idx" ON "work_shifts"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "work_shifts_organizationId_code_key" ON "work_shifts"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "work_shifts_organizationId_name_key" ON "work_shifts"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "work_shifts_organizationId_id_key" ON "work_shifts"("organizationId", "id");

-- CreateIndex
CREATE INDEX "employee_shift_assignments_organizationId_idx" ON "employee_shift_assignments"("organizationId");

-- CreateIndex
CREATE INDEX "employee_shift_assignments_employeeId_idx" ON "employee_shift_assignments"("employeeId");

-- CreateIndex
CREATE INDEX "employee_shift_assignments_shiftId_idx" ON "employee_shift_assignments"("shiftId");

-- CreateIndex
CREATE INDEX "employee_shift_assignments_effectiveFrom_idx" ON "employee_shift_assignments"("effectiveFrom");

-- CreateIndex
CREATE INDEX "employee_shift_assignments_effectiveTo_idx" ON "employee_shift_assignments"("effectiveTo");

-- CreateIndex
CREATE INDEX "attendance_records_organizationId_idx" ON "attendance_records"("organizationId");

-- CreateIndex
CREATE INDEX "attendance_records_employeeId_idx" ON "attendance_records"("employeeId");

-- CreateIndex
CREATE INDEX "attendance_records_shiftId_idx" ON "attendance_records"("shiftId");

-- CreateIndex
CREATE INDEX "attendance_records_attendanceDate_idx" ON "attendance_records"("attendanceDate");

-- CreateIndex
CREATE INDEX "attendance_records_status_idx" ON "attendance_records"("status");

-- CreateIndex
CREATE INDEX "attendance_records_recordedByUserId_idx" ON "attendance_records"("recordedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_organizationId_employeeId_attendanceDate_key" ON "attendance_records"("organizationId", "employeeId", "attendanceDate");

-- AddForeignKey
ALTER TABLE "leave_types" ADD CONSTRAINT "leave_types_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_policies" ADD CONSTRAINT "leave_policies_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_policies" ADD CONSTRAINT "leave_policies_organizationId_leaveTypeId_fkey" FOREIGN KEY ("organizationId", "leaveTypeId") REFERENCES "leave_types"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_organizationId_employeeId_fkey" FOREIGN KEY ("organizationId", "employeeId") REFERENCES "employees"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_organizationId_leaveTypeId_fkey" FOREIGN KEY ("organizationId", "leaveTypeId") REFERENCES "leave_types"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_organizationId_employeeId_fkey" FOREIGN KEY ("organizationId", "employeeId") REFERENCES "employees"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_organizationId_leaveTypeId_fkey" FOREIGN KEY ("organizationId", "leaveTypeId") REFERENCES "leave_types"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_shifts" ADD CONSTRAINT "work_shifts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_shift_assignments" ADD CONSTRAINT "employee_shift_assignments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_shift_assignments" ADD CONSTRAINT "employee_shift_assignments_organizationId_employeeId_fkey" FOREIGN KEY ("organizationId", "employeeId") REFERENCES "employees"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_shift_assignments" ADD CONSTRAINT "employee_shift_assignments_organizationId_shiftId_fkey" FOREIGN KEY ("organizationId", "shiftId") REFERENCES "work_shifts"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_organizationId_employeeId_fkey" FOREIGN KEY ("organizationId", "employeeId") REFERENCES "employees"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_organizationId_shiftId_fkey" FOREIGN KEY ("organizationId", "shiftId") REFERENCES "work_shifts"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
