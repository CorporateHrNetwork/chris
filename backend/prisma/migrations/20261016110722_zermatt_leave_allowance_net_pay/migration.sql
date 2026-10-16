BEGIN;

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
  v_leave_allowance NUMERIC := 0;
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
  -- Preserve the Zermatt benefit already calculated by CHRiS. Loan allocation
  -- still uses salary available before this benefit; do not change installments.
  IF EXISTS (SELECT 1 FROM "organizations" WHERE "id"=NEW."organizationId" AND "slug"='zermatt-liquor-limited') THEN
    v_leave_allowance := GREATEST(0, COALESCE(NULLIF(NEW."details"->'leaveAllowance'->>'amount','')::NUMERIC,0));
  END IF;
  NEW."netPreview" := GREATEST(0, COALESCE(NEW."grossPay",0) - COALESCE(NEW."deductions",0) - COALESCE(NEW."advanceRecovery",0) - COALESCE(NEW."loanRecovery",0)) + v_leave_allowance;
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


-- Repair saved drafts only. Set the authoritative total rather than incrementing
-- it, so retries cannot pay the allowance twice. Approved history is untouched.
DO $repair$
DECLARE
  v_run RECORD;
  v_before NUMERIC;
  v_after NUMERIC;
  v_count INTEGER;
BEGIN
  FOR v_run IN
    SELECT pr."id",pr."organizationId",pr."netPreviewTotal"
      FROM "payroll_runs" pr
      JOIN "organizations" o ON o."id"=pr."organizationId"
     WHERE o."slug"='zermatt-liquor-limited' AND pr."status"='DRAFT'
     FOR UPDATE OF pr
  LOOP
    SELECT COALESCE(SUM("netPreview"),0) INTO v_before
      FROM "payroll_run_lines" WHERE "organizationId"=v_run."organizationId" AND "runId"=v_run."id";
    UPDATE "payroll_run_lines" pl
       SET "netPreview"=GREATEST(0, COALESCE(pl."grossPay",0)-COALESCE(pl."deductions",0)-COALESCE(pl."advanceRecovery",0)-COALESCE(pl."loanRecovery",0))
           + GREATEST(0, COALESCE(NULLIF(pl."details"->'leaveAllowance'->>'amount','')::NUMERIC,0)),
           "updatedAt"=CURRENT_TIMESTAMP
     WHERE pl."organizationId"=v_run."organizationId" AND pl."runId"=v_run."id"
       AND COALESCE(NULLIF(pl."details"->'leaveAllowance'->>'amount','')::NUMERIC,0)>0
       AND pl."netPreview" IS DISTINCT FROM
           GREATEST(0, COALESCE(pl."grossPay",0)-COALESCE(pl."deductions",0)-COALESCE(pl."advanceRecovery",0)-COALESCE(pl."loanRecovery",0))
           + GREATEST(0, COALESCE(NULLIF(pl."details"->'leaveAllowance'->>'amount','')::NUMERIC,0));
    GET DIAGNOSTICS v_count = ROW_COUNT;
    SELECT COALESCE(SUM("netPreview"),0) INTO v_after
      FROM "payroll_run_lines" WHERE "organizationId"=v_run."organizationId" AND "runId"=v_run."id";
    IF v_count > 0 OR v_run."netPreviewTotal" IS DISTINCT FROM v_after THEN
      UPDATE "payroll_runs" SET "netPreviewTotal"=v_after,"updatedAt"=CURRENT_TIMESTAMP
        WHERE "organizationId"=v_run."organizationId" AND "id"=v_run."id" AND "status"='DRAFT';
      INSERT INTO "organization_audits"
        ("id","organizationId","entityType","entityId","action","previousValue","newValue","reason","createdAt")
      VALUES
        (gen_random_uuid()::text,v_run."organizationId",'PayrollRun',v_run."id",'ZERMATT_LEAVE_ALLOWANCE_NET_PAY_REPAIRED',
         jsonb_build_object('netPreviewTotal',v_run."netPreviewTotal",'lineNetTotal',v_before),
         jsonb_build_object('netPreviewTotal',v_after,'repairedLines',v_count,'allowanceIncludedOnce',true),
         'Include saved Zermatt Leave Allowance in draft net salary after deductions and recoveries; preserve approved payroll.',CURRENT_TIMESTAMP);
    END IF;
  END LOOP;
END;
$repair$;

COMMIT;
