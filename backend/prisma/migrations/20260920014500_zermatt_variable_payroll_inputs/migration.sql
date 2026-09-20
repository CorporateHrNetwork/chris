-- ZERMATT variable payroll inputs and finite deduction schedules.
-- Additive only: existing payroll components and historical payroll rows remain unchanged.

CREATE TABLE "payroll_variable_components" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "calculationType" TEXT NOT NULL DEFAULT 'ENTERED_AMOUNT',
  "taxable" BOOLEAN NOT NULL DEFAULT FALSE,
  "installmentEligible" BOOLEAN NOT NULL DEFAULT FALSE,
  "isSystem" BOOLEAN NOT NULL DEFAULT FALSE,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "notes" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_variable_components_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payroll_variable_components_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payroll_variable_components_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "payroll_variable_components_kind_check" CHECK ("kind" IN ('ALLOWANCE','DEDUCTION')),
  CONSTRAINT "payroll_variable_components_calculation_check" CHECK ("calculationType" IN (
    'ENTERED_AMOUNT',
    'GROSS_DIV_26_REGULAR',
    'GROSS_DIV_26_X2',
    'GROSS_DIV_26_X1_5',
    'GROSS_DIV_208_X1_25'
  )),
  CONSTRAINT "payroll_variable_components_status_check" CHECK ("status" IN ('ACTIVE','SUSPENDED','RETIRED'))
);

CREATE UNIQUE INDEX "payroll_variable_components_org_code_key"
  ON "payroll_variable_components"("organizationId","code");
CREATE INDEX "payroll_variable_components_org_kind_status_idx"
  ON "payroll_variable_components"("organizationId","kind","status");

CREATE TABLE "payroll_variable_inputs" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "componentId" TEXT NOT NULL,
  "payrollPeriodId" TEXT NOT NULL,
  "manualAmount" DECIMAL(18,2),
  "quantity" DECIMAL(12,4),
  "referencePayrollPeriodId" TEXT,
  "reference" TEXT,
  "remarks" TEXT,
  "source" TEXT NOT NULL DEFAULT 'MANUAL',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_variable_inputs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payroll_variable_inputs_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payroll_variable_inputs_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payroll_variable_inputs_componentId_fkey"
    FOREIGN KEY ("componentId") REFERENCES "payroll_variable_components"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payroll_variable_inputs_payrollPeriodId_fkey"
    FOREIGN KEY ("payrollPeriodId") REFERENCES "payroll_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payroll_variable_inputs_referencePayrollPeriodId_fkey"
    FOREIGN KEY ("referencePayrollPeriodId") REFERENCES "payroll_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payroll_variable_inputs_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "payroll_variable_inputs_source_check" CHECK ("source" IN ('MANUAL','BULK_IMPORT')),
  CONSTRAINT "payroll_variable_inputs_status_check" CHECK ("status" IN ('ACTIVE','CANCELLED'))
);

CREATE UNIQUE INDEX "payroll_variable_inputs_employee_component_period_key"
  ON "payroll_variable_inputs"("organizationId","employeeId","componentId","payrollPeriodId");
CREATE INDEX "payroll_variable_inputs_org_period_idx"
  ON "payroll_variable_inputs"("organizationId","payrollPeriodId","status");

CREATE TABLE "payroll_deduction_plans" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "componentId" TEXT NOT NULL,
  "totalAmount" DECIMAL(18,2) NOT NULL,
  "outstandingAmount" DECIMAL(18,2) NOT NULL,
  "scheduleMethod" TEXT NOT NULL,
  "installmentCount" INTEGER NOT NULL,
  "nominalInstallmentAmount" DECIMAL(18,2) NOT NULL,
  "startYear" INTEGER NOT NULL,
  "startMonth" INTEGER NOT NULL,
  "endYear" INTEGER NOT NULL,
  "endMonth" INTEGER NOT NULL,
  "reference" TEXT,
  "remarks" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_deduction_plans_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payroll_deduction_plans_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payroll_deduction_plans_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payroll_deduction_plans_componentId_fkey"
    FOREIGN KEY ("componentId") REFERENCES "payroll_variable_components"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payroll_deduction_plans_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "payroll_deduction_plans_schedule_method_check" CHECK ("scheduleMethod" IN ('INSTALLMENT_COUNT','INSTALLMENT_AMOUNT')),
  CONSTRAINT "payroll_deduction_plans_status_check" CHECK ("status" IN ('ACTIVE','COMPLETED','CANCELLED')),
  CONSTRAINT "payroll_deduction_plans_month_check" CHECK (
    "startMonth" BETWEEN 1 AND 12 AND "endMonth" BETWEEN 1 AND 12
  ),
  CONSTRAINT "payroll_deduction_plans_amount_check" CHECK (
    "totalAmount" > 0 AND "outstandingAmount" >= 0 AND "installmentCount" > 0 AND "nominalInstallmentAmount" > 0
  )
);

CREATE INDEX "payroll_deduction_plans_org_employee_status_idx"
  ON "payroll_deduction_plans"("organizationId","employeeId","status");

CREATE TABLE "payroll_deduction_installments" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "installmentNumber" INTEGER NOT NULL,
  "scheduleYear" INTEGER NOT NULL,
  "scheduleMonth" INTEGER NOT NULL,
  "scheduledAmount" DECIMAL(18,2) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
  "payrollRunId" TEXT,
  "postedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_deduction_installments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payroll_deduction_installments_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payroll_deduction_installments_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "payroll_deduction_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payroll_deduction_installments_payrollRunId_fkey"
    FOREIGN KEY ("payrollRunId") REFERENCES "payroll_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payroll_deduction_installments_status_check" CHECK ("status" IN ('SCHEDULED','POSTED','CANCELLED')),
  CONSTRAINT "payroll_deduction_installments_month_check" CHECK ("scheduleMonth" BETWEEN 1 AND 12),
  CONSTRAINT "payroll_deduction_installments_amount_check" CHECK ("scheduledAmount" > 0)
);

CREATE UNIQUE INDEX "payroll_deduction_installments_plan_number_key"
  ON "payroll_deduction_installments"("planId","installmentNumber");
CREATE UNIQUE INDEX "payroll_deduction_installments_plan_month_key"
  ON "payroll_deduction_installments"("planId","scheduleYear","scheduleMonth");
CREATE INDEX "payroll_deduction_installments_org_month_status_idx"
  ON "payroll_deduction_installments"("organizationId","scheduleYear","scheduleMonth","status");
CREATE INDEX "payroll_deduction_installments_run_idx"
  ON "payroll_deduction_installments"("organizationId","payrollRunId");
