-- Persist system-generated external approval/payment references on the authoritative loan record.
ALTER TABLE "payroll_loans"
  ADD COLUMN IF NOT EXISTS "gmApprovalReference" TEXT,
  ADD COLUMN IF NOT EXISTS "accountsPaymentReference" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "payroll_loans_org_gm_approval_reference_key"
  ON "payroll_loans"("organizationId","gmApprovalReference")
  WHERE "gmApprovalReference" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "payroll_loans_org_accounts_payment_reference_key"
  ON "payroll_loans"("organizationId","accountsPaymentReference")
  WHERE "accountsPaymentReference" IS NOT NULL;
