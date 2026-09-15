-- CHRiS compliance future-readiness foundation.
-- Additive only: no existing payroll, employee, leave or Zermatt data is rewritten.

CREATE TABLE "compliance_rules" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "ruleKey" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "jurisdiction" TEXT NOT NULL DEFAULT 'NG',
  "version" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "legalAuthority" TEXT,
  "sourceReference" TEXT,
  "payload" JSONB NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "compliance_rules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "compliance_rules_org_key_jurisdiction_version_key" ON "compliance_rules"("organizationId", "ruleKey", "jurisdiction", "version");
CREATE INDEX "compliance_rules_effective_idx" ON "compliance_rules"("organizationId", "ruleKey", "jurisdiction", "status", "effectiveFrom", "effectiveTo");

CREATE TABLE "compliance_rule_events" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "complianceRuleId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "actorUserId" TEXT,
  "notes" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "compliance_rule_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "compliance_rule_events_rule_idx" ON "compliance_rule_events"("organizationId", "complianceRuleId", "createdAt");

CREATE TABLE "statutory_obligations" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT,
  "payrollReference" TEXT,
  "obligationType" TEXT NOT NULL,
  "jurisdiction" TEXT NOT NULL DEFAULT 'NG',
  "periodYear" INTEGER NOT NULL,
  "periodMonth" INTEGER NOT NULL,
  "ruleId" TEXT,
  "assessableBase" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "employeeAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "employerAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "totalLiability" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "amountRemitted" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'CALCULATED',
  "dueDate" TIMESTAMP(3),
  "remittedAt" TIMESTAMP(3),
  "remittanceReference" TEXT,
  "exceptionCode" TEXT,
  "exceptionReason" TEXT,
  "calculationSnapshot" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "statutory_obligations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "statutory_obligations_period_idx" ON "statutory_obligations"("organizationId", "periodYear", "periodMonth", "obligationType", "status");
CREATE INDEX "statutory_obligations_employee_idx" ON "statutory_obligations"("organizationId", "employeeId", "periodYear", "periodMonth");

ALTER TABLE "compliance_rules" ADD CONSTRAINT "compliance_rules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "compliance_rules" ADD CONSTRAINT "compliance_rules_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "compliance_rule_events" ADD CONSTRAINT "compliance_rule_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "compliance_rule_events" ADD CONSTRAINT "compliance_rule_events_complianceRuleId_fkey" FOREIGN KEY ("complianceRuleId") REFERENCES "compliance_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "compliance_rule_events" ADD CONSTRAINT "compliance_rule_events_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "statutory_obligations" ADD CONSTRAINT "statutory_obligations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "statutory_obligations" ADD CONSTRAINT "statutory_obligations_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "statutory_obligations" ADD CONSTRAINT "statutory_obligations_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "compliance_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
