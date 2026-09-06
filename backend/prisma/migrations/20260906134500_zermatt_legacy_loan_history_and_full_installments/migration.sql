-- ZERMATT opening-loan history correction.
-- Historical deductions through August 2026 are treated as full installments,
-- except the explicitly paused August deductions for ZLL000055 and ZLL000185.
-- Micheal Appiah (ZLL000199) starts in October 2026 and is therefore outside this history seed.

CREATE TABLE IF NOT EXISTS "payroll_loan_legacy_period_events" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "loanId" TEXT NOT NULL,
  "periodStart" DATE NOT NULL,
  "status" TEXT NOT NULL,
  "amount" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "reason" TEXT,
  "source" TEXT NOT NULL DEFAULT 'OPENING_MIGRATION',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_loan_legacy_period_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payroll_loan_legacy_period_events_status_check" CHECK ("status" IN ('PAID','PAUSED')),
  CONSTRAINT "payroll_loan_legacy_period_events_org_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payroll_loan_legacy_period_events_loan_fkey" FOREIGN KEY ("loanId") REFERENCES "payroll_loans"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "payroll_loan_legacy_period_events_org_loan_period_key"
  ON "payroll_loan_legacy_period_events"("organizationId","loanId","periodStart");

WITH imported AS (
  SELECT
    l."organizationId",
    l."id" AS "loanId",
    l."principalAmount"::numeric AS principal,
    l."installmentAmount"::numeric AS installment,
    DATE_TRUNC('month', l."recoveryStartDate")::date AS start_month,
    e."employeeNumber"
  FROM "payroll_loans" l
  JOIN "organizations" o ON o."id"=l."organizationId" AND o."slug"='zermatt-liquor-limited'
  JOIN "employees" e ON e."id"=l."employeeId" AND e."organizationId"=l."organizationId"
  WHERE l."recoveryStartDate" IS NOT NULL
    AND l."installmentAmount" > 0
    AND l."principalAmount" > 0
    AND l."notes" ILIKE '%Source Reference:%'
    AND DATE_TRUNC('month', l."recoveryStartDate")::date <= DATE '2026-08-01'
), months AS (
  SELECT
    i.*,
    gs::date AS period_start,
    (
      (EXTRACT(YEAR FROM gs)::int * 12 + EXTRACT(MONTH FROM gs)::int)
      - (EXTRACT(YEAR FROM i.start_month)::int * 12 + EXTRACT(MONTH FROM i.start_month)::int)
      + 1
    ) AS installment_sequence,
    CEIL(i.principal / i.installment)::int AS term_months
  FROM imported i
  CROSS JOIN LATERAL GENERATE_SERIES(i.start_month, DATE '2026-08-01', INTERVAL '1 month') gs
), eligible AS (
  SELECT * FROM months WHERE installment_sequence <= term_months
)
INSERT INTO "payroll_loan_legacy_period_events"
  ("id","organizationId","loanId","periodStart","status","amount","reason","source")
SELECT
  md5(e."loanId" || '|' || e.period_start::text || '|OPENING_MIGRATION'),
  e."organizationId",
  e."loanId",
  e.period_start,
  CASE
    WHEN e.period_start = DATE '2026-08-01' AND e."employeeNumber" IN ('ZLL000055','ZLL000185') THEN 'PAUSED'
    ELSE 'PAID'
  END,
  CASE
    WHEN e.period_start = DATE '2026-08-01' AND e."employeeNumber" IN ('ZLL000055','ZLL000185') THEN 0
    ELSE ROUND(LEAST(e.installment, GREATEST(0, e.principal - (e.installment * (e.installment_sequence - 1))))::numeric, 2)
  END,
  CASE
    WHEN e.period_start = DATE '2026-08-01' AND e."employeeNumber"='ZLL000055' THEN 'August 2026 loan deduction paused for Onyemowo Comfort Ella per ZERMATT opening-history confirmation.'
    WHEN e.period_start = DATE '2026-08-01' AND e."employeeNumber"='ZLL000185' THEN 'August 2026 loan deduction paused for Joy Chinwendu Joseph per ZERMATT opening-history confirmation.'
    ELSE 'Opening-loan deduction confirmed paid through August 2026 during ZERMATT migration reconciliation.'
  END,
  'OPENING_MIGRATION'
FROM eligible e
ON CONFLICT ("organizationId","loanId","periodStart") DO UPDATE
  SET "status"=EXCLUDED."status",
      "amount"=EXCLUDED."amount",
      "reason"=EXCLUDED."reason",
      "source"=EXCLUDED."source";

-- ZERMATT payroll loan deductions are full-installment only.
-- A payroll draft may schedule the installment, but CHRiS must never create a partial loan deduction.
-- If the remaining net pay cannot fund a full installment, the loan allocation for that line is zero
-- and the shortfall is exposed in line details for review.
-- A residual of ₦1 or less is absorbed into the preceding final installment so no ₦0.xx payroll deduction is created.
CREATE OR REPLACE FUNCTION "chris_apply_active_loan_recovery"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_period_start DATE;
  v_available NUMERIC := 0;
  v_loan_recovery NUMERIC := 0;
  v_scheduled_total NUMERIC := 0;
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

  WITH base AS (
    SELECT l."id", l."loanNumber", l."recoveryStartDate", l."disbursedDate",
           CASE
             WHEN l."outstandingAmount" > l."installmentAmount"
              AND (l."outstandingAmount" - l."installmentAmount") <= 1
               THEN l."outstandingAmount"
             ELSE LEAST(l."outstandingAmount", l."installmentAmount")
           END::NUMERIC AS scheduled_amount
      FROM "payroll_loans" l
     WHERE l."organizationId"=NEW."organizationId"
       AND l."employeeId"=NEW."employeeId"
       AND l."status"='ACTIVE'
       AND l."outstandingAmount" > 0
       AND DATE_TRUNC('month', l."recoveryStartDate") <= DATE_TRUNC('month', v_period_start)
  ), scheduled AS (
    SELECT b.*,
           COALESCE(SUM(b.scheduled_amount) OVER (
             ORDER BY b."recoveryStartDate", b."disbursedDate", b."id"
             ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
           ),0)::NUMERIC AS prior_scheduled
      FROM base b
  ), allocated AS (
    SELECT "id","loanNumber","recoveryStartDate","disbursedDate",scheduled_amount,
           CASE
             WHEN GREATEST(0, v_available - prior_scheduled) >= scheduled_amount THEN scheduled_amount
             ELSE 0
           END::NUMERIC AS recovery_amount
      FROM scheduled
  )
  SELECT COALESCE(SUM(recovery_amount),0),
         COALESCE(SUM(scheduled_amount),0),
         COALESCE(JSONB_AGG(JSONB_BUILD_OBJECT('id',"id",'loanNumber',"loanNumber",'value',recovery_amount)
           ORDER BY "recoveryStartDate","disbursedDate","id") FILTER (WHERE recovery_amount > 0),'[]'::jsonb)
    INTO v_loan_recovery, v_scheduled_total, v_loan_items
    FROM allocated;

  NEW."loanRecovery" := ROUND(COALESCE(v_loan_recovery,0),2);
  NEW."netPreview" := GREATEST(0, COALESCE(NEW."grossPay",0) - COALESCE(NEW."deductions",0) - COALESCE(NEW."advanceRecovery",0) - COALESCE(NEW."loanRecovery",0));
  NEW."details" := COALESCE(NEW."details", '{}'::jsonb) || JSONB_BUILD_OBJECT(
    'loanRecoveries', COALESCE(v_loan_items,'[]'::jsonb),
    'loanRecoveryTotal', COALESCE(NEW."loanRecovery",0),
    'loanScheduledTotal', COALESCE(v_scheduled_total,0),
    'loanRecoveryShortfall', GREATEST(0, COALESCE(v_scheduled_total,0) - COALESCE(v_loan_recovery,0)),
    'loanRecoveryMode', 'FULL_INSTALLMENT_ONLY',
    'loanMicroResidualRule', 'ABSORB_UP_TO_ONE_NAIRA_INTO_FINAL_INSTALLMENT',
    'recoveryPriority', 'STATUTORY_AND_CUSTOM_DEDUCTIONS_THEN_SALARY_ADVANCE_THEN_LOAN',
    'loanRecoveryEffectiveRule', 'RECOVERY_START_MONTH_FROM_BEGINNING_OF_MONTH'
  );
  RETURN NEW;
END;
$$;
