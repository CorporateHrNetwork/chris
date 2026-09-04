-- CHRiS Release-1 Payroll activation
-- Creates tenant-scoped payroll operational tables without changing accepted employee/leave/attendance structures.

CREATE TABLE "payroll_periods" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "periodStart" DATE NOT NULL,
  "periodEnd" DATE NOT NULL,
  "payDate" DATE,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_periods_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payroll_periods_date_check" CHECK ("periodEnd" >= "periodStart"),
  CONSTRAINT "payroll_periods_status_check" CHECK ("status" IN ('OPEN','LOCKED','CLOSED')),
  CONSTRAINT "payroll_periods_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payroll_periods_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "payroll_periods_organizationId_code_key" ON "payroll_periods"("organizationId","code");
CREATE INDEX "payroll_periods_organizationId_status_idx" ON "payroll_periods"("organizationId","status");
CREATE INDEX "payroll_periods_periodStart_periodEnd_idx" ON "payroll_periods"("periodStart","periodEnd");

CREATE TABLE "payroll_salary_rates" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'NGN',
  "frequency" TEXT NOT NULL DEFAULT 'MONTHLY',
  "effectiveFrom" DATE NOT NULL,
  "effectiveTo" DATE,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "reason" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_salary_rates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payroll_salary_rates_amount_check" CHECK ("amount" >= 0),
  CONSTRAINT "payroll_salary_rates_dates_check" CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom"),
  CONSTRAINT "payroll_salary_rates_status_check" CHECK ("status" IN ('ACTIVE','RETIRED')),
  CONSTRAINT "payroll_salary_rates_frequency_check" CHECK ("frequency" IN ('MONTHLY')),
  CONSTRAINT "payroll_salary_rates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payroll_salary_rates_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payroll_salary_rates_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "payroll_salary_rates_org_employee_effective_key" ON "payroll_salary_rates"("organizationId","employeeId","effectiveFrom");
CREATE INDEX "payroll_salary_rates_org_employee_status_idx" ON "payroll_salary_rates"("organizationId","employeeId","status");
CREATE INDEX "payroll_salary_rates_effective_idx" ON "payroll_salary_rates"("effectiveFrom","effectiveTo");

CREATE TABLE "payroll_components" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT,
  "kind" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "calculationType" TEXT NOT NULL DEFAULT 'FIXED',
  "amount" DECIMAL(18,2),
  "percentage" DECIMAL(8,4),
  "effectiveFrom" DATE NOT NULL,
  "effectiveTo" DATE,
  "oneTimePeriodId" TEXT,
  "taxable" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "notes" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_components_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payroll_components_kind_check" CHECK ("kind" IN ('ALLOWANCE','DEDUCTION')),
  CONSTRAINT "payroll_components_calc_check" CHECK ("calculationType" IN ('FIXED','PERCENT_GROSS')),
  CONSTRAINT "payroll_components_value_check" CHECK (("calculationType" = 'FIXED' AND "amount" IS NOT NULL AND "amount" >= 0) OR ("calculationType" = 'PERCENT_GROSS' AND "percentage" IS NOT NULL AND "percentage" >= 0)),
  CONSTRAINT "payroll_components_dates_check" CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom"),
  CONSTRAINT "payroll_components_status_check" CHECK ("status" IN ('ACTIVE','SUSPENDED','RETIRED')),
  CONSTRAINT "payroll_components_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payroll_components_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payroll_components_oneTimePeriodId_fkey" FOREIGN KEY ("oneTimePeriodId") REFERENCES "payroll_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "payroll_components_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "payroll_components_org_kind_status_idx" ON "payroll_components"("organizationId","kind","status");
CREATE INDEX "payroll_components_org_employee_idx" ON "payroll_components"("organizationId","employeeId");
CREATE INDEX "payroll_components_effective_idx" ON "payroll_components"("effectiveFrom","effectiveTo");

CREATE TABLE "payroll_salary_advances" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "outstandingAmount" DECIMAL(18,2) NOT NULL,
  "installmentAmount" DECIMAL(18,2) NOT NULL,
  "issuedDate" DATE NOT NULL,
  "recoveryStartDate" DATE NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "reason" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_salary_advances_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payroll_salary_advances_amount_check" CHECK ("amount" > 0 AND "outstandingAmount" >= 0 AND "installmentAmount" > 0),
  CONSTRAINT "payroll_salary_advances_status_check" CHECK ("status" IN ('ACTIVE','PAUSED','COMPLETED','CANCELLED')),
  CONSTRAINT "payroll_salary_advances_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payroll_salary_advances_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payroll_salary_advances_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "payroll_salary_advances_org_status_idx" ON "payroll_salary_advances"("organizationId","status");
CREATE INDEX "payroll_salary_advances_org_employee_idx" ON "payroll_salary_advances"("organizationId","employeeId");

CREATE TABLE "payroll_runs" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "periodId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "employeeCount" INTEGER NOT NULL DEFAULT 0,
  "grossTotal" DECIMAL(20,2) NOT NULL DEFAULT 0,
  "deductionTotal" DECIMAL(20,2) NOT NULL DEFAULT 0,
  "netPreviewTotal" DECIMAL(20,2) NOT NULL DEFAULT 0,
  "statutoryStatus" TEXT NOT NULL DEFAULT 'NOT_AUTOMATED',
  "createdByUserId" TEXT,
  "submittedByUserId" TEXT,
  "approvedByUserId" TEXT,
  "submittedAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payroll_runs_status_check" CHECK ("status" IN ('DRAFT','PENDING_APPROVAL','APPROVED','REJECTED')),
  CONSTRAINT "payroll_runs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payroll_runs_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "payroll_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payroll_runs_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "payroll_runs_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "payroll_runs_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "payroll_runs_org_period_key" ON "payroll_runs"("organizationId","periodId");
CREATE INDEX "payroll_runs_org_status_idx" ON "payroll_runs"("organizationId","status");

CREATE TABLE "payroll_run_lines" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "employeeNumber" TEXT NOT NULL,
  "employeeName" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'NGN',
  "baseSalary" DECIMAL(18,2) NOT NULL,
  "allowances" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "deductions" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "advanceRecovery" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "grossPay" DECIMAL(18,2) NOT NULL,
  "netPreview" DECIMAL(18,2) NOT NULL,
  "statutoryStatus" TEXT NOT NULL DEFAULT 'NOT_AUTOMATED',
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_run_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payroll_run_lines_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payroll_run_lines_runId_fkey" FOREIGN KEY ("runId") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payroll_run_lines_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "payroll_run_lines_run_employee_key" ON "payroll_run_lines"("runId","employeeId");
CREATE INDEX "payroll_run_lines_org_employee_idx" ON "payroll_run_lines"("organizationId","employeeId");

CREATE TABLE "payroll_approvals" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "actorUserId" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_approvals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payroll_approvals_action_check" CHECK ("action" IN ('SUBMITTED','APPROVED','REJECTED')),
  CONSTRAINT "payroll_approvals_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payroll_approvals_runId_fkey" FOREIGN KEY ("runId") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payroll_approvals_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "payroll_approvals_org_run_idx" ON "payroll_approvals"("organizationId","runId","createdAt");
