-- ZERMATT opening-loan legacy-history durability correction.
--
-- Release-1 business confirmation remains authoritative:
--   * opening-loan deductions through August 2026 are historical PAID periods;
--   * ZLL000055 and ZLL000185 are the two confirmed August 2026 PAUSED exceptions;
--   * periods after August 2026 must never be inferred as paid merely because time passed.
--
-- The original history migration was necessarily one-time. Opening loans imported after
-- that migration could therefore carry an opening outstanding balance that already
-- reflected August, while the profile had no explicit August legacy-period event and
-- rendered the row as PENDING. This migration performs an idempotent backfill and adds
-- an INSERT trigger so late opening-loan imports receive the same explicit history.

WITH imported AS (
  SELECT
    l."organizationId",
    l."id" AS "loanId",
    l."principalAmount"::numeric AS principal,
    l."installmentAmount"::numeric AS installment,
    DATE_TRUNC('month', l."recoveryStartDate")::date AS start_month,
    e."employeeNumber"
  FROM "payroll_loans" l
  JOIN "organizations" o
    ON o."id" = l."organizationId"
   AND o."slug" = 'zermatt-liquor-limited'
  JOIN "employees" e
    ON e."id" = l."employeeId"
   AND e."organizationId" = l."organizationId"
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
  SELECT *
  FROM months
  WHERE installment_sequence <= term_months
)
INSERT INTO "payroll_loan_legacy_period_events"
  ("id","organizationId","loanId","periodStart","status","amount","reason","source")
SELECT
  md5(e."loanId" || '|' || e.period_start::text || '|OPENING_HISTORY_RECONCILIATION'),
  e."organizationId",
  e."loanId",
  e.period_start,
  CASE
    WHEN e.period_start = DATE '2026-08-01'
     AND e."employeeNumber" IN ('ZLL000055','ZLL000185') THEN 'PAUSED'
    ELSE 'PAID'
  END,
  CASE
    WHEN e.period_start = DATE '2026-08-01'
     AND e."employeeNumber" IN ('ZLL000055','ZLL000185') THEN 0
    ELSE ROUND(
      LEAST(
        e.installment,
        GREATEST(0, e.principal - (e.installment * (e.installment_sequence - 1)))
      )::numeric,
      2
    )
  END,
  CASE
    WHEN e.period_start = DATE '2026-08-01' AND e."employeeNumber"='ZLL000055'
      THEN 'August 2026 loan deduction paused for Onyemowo Comfort Ella per ZERMATT opening-history confirmation.'
    WHEN e.period_start = DATE '2026-08-01' AND e."employeeNumber"='ZLL000185'
      THEN 'August 2026 loan deduction paused for Joy Chinwendu Joseph per ZERMATT opening-history confirmation.'
    ELSE 'Opening-loan deduction confirmed paid through August 2026 during ZERMATT migration reconciliation.'
  END,
  'OPENING_HISTORY_RECONCILIATION'
FROM eligible e
-- Existing explicit history is authoritative. Backfill only genuinely missing months.
ON CONFLICT ("organizationId","loanId","periodStart") DO NOTHING;

CREATE OR REPLACE FUNCTION "chris_seed_zermatt_opening_loan_legacy_history"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_employee_number TEXT;
  v_start_month DATE;
BEGIN
  -- This is intentionally restricted to the controlled opening-loan import marker.
  -- New ordinary loans and top-ups must never manufacture historical paid periods.
  IF NEW."recoveryStartDate" IS NULL
     OR NEW."installmentAmount" IS NULL
     OR NEW."installmentAmount" <= 0
     OR NEW."principalAmount" IS NULL
     OR NEW."principalAmount" <= 0
     OR COALESCE(NEW."notes", '') NOT ILIKE '%Source Reference:%'
     OR DATE_TRUNC('month', NEW."recoveryStartDate")::date > DATE '2026-08-01' THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM "organizations" o
     WHERE o."id" = NEW."organizationId"
       AND o."slug" = 'zermatt-liquor-limited'
  ) THEN
    RETURN NEW;
  END IF;

  SELECT e."employeeNumber"
    INTO v_employee_number
    FROM "employees" e
   WHERE e."id" = NEW."employeeId"
     AND e."organizationId" = NEW."organizationId"
   LIMIT 1;

  IF v_employee_number IS NULL THEN
    RETURN NEW;
  END IF;

  v_start_month := DATE_TRUNC('month', NEW."recoveryStartDate")::date;

  WITH months AS (
    SELECT
      gs::date AS period_start,
      (
        (EXTRACT(YEAR FROM gs)::int * 12 + EXTRACT(MONTH FROM gs)::int)
        - (EXTRACT(YEAR FROM v_start_month)::int * 12 + EXTRACT(MONTH FROM v_start_month)::int)
        + 1
      ) AS installment_sequence
    FROM GENERATE_SERIES(v_start_month, DATE '2026-08-01', INTERVAL '1 month') gs
  ), eligible AS (
    SELECT *
      FROM months
     WHERE installment_sequence <= CEIL(NEW."principalAmount"::numeric / NEW."installmentAmount"::numeric)::int
  )
  INSERT INTO "payroll_loan_legacy_period_events"
    ("id","organizationId","loanId","periodStart","status","amount","reason","source")
  SELECT
    md5(NEW."id" || '|' || e.period_start::text || '|OPENING_IMPORT_RECONCILIATION'),
    NEW."organizationId",
    NEW."id",
    e.period_start,
    CASE
      WHEN e.period_start = DATE '2026-08-01'
       AND v_employee_number IN ('ZLL000055','ZLL000185') THEN 'PAUSED'
      ELSE 'PAID'
    END,
    CASE
      WHEN e.period_start = DATE '2026-08-01'
       AND v_employee_number IN ('ZLL000055','ZLL000185') THEN 0
      ELSE ROUND(
        LEAST(
          NEW."installmentAmount"::numeric,
          GREATEST(
            0,
            NEW."principalAmount"::numeric
              - (NEW."installmentAmount"::numeric * (e.installment_sequence - 1))
          )
        )::numeric,
        2
      )
    END,
    CASE
      WHEN e.period_start = DATE '2026-08-01' AND v_employee_number='ZLL000055'
        THEN 'August 2026 loan deduction paused for Onyemowo Comfort Ella per ZERMATT opening-history confirmation.'
      WHEN e.period_start = DATE '2026-08-01' AND v_employee_number='ZLL000185'
        THEN 'August 2026 loan deduction paused for Joy Chinwendu Joseph per ZERMATT opening-history confirmation.'
      ELSE 'Opening-loan deduction confirmed paid through August 2026 during ZERMATT import reconciliation.'
    END,
    'OPENING_IMPORT_RECONCILIATION'
  FROM eligible e
  ON CONFLICT ("organizationId","loanId","periodStart") DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trg_zermatt_opening_loan_legacy_history" ON "payroll_loans";
CREATE TRIGGER "trg_zermatt_opening_loan_legacy_history"
AFTER INSERT ON "payroll_loans"
FOR EACH ROW
EXECUTE FUNCTION "chris_seed_zermatt_opening_loan_legacy_history"();
