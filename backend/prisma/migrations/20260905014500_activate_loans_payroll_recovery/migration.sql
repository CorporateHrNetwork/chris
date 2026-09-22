-- CHRiS Release-1 Loans activation and payroll recovery integration
-- Loans remain distinct from Salary Advances. Loan installments are calculated into payroll_run_lines.loanRecovery
-- and outstanding loan balances are reduced only when a payroll run transitions to APPROVED.

CREATE TABLE "payroll_loans" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "loanNumber" TEXT NOT NULL,
  "principalAmount" DECIMAL(18,2) NOT NULL,
  "outstandingAmount" DECIMAL(18,2) NOT NULL,
  "installmentAmount" DECIMAL(18,2) NOT NULL,
  "applicationDate" DATE NOT NULL DEFAULT CURRENT_DATE,
  "approvedDate" DATE,
  "disbursedDate" DATE,
  "recoveryStartDate" DATE,
  "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
  "purpose" TEXT,
  "notes" TEXT,
  "parentLoanId" TEXT,
  "createdByUserId" TEXT,
  "approvedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_loans_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payroll_loans_amount_check" CHECK (
    "principalAmount" > 0 AND
    "outstandingAmount" >= 0 AND
    "outstandingAmount" <= "principalAmount" AND
    "installmentAmount" > 0 AND
    "installmentAmount" <= "principalAmount"
  ),
  CONSTRAINT "payroll_loans_status_check" CHECK (
    "status" IN ('PENDING_APPROVAL','APPROVED','ACTIVE','PAUSED','COMPLETED','REJECTED','CANCELLED')
  ),
  CONSTRAINT "payroll_loans_active_dates_check" CHECK (
    "status" NOT IN ('ACTIVE','PAUSED','COMPLETED') OR
    ("disbursedDate" IS NOT NULL AND "recoveryStartDate" IS NOT NULL)
  ),
  CONSTRAINT "payroll_loans_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payroll_loans_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payroll_loans_parentLoanId_fkey" FOREIGN KEY ("parentLoanId") REFERENCES "payroll_loans"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "payroll_loans_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "payroll_loans_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "payroll_loans_org_number_key" ON "payroll_loans"("organizationId","loanNumber");
CREATE INDEX "payroll_loans_org_status_idx" ON "payroll_loans"("organizationId","status");
CREATE INDEX "payroll_loans_org_employee_idx" ON "payroll_loans"("organizationId","employeeId");
CREATE INDEX "payroll_loans_recovery_start_idx" ON "payroll_loans"("organizationId","recoveryStartDate","status");

CREATE TABLE "payroll_loan_recoveries" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "loanId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "runLineId" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "recoveryDate" DATE NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'POSTED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_loan_recoveries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payroll_loan_recoveries_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "payroll_loan_recoveries_status_check" CHECK ("status" IN ('POSTED','REVERSED')),
  CONSTRAINT "payroll_loan_recoveries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payroll_loan_recoveries_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "payroll_loans"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payroll_loan_recoveries_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payroll_loan_recoveries_runId_fkey" FOREIGN KEY ("runId") REFERENCES "payroll_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payroll_loan_recoveries_runLineId_fkey" FOREIGN KEY ("runLineId") REFERENCES "payroll_run_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "payroll_loan_recoveries_loan_run_key" ON "payroll_loan_recoveries"("loanId","runId");
CREATE INDEX "payroll_loan_recoveries_org_employee_idx" ON "payroll_loan_recoveries"("organizationId","employeeId","recoveryDate");
CREATE INDEX "payroll_loan_recoveries_org_run_idx" ON "payroll_loan_recoveries"("organizationId","runId");

ALTER TABLE "payroll_run_lines"
  ADD COLUMN "loanRecovery" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- Allocate active loan installments only from net pay remaining after statutory/custom deductions
-- and Salary Advance recovery. This prevents a loan installment from creating negative net pay.
CREATE OR REPLACE FUNCTION "chris_apply_active_loan_recovery"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_period_end DATE;
  v_available NUMERIC := 0;
  v_loan_recovery NUMERIC := 0;
  v_loan_items JSONB := '[]'::jsonb;
BEGIN
  SELECT pp."periodEnd"
    INTO v_period_end
    FROM "payroll_runs" pr
    JOIN "payroll_periods" pp
      ON pp."id"=pr."periodId" AND pp."organizationId"=pr."organizationId"
   WHERE pr."id"=NEW."runId" AND pr."organizationId"=NEW."organizationId"
   LIMIT 1;

  IF v_period_end IS NULL THEN
    RETURN NEW;
  END IF;

  v_available := GREATEST(
    0,
    COALESCE(NEW."grossPay",0) -
    COALESCE(NEW."deductions",0) -
    COALESCE(NEW."advanceRecovery",0)
  );

  WITH scheduled AS (
    SELECT
      l."id",
      l."loanNumber",
      l."recoveryStartDate",
      l."disbursedDate",
      LEAST(l."outstandingAmount", l."installmentAmount")::NUMERIC AS scheduled_amount,
      COALESCE(
        SUM(LEAST(l."outstandingAmount", l."installmentAmount")) OVER (
          ORDER BY l."recoveryStartDate", l."disbursedDate", l."id"
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ),
        0
      )::NUMERIC AS prior_scheduled
    FROM "payroll_loans" l
    WHERE l."organizationId"=NEW."organizationId"
      AND l."employeeId"=NEW."employeeId"
      AND l."status"='ACTIVE'
      AND l."outstandingAmount" > 0
      AND l."recoveryStartDate" <= v_period_end
  ), allocated AS (
    SELECT
      "id",
      "loanNumber",
      "recoveryStartDate",
      "disbursedDate",
      GREATEST(
        0,
        LEAST(scheduled_amount, v_available - prior_scheduled)
      )::NUMERIC AS recovery_amount
    FROM scheduled
  )
  SELECT
    COALESCE(SUM(recovery_amount),0),
    COALESCE(
      JSONB_AGG(
        JSONB_BUILD_OBJECT(
          'id', "id",
          'loanNumber', "loanNumber",
          'value', recovery_amount
        )
        ORDER BY "recoveryStartDate", "disbursedDate", "id"
      ) FILTER (WHERE recovery_amount > 0),
      '[]'::jsonb
    )
  INTO v_loan_recovery, v_loan_items
  FROM allocated;

  NEW."loanRecovery" := ROUND(COALESCE(v_loan_recovery,0),2);
  NEW."netPreview" := GREATEST(
    0,
    COALESCE(NEW."grossPay",0) -
    COALESCE(NEW."deductions",0) -
    COALESCE(NEW."advanceRecovery",0) -
    COALESCE(NEW."loanRecovery",0)
  );

  NEW."details" := COALESCE(NEW."details", '{}'::jsonb) || JSONB_BUILD_OBJECT(
    'loanRecoveries', COALESCE(v_loan_items,'[]'::jsonb),
    'loanRecoveryTotal', COALESCE(NEW."loanRecovery",0),
    'recoveryPriority', 'STATUTORY_AND_CUSTOM_DEDUCTIONS_THEN_SALARY_ADVANCE_THEN_LOAN'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "zz_trg_payroll_line_loan_recovery" ON "payroll_run_lines";
CREATE TRIGGER "zz_trg_payroll_line_loan_recovery"
BEFORE INSERT OR UPDATE OF "deductions","advanceRecovery","grossPay","details"
ON "payroll_run_lines"
FOR EACH ROW
EXECUTE FUNCTION "chris_apply_active_loan_recovery"();

-- Include Loan recovery in persisted payroll-run deduction totals.
CREATE OR REPLACE FUNCTION "chris_refresh_payroll_run_totals_from_lines"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_employee_count INTEGER := 0;
  v_gross NUMERIC := 0;
  v_deductions NUMERIC := 0;
  v_net NUMERIC := 0;
BEGIN
  IF COALESCE(NEW."statutoryStatus",'') NOT LIKE 'CALCULATED_NIGERIA%' THEN
    RETURN NEW;
  END IF;

  SELECT
    COUNT(*),
    COALESCE(SUM("grossPay"),0),
    COALESCE(SUM("deductions" + "advanceRecovery" + "loanRecovery"),0),
    COALESCE(SUM("netPreview"),0)
  INTO v_employee_count, v_gross, v_deductions, v_net
  FROM "payroll_run_lines"
  WHERE "organizationId"=NEW."organizationId"
    AND "runId"=NEW."id";

  NEW."employeeCount" := v_employee_count;
  NEW."grossTotal" := v_gross;
  NEW."deductionTotal" := v_deductions;
  NEW."netPreviewTotal" := v_net;
  RETURN NEW;
END;
$$;

-- Post loan recoveries exactly once when a payroll run becomes APPROVED.
-- The unique loanId/runId key and the status-transition guard prevent double recovery.
CREATE OR REPLACE FUNCTION "chris_post_loan_recoveries_on_payroll_approval"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  recovery RECORD;
  v_inserted INTEGER := 0;
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
    CROSS JOIN LATERAL JSONB_ARRAY_ELEMENTS(
      COALESCE(pl."details"->'loanRecoveries','[]'::jsonb)
    ) item
    WHERE pl."organizationId"=NEW."organizationId"
      AND pl."runId"=NEW."id"
  LOOP
    IF recovery.amount <= 0 OR recovery.loan_id IS NULL THEN
      CONTINUE;
    END IF;

    INSERT INTO "payroll_loan_recoveries" (
      "id","organizationId","loanId","employeeId","runId","runLineId","amount","recoveryDate","status"
    )
    SELECT
      md5(
        random()::text ||
        clock_timestamp()::text ||
        l."id" ||
        NEW."id" ||
        recovery.run_line_id
      ),
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
    ON CONFLICT ("loanId","runId") DO NOTHING;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    IF v_inserted > 0 THEN
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
         AND l."organizationId"=NEW."organizationId"
         AND l."id"=recovery.loan_id;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trg_payroll_run_post_loan_recoveries" ON "payroll_runs";
CREATE TRIGGER "trg_payroll_run_post_loan_recoveries"
AFTER UPDATE OF "status"
ON "payroll_runs"
FOR EACH ROW
EXECUTE FUNCTION "chris_post_loan_recoveries_on_payroll_approval"();
