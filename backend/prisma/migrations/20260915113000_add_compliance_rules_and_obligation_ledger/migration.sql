-- Additive compliance, statutory remittance/reconciliation and exit-settlement controls.
CREATE TYPE "ComplianceRuleStatus" AS ENUM ('WATCH','DRAFT','REVIEWED','APPROVED','ACTIVE','SUPERSEDED','RETIRED','REJECTED');
CREATE TYPE "StatutoryObligationStatus" AS ENUM ('DRAFT_CALCULATED','CONFIRMED','DUE','PARTIALLY_REMITTED','REMITTED','RECONCILED','OVERDUE','DISPUTED','REVERSED','ADJUSTMENT_REQUIRED');
CREATE TYPE "StatutoryRemittanceStatus" AS ENUM ('DRAFT','SUBMITTED','APPROVED','PAID','PARTIALLY_ALLOCATED','ALLOCATED','RECONCILED','FAILED','REVERSED');
CREATE TYPE "StatutoryReconciliationStatus" AS ENUM ('OPEN','MATCHED','SHORTFALL','OVERPAYMENT','UNMATCHED','RESOLVED');
CREATE TYPE "ExitSettlementStatus" AS ENUM ('DRAFT','CALCULATED','PENDING_APPROVAL','APPROVED','PAYMENT_PENDING','PARTIALLY_PAID','PAID','WAIVED','DISPUTED');
CREATE TYPE "ExitFinancialStatus" AS ENUM ('NOT_STARTED','PENDING','APPROVED','PAID','WAIVED');

CREATE TABLE "compliance_rules" (
 "id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"ruleKey" TEXT NOT NULL,"name" TEXT NOT NULL,"category" TEXT NOT NULL,
 "jurisdiction" TEXT NOT NULL DEFAULT 'NG',"version" INTEGER NOT NULL,"status" "ComplianceRuleStatus" NOT NULL DEFAULT 'DRAFT',
 "effectiveFrom" TIMESTAMP(3) NOT NULL,"effectiveTo" TIMESTAMP(3),"legalAuthority" TEXT,"sourceReference" TEXT,
 "payload" JSONB NOT NULL,"payloadHash" TEXT NOT NULL,"createdByUserId" TEXT,"reviewedByUserId" TEXT,"reviewedAt" TIMESTAMP(3),
 "approvedByUserId" TEXT,"approvedAt" TIMESTAMP(3),"activatedAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "compliance_rules_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "compliance_rules_period_check" CHECK ("effectiveTo" IS NULL OR "effectiveTo">="effectiveFrom"),CONSTRAINT "compliance_rules_version_check" CHECK ("version">0));
CREATE UNIQUE INDEX "compliance_rules_org_key_jurisdiction_version_key" ON "compliance_rules"("organizationId","ruleKey","jurisdiction","version");
CREATE UNIQUE INDEX "compliance_rules_organizationId_id_key" ON "compliance_rules"("organizationId","id");
CREATE INDEX "compliance_rules_effective_idx" ON "compliance_rules"("organizationId","ruleKey","jurisdiction","status","effectiveFrom","effectiveTo");

CREATE TABLE "compliance_rule_events" (
 "id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"complianceRuleId" TEXT NOT NULL,"eventType" TEXT NOT NULL,"actorUserId" TEXT,
 "notes" TEXT,"metadata" JSONB,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "compliance_rule_events_pkey" PRIMARY KEY ("id"));
CREATE INDEX "compliance_rule_events_rule_idx" ON "compliance_rule_events"("organizationId","complianceRuleId","createdAt");

CREATE TABLE "statutory_obligations" (
 "id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"employeeId" TEXT NOT NULL,"payrollRunId" TEXT NOT NULL,"payrollRunLineId" TEXT,
 "obligationType" TEXT NOT NULL,"jurisdiction" TEXT NOT NULL DEFAULT 'NG',"periodYear" INTEGER NOT NULL,"periodMonth" INTEGER NOT NULL,"ruleId" TEXT,
 "currency" TEXT NOT NULL DEFAULT 'NGN',"assessableBase" DECIMAL(18,2) NOT NULL DEFAULT 0,"employeeAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
 "employerAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,"totalLiability" DECIMAL(18,2) NOT NULL DEFAULT 0,"amountRemitted" DECIMAL(18,2) NOT NULL DEFAULT 0,
 "status" "StatutoryObligationStatus" NOT NULL DEFAULT 'DRAFT_CALCULATED',"dueDate" TIMESTAMP(3),"confirmedAt" TIMESTAMP(3),
 "exceptionCode" TEXT,"exceptionReason" TEXT,"calculationSnapshot" JSONB NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "statutory_obligations_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "statutory_obligations_month_check" CHECK ("periodMonth" BETWEEN 1 AND 12),
 CONSTRAINT "statutory_obligations_amounts_check" CHECK ("assessableBase">=0 AND "employeeAmount">=0 AND "employerAmount">=0 AND "totalLiability">=0 AND "amountRemitted">=0),
 CONSTRAINT "statutory_obligations_total_check" CHECK ("totalLiability"="employeeAmount"+"employerAmount"),
 CONSTRAINT "statutory_obligations_remitted_check" CHECK ("amountRemitted"<="totalLiability"));
CREATE UNIQUE INDEX "statutory_obligations_run_line_type_key" ON "statutory_obligations"("organizationId","payrollRunLineId","obligationType");
CREATE UNIQUE INDEX "statutory_obligations_organizationId_id_key" ON "statutory_obligations"("organizationId","id");
CREATE INDEX "statutory_obligations_run_idx" ON "statutory_obligations"("organizationId","payrollRunId","status");
CREATE INDEX "statutory_obligations_period_idx" ON "statutory_obligations"("organizationId","periodYear","periodMonth","obligationType","status");

CREATE TABLE "statutory_remittance_batches" (
 "id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"reference" TEXT NOT NULL,"obligationType" TEXT NOT NULL,"jurisdiction" TEXT NOT NULL DEFAULT 'NG',
 "authorityName" TEXT NOT NULL,"periodYear" INTEGER NOT NULL,"periodMonth" INTEGER NOT NULL,"currency" TEXT NOT NULL DEFAULT 'NGN',
 "declaredAmount" DECIMAL(18,2) NOT NULL,"allocatedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
 "status" "StatutoryRemittanceStatus" NOT NULL DEFAULT 'DRAFT',"paymentReference" TEXT,"paymentDate" TIMESTAMP(3),"evidenceReference" TEXT,
 "createdByUserId" TEXT,"approvedByUserId" TEXT,"approvedAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "statutory_remittance_batches_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "statutory_remittance_batches_month_check" CHECK ("periodMonth" BETWEEN 1 AND 12),
 CONSTRAINT "statutory_remittance_batches_amount_check" CHECK ("declaredAmount">0 AND "allocatedAmount">=0 AND "allocatedAmount"<="declaredAmount"));
CREATE UNIQUE INDEX "statutory_remittance_batches_org_reference_key" ON "statutory_remittance_batches"("organizationId","reference");
CREATE UNIQUE INDEX "statutory_remittance_batches_organizationId_id_key" ON "statutory_remittance_batches"("organizationId","id");
CREATE UNIQUE INDEX "statutory_remittance_payment_reference_key" ON "statutory_remittance_batches"("organizationId","paymentReference") WHERE "paymentReference" IS NOT NULL;

CREATE TABLE "statutory_remittance_allocations" (
 "id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"batchId" TEXT NOT NULL,"obligationId" TEXT NOT NULL,"amount" DECIMAL(18,2) NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "statutory_remittance_allocations_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "statutory_remittance_allocations_amount_check" CHECK ("amount">0));
CREATE UNIQUE INDEX "statutory_remittance_allocations_batch_obligation_key" ON "statutory_remittance_allocations"("batchId","obligationId");

CREATE TABLE "statutory_reconciliations" (
 "id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"batchId" TEXT NOT NULL,"expectedAmount" DECIMAL(18,2) NOT NULL,"paidAmount" DECIMAL(18,2) NOT NULL,
 "varianceAmount" DECIMAL(18,2) NOT NULL,"status" "StatutoryReconciliationStatus" NOT NULL DEFAULT 'OPEN',"notes" TEXT,
 "reconciledByUserId" TEXT,"reconciledAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "statutory_reconciliations_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "statutory_reconciliations_batch_key" ON "statutory_reconciliations"("batchId");
CREATE UNIQUE INDEX "statutory_reconciliations_org_batch_key" ON "statutory_reconciliations"("organizationId","batchId");

CREATE TABLE "statutory_lifecycle_events" (
 "id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"subjectType" TEXT NOT NULL,"subjectId" TEXT NOT NULL,"eventType" TEXT NOT NULL,
 "actorUserId" TEXT,"previousStatus" TEXT,"newStatus" TEXT,"notes" TEXT,"metadata" JSONB,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "statutory_lifecycle_events_pkey" PRIMARY KEY ("id"));
CREATE INDEX "statutory_lifecycle_events_subject_idx" ON "statutory_lifecycle_events"("organizationId","subjectType","subjectId","createdAt");

CREATE TABLE "exit_settlements" (
 "id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"exitProcessId" TEXT NOT NULL,"employeeId" TEXT NOT NULL,"currency" TEXT NOT NULL DEFAULT 'NGN',
 "finalSalary" DECIMAL(18,2) NOT NULL DEFAULT 0,"allowancePayable" DECIMAL(18,2) NOT NULL DEFAULT 0,"leavePayable" DECIMAL(18,2) NOT NULL DEFAULT 0,
 "noticePay" DECIMAL(18,2) NOT NULL DEFAULT 0,"gratuitySeverance" DECIMAL(18,2) NOT NULL DEFAULT 0,"taxAdjustment" DECIMAL(18,2) NOT NULL DEFAULT 0,
 "pensionAdjustment" DECIMAL(18,2) NOT NULL DEFAULT 0,"loanRecovery" DECIMAL(18,2) NOT NULL DEFAULT 0,
 "salaryAdvanceRecovery" DECIMAL(18,2) NOT NULL DEFAULT 0,"otherRecovery" DECIMAL(18,2) NOT NULL DEFAULT 0,
 "grossPayable" DECIMAL(18,2) NOT NULL DEFAULT 0,"totalRecovery" DECIMAL(18,2) NOT NULL DEFAULT 0,"netSettlement" DECIMAL(18,2) NOT NULL DEFAULT 0,
 "amountPaid" DECIMAL(18,2) NOT NULL DEFAULT 0,"status" "ExitSettlementStatus" NOT NULL DEFAULT 'DRAFT',"calculationSnapshot" JSONB NOT NULL,
 "notes" TEXT,"calculatedByUserId" TEXT,"calculatedAt" TIMESTAMP(3),"approvedByUserId" TEXT,"approvedAt" TIMESTAMP(3),
 "paidByUserId" TEXT,"paidAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "exit_settlements_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "exit_settlements_totals_check" CHECK ("grossPayable"="finalSalary"+"allowancePayable"+"leavePayable"+"noticePay"+"gratuitySeverance"
 AND "totalRecovery"="taxAdjustment"+"pensionAdjustment"+"loanRecovery"+"salaryAdvanceRecovery"+"otherRecovery"
 AND "netSettlement"="grossPayable"-"totalRecovery"));
CREATE UNIQUE INDEX "exit_settlements_exit_process_key" ON "exit_settlements"("exitProcessId");
CREATE UNIQUE INDEX "exit_settlements_org_exit_key" ON "exit_settlements"("organizationId","exitProcessId");
CREATE UNIQUE INDEX "employee_exit_processes_organizationId_id_key" ON "employee_exit_processes"("organizationId","id");
CREATE UNIQUE INDEX "disciplinary_cases_organizationId_id_key" ON "disciplinary_cases"("organizationId","id");

ALTER TABLE "employee_exit_processes" ADD COLUMN "financialStatus" "ExitFinancialStatus" NOT NULL DEFAULT 'NOT_STARTED',
 ADD COLUMN "finalClosureAt" TIMESTAMP(3),ADD COLUMN "terminationReasonClass" TEXT,ADD COLUMN "terminationAuthorityUserId" TEXT,ADD COLUMN "disciplinaryCaseId" TEXT;

ALTER TABLE "compliance_rules" ADD CONSTRAINT "compliance_rules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE,
 ADD CONSTRAINT "compliance_rules_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL,
 ADD CONSTRAINT "compliance_rules_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "users"("id") ON DELETE SET NULL,
 ADD CONSTRAINT "compliance_rules_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "compliance_rule_events" ADD CONSTRAINT "compliance_rule_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE,
 ADD CONSTRAINT "compliance_rule_events_rule_tenant_fkey" FOREIGN KEY ("organizationId","complianceRuleId") REFERENCES "compliance_rules"("organizationId","id") ON DELETE CASCADE,
 ADD CONSTRAINT "compliance_rule_events_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "statutory_obligations" ADD CONSTRAINT "statutory_obligations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE,
 ADD CONSTRAINT "statutory_obligations_employee_tenant_fkey" FOREIGN KEY ("organizationId","employeeId") REFERENCES "employees"("organizationId","id") ON DELETE RESTRICT,
 ADD CONSTRAINT "statutory_obligations_rule_tenant_fkey" FOREIGN KEY ("organizationId","ruleId") REFERENCES "compliance_rules"("organizationId","id") ON DELETE RESTRICT,
 ADD CONSTRAINT "statutory_obligations_run_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "payroll_runs"("id") ON DELETE RESTRICT,
 ADD CONSTRAINT "statutory_obligations_run_line_fkey" FOREIGN KEY ("payrollRunLineId") REFERENCES "payroll_run_lines"("id") ON DELETE SET NULL;
ALTER TABLE "statutory_remittance_batches" ADD CONSTRAINT "statutory_remittance_batches_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE,
 ADD CONSTRAINT "statutory_remittance_batches_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL,
 ADD CONSTRAINT "statutory_remittance_batches_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "statutory_remittance_allocations" ADD CONSTRAINT "statutory_remittance_allocations_batch_tenant_fkey" FOREIGN KEY ("organizationId","batchId") REFERENCES "statutory_remittance_batches"("organizationId","id") ON DELETE RESTRICT,
 ADD CONSTRAINT "statutory_remittance_allocations_obligation_tenant_fkey" FOREIGN KEY ("organizationId","obligationId") REFERENCES "statutory_obligations"("organizationId","id") ON DELETE RESTRICT;
ALTER TABLE "statutory_reconciliations" ADD CONSTRAINT "statutory_reconciliations_batch_tenant_fkey" FOREIGN KEY ("organizationId","batchId") REFERENCES "statutory_remittance_batches"("organizationId","id") ON DELETE RESTRICT,
 ADD CONSTRAINT "statutory_reconciliations_user_fkey" FOREIGN KEY ("reconciledByUserId") REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "statutory_lifecycle_events" ADD CONSTRAINT "statutory_lifecycle_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE,
 ADD CONSTRAINT "statutory_lifecycle_events_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "exit_settlements" ADD CONSTRAINT "exit_settlements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE,
 ADD CONSTRAINT "exit_settlements_exitProcess_tenant_fkey" FOREIGN KEY ("organizationId","exitProcessId") REFERENCES "employee_exit_processes"("organizationId","id") ON DELETE RESTRICT,
 ADD CONSTRAINT "exit_settlements_employee_tenant_fkey" FOREIGN KEY ("organizationId","employeeId") REFERENCES "employees"("organizationId","id") ON DELETE RESTRICT,
 ADD CONSTRAINT "exit_settlements_calculatedByUserId_fkey" FOREIGN KEY ("calculatedByUserId") REFERENCES "users"("id") ON DELETE SET NULL,
 ADD CONSTRAINT "exit_settlements_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL,
 ADD CONSTRAINT "exit_settlements_paidByUserId_fkey" FOREIGN KEY ("paidByUserId") REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "employee_exit_processes" ADD CONSTRAINT "employee_exit_processes_terminationAuthorityUserId_fkey" FOREIGN KEY ("terminationAuthorityUserId") REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "employee_exit_processes" ADD CONSTRAINT "employee_exit_processes_disciplinaryCase_tenant_fkey" FOREIGN KEY ("organizationId","disciplinaryCaseId") REFERENCES "disciplinary_cases"("organizationId","id") ON DELETE RESTRICT;

INSERT INTO "permissions" ("id","key","name","description","createdAt","updatedAt") VALUES
(gen_random_uuid()::text,'compliance.view','View Compliance','View compliance rules and statutory ledgers',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
(gen_random_uuid()::text,'compliance.manage','Manage Compliance','Review and activate controlled compliance rules',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
(gen_random_uuid()::text,'remittances.view','View Remittances','View statutory remittance and reconciliation records',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
(gen_random_uuid()::text,'remittances.manage','Manage Remittances','Create, approve and reconcile statutory remittances',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
(gen_random_uuid()::text,'exit.settlement.manage','Manage Exit Settlements','Calculate, approve and close employee exit settlements',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
