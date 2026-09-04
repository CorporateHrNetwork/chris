-- CHRiS ZERMATT payroll policy correction — Part-time statutory treatment
-- Standing ZERMATT rule supplied by the organization:
--   * Part-time payroll basis = 16 days
--   * Part-time employees are not subject to employee statutory deductions
--   * PAYE = 0, employee pension = 0, employer pension = 0, NHF = 0
--   * Employer-only NSITF/ECS and ITF controls remain separate and are never employee deductions
--
-- This migration creates a new effective policy version; it does not rewrite the previous migration.

INSERT INTO "payroll_policy_versions" (
  "id","organizationId","code","name","versionNumber","jurisdiction","effectiveFrom","status",
  "salaryStructure","standardDays","pensionEmployeeRate","pensionEmployerRate","pensionableComponents",
  "payeRules","employerStatutoryRules"
)
SELECT
  'zll-ng-payroll-2026-v2',
  o."id",
  'ZLL-NG-PAYROLL',
  'ZERMATT Nigeria Payroll Policy — Part-time Statutory Exemption',
  2,
  'NG',
  DATE '2026-01-01',
  'ACTIVE',
  '{"basic":57,"housing":11,"transport":10,"meal":9,"medical":8,"utility":5}'::jsonb,
  '{"Full-Time":26,"Part-time":16}'::jsonb,
  8,
  10,
  '["basic","housing","transport"]'::jsonb,
  '{"ruleCode":"NG-NTA-2025-2026","effectiveFrom":"2026-01-01","minimumWageMonthly":70000,"rentReliefRate":20,"rentReliefCap":500000,"statutoryDeductionExemptEmploymentTypes":["Part-time"],"bands":[{"limit":800000,"rate":0},{"limit":2200000,"rate":15},{"limit":9000000,"rate":18},{"limit":13000000,"rate":21},{"limit":25000000,"rate":23},{"limit":null,"rate":25}],"nhf":{"enabled":false,"employeeRate":2.5,"basis":"BASIC","note":"Enable only after employee/applicability data is configured."}}'::jsonb,
  '{"nsitf":{"enabled":true,"employerRate":1,"basis":"TOTAL_PAYROLL","employeeDeduction":false},"itf":{"enabled":true,"employerRate":1,"basis":"ANNUAL_PAYROLL_ACCRUAL","employeeDeduction":false},"pensionParticipationExemptEmploymentTypes":["Part-time"]}'::jsonb
FROM "organizations" o
WHERE o."slug" = 'zermatt-liquor-limited'
ON CONFLICT ("organizationId","code","versionNumber") DO NOTHING;

UPDATE "payroll_policy_versions" pv
SET "status"='RETIRED', "updatedAt"=CURRENT_TIMESTAMP
FROM "organizations" o
WHERE pv."organizationId"=o."id"
  AND o."slug"='zermatt-liquor-limited'
  AND pv."code"='ZLL-NG-PAYROLL'
  AND pv."versionNumber"=1
  AND EXISTS (
    SELECT 1
    FROM "payroll_policy_versions" current_policy
    WHERE current_policy."organizationId"=pv."organizationId"
      AND current_policy."code"='ZLL-NG-PAYROLL'
      AND current_policy."versionNumber"=2
      AND current_policy."status"='ACTIVE'
  );

-- Apply policy-configured employee statutory exemptions at the persisted payroll-line boundary.
-- The application calculates the normal Nigeria statutory values first. The trigger then removes only
-- employee statutory deductions for employment types explicitly exempted by the active tenant policy.
-- Custom deductions, salary advances and employer-only NSITF/ITF are not removed.
CREATE OR REPLACE FUNCTION "chris_apply_payroll_statutory_employment_exemption"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_employment_type TEXT;
  v_paye_rules JSONB := '{}'::jsonb;
  v_employer_rules JSONB := '{}'::jsonb;
  v_exempt BOOLEAN := FALSE;
  v_pension_exempt BOOLEAN := FALSE;
  v_statutory JSONB := '{}'::jsonb;
  v_employee_pension NUMERIC := 0;
  v_employer_pension NUMERIC := 0;
  v_nhf NUMERIC := 0;
  v_paye NUMERIC := 0;
  v_employee_statutory NUMERIC := 0;
  v_nsitf NUMERIC := 0;
  v_itf NUMERIC := 0;
BEGIN
  SELECT
    e."employmentType",
    COALESCE(policy."payeRules", '{}'::jsonb),
    COALESCE(policy."employerStatutoryRules", '{}'::jsonb)
  INTO v_employment_type, v_paye_rules, v_employer_rules
  FROM "employees" e
  JOIN "payroll_runs" pr
    ON pr."id"=NEW."runId" AND pr."organizationId"=NEW."organizationId"
  JOIN "payroll_periods" pp
    ON pp."id"=pr."periodId" AND pp."organizationId"=pr."organizationId"
  LEFT JOIN LATERAL (
    SELECT pv."payeRules", pv."employerStatutoryRules"
    FROM "payroll_policy_versions" pv
    WHERE pv."organizationId"=NEW."organizationId"
      AND pv."status"='ACTIVE'
      AND pv."effectiveFrom" <= pp."periodEnd"
      AND (pv."effectiveTo" IS NULL OR pv."effectiveTo" >= pp."periodEnd")
    ORDER BY pv."effectiveFrom" DESC, pv."versionNumber" DESC
    LIMIT 1
  ) policy ON TRUE
  WHERE e."id"=NEW."employeeId"
    AND e."organizationId"=NEW."organizationId";

  IF v_employment_type IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(
      COALESCE(v_paye_rules->'statutoryDeductionExemptEmploymentTypes', '[]'::jsonb)
    ) AS exempt_type(value)
    WHERE LOWER(TRIM(exempt_type.value))=LOWER(TRIM(v_employment_type))
  ) INTO v_exempt;

  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(
      COALESCE(v_employer_rules->'pensionParticipationExemptEmploymentTypes', '[]'::jsonb)
    ) AS exempt_type(value)
    WHERE LOWER(TRIM(exempt_type.value))=LOWER(TRIM(v_employment_type))
  ) INTO v_pension_exempt;

  IF NOT v_exempt AND NOT v_pension_exempt THEN
    RETURN NEW;
  END IF;

  NEW."details" := COALESCE(NEW."details", '{}'::jsonb);
  v_statutory := COALESCE(NEW."details"->'statutory', '{}'::jsonb);

  v_employee_pension := COALESCE(NULLIF(v_statutory->>'employeePension','')::NUMERIC, 0);
  v_employer_pension := COALESCE(NULLIF(v_statutory->>'employerPension','')::NUMERIC, 0);
  v_nhf := COALESCE(NULLIF(v_statutory->>'nhfEmployee','')::NUMERIC, 0);
  v_paye := COALESCE(NULLIF(v_statutory->>'payeTax','')::NUMERIC, 0);
  v_nsitf := COALESCE(NULLIF(v_statutory->>'nsitfEmployer','')::NUMERIC, 0);
  v_itf := COALESCE(NULLIF(v_statutory->>'itfEmployerAccrual','')::NUMERIC, 0);

  IF v_exempt THEN
    v_employee_statutory := v_employee_pension + v_nhf + v_paye;
    NEW."deductions" := GREATEST(0, COALESCE(NEW."deductions",0) - v_employee_statutory);
    NEW."netPreview" := GREATEST(
      0,
      COALESCE(NEW."grossPay",0) - COALESCE(NEW."deductions",0) - COALESCE(NEW."advanceRecovery",0)
    );
  END IF;

  v_statutory := v_statutory || jsonb_build_object(
    'statutoryEmployeeDeductionExempt', v_exempt,
    'statutoryExemptionEmploymentType', v_employment_type,
    'statutoryExemptionReason', CASE WHEN v_exempt THEN 'ZERMATT_PART_TIME_EMPLOYMENT_POLICY' ELSE NULL END,
    'theoreticalEmployeePensionBeforeExemption', v_employee_pension,
    'theoreticalNhfBeforeExemption', v_nhf,
    'theoreticalPayeBeforeExemption', v_paye,
    'employeePension', CASE WHEN v_exempt THEN 0 ELSE v_employee_pension END,
    'nhfEmployee', CASE WHEN v_exempt THEN 0 ELSE v_nhf END,
    'payeTax', CASE WHEN v_exempt THEN 0 ELSE v_paye END,
    'employerPension', CASE WHEN v_pension_exempt THEN 0 ELSE v_employer_pension END,
    'employerStatutoryCost',
      (CASE WHEN v_pension_exempt THEN 0 ELSE v_employer_pension END) + v_nsitf + v_itf
  );

  NEW."details" := jsonb_set(NEW."details", '{statutory}', v_statutory, TRUE);
  NEW."details" := NEW."details" || jsonb_build_object(
    'statutoryEmploymentExemption',
    CASE
      WHEN v_exempt THEN jsonb_build_object(
        'employmentType', v_employment_type,
        'employeeDeductionsApplied', false,
        'payeApplied', false,
        'employeePensionApplied', false,
        'nhfApplied', false,
        'employerPensionApplied', NOT v_pension_exempt,
        'employerOnlyNsitfItfRemainSeparate', true
      )
      ELSE NULL
    END
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trg_payroll_line_statutory_employment_exemption" ON "payroll_run_lines";
CREATE TRIGGER "trg_payroll_line_statutory_employment_exemption"
BEFORE INSERT OR UPDATE OF "deductions","netPreview","details"
ON "payroll_run_lines"
FOR EACH ROW
EXECUTE FUNCTION "chris_apply_payroll_statutory_employment_exemption"();

-- The application computes run totals before the line-level trigger has adjusted exempt employees.
-- Recalculate totals from persisted lines whenever draft Nigeria totals are written.
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
    COALESCE(SUM("deductions" + "advanceRecovery"),0),
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

DROP TRIGGER IF EXISTS "trg_payroll_run_refresh_persisted_totals" ON "payroll_runs";
CREATE TRIGGER "trg_payroll_run_refresh_persisted_totals"
BEFORE UPDATE OF "employeeCount","grossTotal","deductionTotal","netPreviewTotal","statutoryStatus"
ON "payroll_runs"
FOR EACH ROW
EXECUTE FUNCTION "chris_refresh_payroll_run_totals_from_lines"();
