-- Confirmed actual deductions are distinct from provisional payroll approval.
ALTER TABLE "payroll_loan_recoveries" ADD COLUMN IF NOT EXISTS "confirmedPaidAt" TIMESTAMPTZ;
ALTER TABLE "payroll_loan_recoveries" ADD COLUMN IF NOT EXISTS "confirmationSource" TEXT;

CREATE OR REPLACE FUNCTION "chris_apply_active_loan_recovery"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO pg_catalog, public, pg_temp
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
           END::NUMERIC AS scheduled_amount, FALSE AS confirmed_paid
      FROM "payroll_loans" l
     WHERE l."organizationId"=NEW."organizationId"
       AND l."employeeId"=NEW."employeeId"
       AND l."status"='ACTIVE'
       AND l."outstandingAmount" > 0
       AND DATE_TRUNC('month', l."recoveryStartDate") <= DATE_TRUNC('month', v_period_start)
       AND NOT EXISTS (SELECT 1 FROM "payroll_loan_recoveries" paid
         WHERE paid."organizationId"=l."organizationId" AND paid."loanId"=l."id"
           AND paid."status"='POSTED' AND paid."confirmedPaidAt" IS NOT NULL
           AND DATE_TRUNC('month',paid."recoveryDate")=DATE_TRUNC('month',v_period_start))
    UNION ALL
    SELECT l."id",l."loanNumber",l."recoveryStartDate",l."disbursedDate",SUM(paid."amount")::NUMERIC,TRUE
      FROM "payroll_loans" l
      JOIN "payroll_loan_recoveries" paid ON paid."organizationId"=l."organizationId" AND paid."loanId"=l."id"
     WHERE l."organizationId"=NEW."organizationId" AND l."employeeId"=NEW."employeeId"
       AND paid."status"='POSTED' AND paid."confirmedPaidAt" IS NOT NULL
       AND DATE_TRUNC('month',paid."recoveryDate")=DATE_TRUNC('month',v_period_start)
     GROUP BY l."id",l."loanNumber",l."recoveryStartDate",l."disbursedDate"
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
             WHEN confirmed_paid OR GREATEST(0, v_available - prior_scheduled) >= scheduled_amount THEN scheduled_amount
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


CREATE OR REPLACE FUNCTION "chris_post_loan_recoveries_on_payroll_approval"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO pg_catalog, public, pg_temp
AS $$
DECLARE
  recovery RECORD;
  v_changed INTEGER := 0;
  v_recovery_date DATE;
  v_period_start DATE;
BEGIN
  IF NEW."status" <> 'APPROVED' OR OLD."status" = 'APPROVED' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(pp."payDate", pp."periodEnd"),pp."periodStart"
    INTO v_recovery_date,v_period_start
    FROM "payroll_periods" pp
   WHERE pp."organizationId"=NEW."organizationId"
     AND pp."id"=NEW."periodId"
   LIMIT 1;

  FOR recovery IN
    SELECT
      pl."id" AS run_line_id,
      pl."employeeId" AS employee_id,
      item->>'id' AS loan_id,
      COALESCE(NULLIF(item->>'value','')::NUMERIC,0) AS amount
    FROM "payroll_run_lines" pl
    CROSS JOIN LATERAL JSONB_ARRAY_ELEMENTS(COALESCE(pl."details"->'loanRecoveries','[]'::jsonb)) item
    WHERE pl."organizationId"=NEW."organizationId"
      AND pl."runId"=NEW."id"
  LOOP
    IF recovery.amount <= 0 OR recovery.loan_id IS NULL THEN CONTINUE; END IF;

    -- Actual paid deductions remain settled even while their payroll is open.
    -- Also prevents a fresh replacement run for the same month posting twice.
    IF EXISTS (SELECT 1 FROM "payroll_loan_recoveries" paid
      WHERE paid."organizationId"=NEW."organizationId" AND paid."loanId"=recovery.loan_id
        AND paid."employeeId"=recovery.employee_id AND paid."status"='POSTED'
        AND paid."confirmedPaidAt" IS NOT NULL
        AND DATE_TRUNC('month',paid."recoveryDate")=DATE_TRUNC('month',v_period_start)) THEN CONTINUE; END IF;

    INSERT INTO "payroll_loan_recoveries" (
      "id","organizationId","loanId","employeeId","runId","runLineId","amount","recoveryDate","status"
    )
    SELECT
      md5(random()::text || clock_timestamp()::text || l."id" || NEW."id" || recovery.run_line_id),
      NEW."organizationId",
      l."id",
      recovery.employee_id,
      NEW."id",
      recovery.run_line_id,
      LEAST(recovery.amount, l."outstandingAmount"),
      v_recovery_date,
      'POSTED'
    FROM "payroll_loans" l
    WHERE l."organizationId"=NEW."organizationId"
      AND l."id"=recovery.loan_id
      AND l."employeeId"=recovery.employee_id
      AND l."status"='ACTIVE'
      AND l."outstandingAmount" > 0
    ON CONFLICT ("loanId","runId") DO UPDATE
      SET "runLineId"=EXCLUDED."runLineId",
          "employeeId"=EXCLUDED."employeeId",
          "amount"=EXCLUDED."amount",
          "recoveryDate"=EXCLUDED."recoveryDate",
          "status"='POSTED'
      WHERE "payroll_loan_recoveries"."status"='REVERSED';

    GET DIAGNOSTICS v_changed = ROW_COUNT;

    IF v_changed > 0 THEN
      UPDATE "payroll_loans" l
         SET "outstandingAmount"=GREATEST(0, l."outstandingAmount" - posted."amount"),
             "status"=CASE
               WHEN GREATEST(0, l."outstandingAmount" - posted."amount")=0 THEN 'COMPLETED'
               ELSE l."status"
             END,
             "updatedAt"=CURRENT_TIMESTAMP
        FROM "payroll_loan_recoveries" posted
       WHERE posted."organizationId"=NEW."organizationId"
         AND posted."runId"=NEW."id"
         AND posted."loanId"=l."id"
         AND posted."status"='POSTED'
         AND l."organizationId"=NEW."organizationId"
         AND l."id"=recovery.loan_id;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;
