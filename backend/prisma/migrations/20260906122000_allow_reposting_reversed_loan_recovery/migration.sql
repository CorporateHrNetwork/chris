-- Re-approval after an approved payroll has been reopened must repost the same loan/run recovery
-- without creating a duplicate row. Reversed history remains in place and is reactivated on reapproval.

CREATE OR REPLACE FUNCTION "chris_post_loan_recoveries_on_payroll_approval"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  recovery RECORD;
  v_changed INTEGER := 0;
  v_recovery_date DATE;
BEGIN
  IF NEW."status" <> 'APPROVED' OR OLD."status" = 'APPROVED' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(pp."payDate", pp."periodEnd")
    INTO v_recovery_date
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
