-- CHRiS ZERMATT loan origination, workflow notification, attachment and payroll reopen controls
-- This migration extends the accepted payroll/loan architecture without changing historical recovery records.

ALTER TABLE "payroll_loans" DROP CONSTRAINT IF EXISTS "payroll_loans_status_check";
ALTER TABLE "payroll_loans"
  ADD CONSTRAINT "payroll_loans_status_check" CHECK (
    "status" IN (
      'DRAFT',
      'PENDING_HR_VERIFICATION',
      'RETURNED_FOR_CORRECTION',
      'PENDING_GM_APPROVAL',
      'GM_APPROVED',
      'AWAITING_DISBURSEMENT',
      'PENDING_APPROVAL',
      'APPROVED',
      'ACTIVE',
      'PAUSED',
      'COMPLETED',
      'REJECTED',
      'CANCELLED'
    )
  );

ALTER TABLE "payroll_loans"
  ADD COLUMN IF NOT EXISTS "workflowLocationId" TEXT,
  ADD COLUMN IF NOT EXISTS "applicationVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "hrVerifiedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "hrVerifiedByUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "gmDecisionAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "gmDecisionByUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "disbursementReference" TEXT;

DO $$ BEGIN
  ALTER TABLE "payroll_loans"
    ADD CONSTRAINT "payroll_loans_workflowLocationId_fkey"
    FOREIGN KEY ("workflowLocationId") REFERENCES "organization_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "payroll_loans"
    ADD CONSTRAINT "payroll_loans_hrVerifiedByUserId_fkey"
    FOREIGN KEY ("hrVerifiedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "payroll_loans"
    ADD CONSTRAINT "payroll_loans_gmDecisionByUserId_fkey"
    FOREIGN KEY ("gmDecisionByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "payroll_loans_org_workflow_location_idx"
  ON "payroll_loans"("organizationId","workflowLocationId","status");

CREATE TABLE IF NOT EXISTS "payroll_loan_attachments" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "loanId" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'LOAN_APPLICATION_FORM',
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "content" BYTEA NOT NULL,
  "uploadedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_loan_attachments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payroll_loan_attachments_size_check" CHECK ("fileSize" > 0 AND "fileSize" <= 10485760),
  CONSTRAINT "payroll_loan_attachments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payroll_loan_attachments_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "payroll_loans"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payroll_loan_attachments_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "payroll_loan_attachments_org_loan_idx" ON "payroll_loan_attachments"("organizationId","loanId","createdAt");

CREATE TABLE IF NOT EXISTS "payroll_loan_workflow_events" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "loanId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT,
  "actorUserId" TEXT,
  "comments" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_loan_workflow_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payroll_loan_workflow_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payroll_loan_workflow_events_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "payroll_loans"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payroll_loan_workflow_events_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "payroll_loan_workflow_events_org_loan_idx" ON "payroll_loan_workflow_events"("organizationId","loanId","createdAt");

CREATE TABLE IF NOT EXISTS "payroll_loan_email_approval_tokens" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "loanId" TEXT NOT NULL,
  "approverUserId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_loan_email_approval_tokens_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payroll_loan_email_approval_tokens_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payroll_loan_email_approval_tokens_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "payroll_loans"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payroll_loan_email_approval_tokens_approverUserId_fkey" FOREIGN KEY ("approverUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "payroll_loan_email_approval_tokens_hash_key" ON "payroll_loan_email_approval_tokens"("tokenHash");
CREATE INDEX IF NOT EXISTS "payroll_loan_email_approval_tokens_loan_idx" ON "payroll_loan_email_approval_tokens"("organizationId","loanId","expiresAt");

CREATE TABLE IF NOT EXISTS "payroll_loan_recipient_rules" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "workflowRole" TEXT NOT NULL,
  "roleAliases" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "locationScoped" BOOLEAN NOT NULL DEFAULT false,
  "receivesEmail" BOOLEAN NOT NULL DEFAULT true,
  "actionAuthority" TEXT NOT NULL DEFAULT 'VISIBILITY',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_loan_recipient_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payroll_loan_recipient_rules_authority_check" CHECK ("actionAuthority" IN ('VISIBILITY','HR_VERIFY','GM_APPROVE','DISBURSE')),
  CONSTRAINT "payroll_loan_recipient_rules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "payroll_loan_recipient_rules_org_role_key" ON "payroll_loan_recipient_rules"("organizationId","workflowRole");

CREATE TABLE IF NOT EXISTS "payroll_loan_notification_outbox" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "loanId" TEXT NOT NULL,
  "recipientUserId" TEXT,
  "recipientRole" TEXT NOT NULL,
  "toEmail" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "textBody" TEXT NOT NULL,
  "htmlBody" TEXT,
  "attachmentIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_loan_notification_outbox_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payroll_loan_notification_outbox_status_check" CHECK ("status" IN ('QUEUED','SENT','FAILED')),
  CONSTRAINT "payroll_loan_notification_outbox_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payroll_loan_notification_outbox_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "payroll_loans"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payroll_loan_notification_outbox_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "payroll_loan_notification_outbox_status_idx" ON "payroll_loan_notification_outbox"("organizationId","status","createdAt");

-- Allow an approved payroll to be reopened with an auditable approval-history event.
ALTER TABLE "payroll_approvals" DROP CONSTRAINT IF EXISTS "payroll_approvals_action_check";
ALTER TABLE "payroll_approvals"
  ADD CONSTRAINT "payroll_approvals_action_check" CHECK ("action" IN ('SUBMITTED','APPROVED','REJECTED','REOPENED_FOR_CORRECTION'));

-- ZERMATT workflow defaults are role-based and remain tenant configurable.
INSERT INTO "payroll_loan_recipient_rules"
  ("id","organizationId","workflowRole","roleAliases","locationScoped","receivesEmail","actionAuthority")
SELECT md5(random()::text || clock_timestamp()::text), o."id", x.workflow_role, x.aliases::jsonb, x.location_scoped, true, x.authority
FROM "organizations" o
CROSS JOIN (VALUES
  ('HEAD_HR_VERIFIER', '["Head of Human Resources","Head of HR & Admin","Head of Human Resources & Administration"]', false, 'HR_VERIFY'),
  ('GM_APPROVER', '["General Manager","GM"]', false, 'GM_APPROVE'),
  ('BRANCH_OPERATIONS_VISIBILITY', '["Beer Barn Branch Operations Manager","Branch Operations Manager","Operations Manager"]', true, 'VISIBILITY'),
  ('INTERNAL_AUDITOR_VISIBILITY', '["Internal Auditor"]', false, 'VISIBILITY'),
  ('CHIEF_ACCOUNTANT_DISBURSEMENT', '["Chief Accountant"]', false, 'DISBURSE'),
  ('BRANCH_ACCOUNTANT_VISIBILITY', '["Branch Accountant"]', true, 'VISIBILITY'),
  ('ACCOUNTS_OFFICER_VISIBILITY', '["Accounts Officer","Account Officer"]', true, 'VISIBILITY')
) AS x(workflow_role, aliases, location_scoped, authority)
WHERE o."slug"='zermatt-liquor-limited'
ON CONFLICT ("organizationId","workflowRole") DO NOTHING;

-- Dedicated loan workflow permissions. Existing payroll.manage users retain compatibility in the API layer.
INSERT INTO "permissions" ("id","key","name","description","createdAt","updatedAt") VALUES
  (md5('loans.apply'), 'loans.apply', 'Create Loan Applications', 'Create and submit employee loan applications with supporting forms.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (md5('loans.verify'), 'loans.verify', 'Verify Loan Applications', 'Head HR verification and return-for-correction control.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (md5('loans.approve'), 'loans.approve', 'Approve Loan Applications', 'General Manager loan approval authority.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (md5('loans.disburse'), 'loans.disburse', 'Disburse Approved Loans', 'Chief Accountant loan disbursement processing authority.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

-- Recovery eligibility is month-effective: a recovery start date anywhere in the designated month
-- is treated as effective from the beginning of that payroll month. Balance reduction remains approval-only.
CREATE OR REPLACE FUNCTION "chris_apply_active_loan_recovery"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_period_start DATE;
  v_available NUMERIC := 0;
  v_loan_recovery NUMERIC := 0;
  v_loan_items JSONB := '[]'::jsonb;
BEGIN
  SELECT pp."periodStart"
    INTO v_period_start
    FROM "payroll_runs" pr
    JOIN "payroll_periods" pp ON pp."id"=pr."periodId" AND pp."organizationId"=pr."organizationId"
   WHERE pr."id"=NEW."runId" AND pr."organizationId"=NEW."organizationId"
   LIMIT 1;

  IF v_period_start IS NULL THEN RETURN NEW; END IF;

  v_available := GREATEST(0, COALESCE(NEW."grossPay",0) - COALESCE(NEW."deductions",0) - COALESCE(NEW."advanceRecovery",0));

  WITH scheduled AS (
    SELECT l."id", l."loanNumber", l."recoveryStartDate", l."disbursedDate",
           LEAST(l."outstandingAmount", l."installmentAmount")::NUMERIC AS scheduled_amount,
           COALESCE(SUM(LEAST(l."outstandingAmount", l."installmentAmount")) OVER (
             ORDER BY l."recoveryStartDate", l."disbursedDate", l."id"
             ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
           ),0)::NUMERIC AS prior_scheduled
      FROM "payroll_loans" l
     WHERE l."organizationId"=NEW."organizationId"
       AND l."employeeId"=NEW."employeeId"
       AND l."status"='ACTIVE'
       AND l."outstandingAmount" > 0
       AND DATE_TRUNC('month', l."recoveryStartDate") <= DATE_TRUNC('month', v_period_start)
  ), allocated AS (
    SELECT "id","loanNumber","recoveryStartDate","disbursedDate",
           GREATEST(0, LEAST(scheduled_amount, v_available - prior_scheduled))::NUMERIC AS recovery_amount
      FROM scheduled
  )
  SELECT COALESCE(SUM(recovery_amount),0),
         COALESCE(JSONB_AGG(JSONB_BUILD_OBJECT('id',"id",'loanNumber',"loanNumber",'value',recovery_amount)
           ORDER BY "recoveryStartDate","disbursedDate","id") FILTER (WHERE recovery_amount > 0),'[]'::jsonb)
    INTO v_loan_recovery, v_loan_items
    FROM allocated;

  NEW."loanRecovery" := ROUND(COALESCE(v_loan_recovery,0),2);
  NEW."netPreview" := GREATEST(0, COALESCE(NEW."grossPay",0) - COALESCE(NEW."deductions",0) - COALESCE(NEW."advanceRecovery",0) - COALESCE(NEW."loanRecovery",0));
  NEW."details" := COALESCE(NEW."details", '{}'::jsonb) || JSONB_BUILD_OBJECT(
    'loanRecoveries', COALESCE(v_loan_items,'[]'::jsonb),
    'loanRecoveryTotal', COALESCE(NEW."loanRecovery",0),
    'recoveryPriority', 'STATUTORY_AND_CUSTOM_DEDUCTIONS_THEN_SALARY_ADVANCE_THEN_LOAN',
    'loanRecoveryEffectiveRule', 'RECOVERY_START_MONTH_FROM_BEGINNING_OF_MONTH'
  );
  RETURN NEW;
END;
$$;
