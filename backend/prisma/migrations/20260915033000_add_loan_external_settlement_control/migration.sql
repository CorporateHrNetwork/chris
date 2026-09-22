-- CHRiS ZERMATT controlled external-loan settlement.
-- A loan may be fully cleared by the employee outside payroll (for example by
-- bank transfer, cash repayment or another confirmed settlement channel).
-- This is deliberately distinct from payroll_loan_recoveries so CHRiS never
-- fabricates a salary deduction for money received through another source.

ALTER TABLE "payroll_loans"
  ADD COLUMN IF NOT EXISTS "externalSettlementAmount" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "externalSettlementDate" DATE,
  ADD COLUMN IF NOT EXISTS "externalSettlementSource" TEXT,
  ADD COLUMN IF NOT EXISTS "externalSettlementReference" TEXT,
  ADD COLUMN IF NOT EXISTS "externalSettlementReason" TEXT;

ALTER TABLE "payroll_loans"
  DROP CONSTRAINT IF EXISTS "payroll_loans_external_settlement_amount_check";
ALTER TABLE "payroll_loans"
  ADD CONSTRAINT "payroll_loans_external_settlement_amount_check"
  CHECK ("externalSettlementAmount" IS NULL OR "externalSettlementAmount" > 0);

ALTER TABLE "payroll_loans"
  DROP CONSTRAINT IF EXISTS "payroll_loans_external_settlement_completion_check";
ALTER TABLE "payroll_loans"
  ADD CONSTRAINT "payroll_loans_external_settlement_completion_check"
  CHECK (
    "externalSettlementAmount" IS NULL OR (
      "status" = 'COMPLETED'
      AND "outstandingAmount" = 0
      AND "externalSettlementDate" IS NOT NULL
      AND NULLIF(BTRIM(COALESCE("externalSettlementSource", '')), '') IS NOT NULL
      AND NULLIF(BTRIM(COALESCE("externalSettlementReason", '')), '') IS NOT NULL
    )
  );

CREATE INDEX IF NOT EXISTS "payroll_loans_org_external_settlement_idx"
  ON "payroll_loans"("organizationId","externalSettlementDate")
  WHERE "externalSettlementAmount" IS NOT NULL;
