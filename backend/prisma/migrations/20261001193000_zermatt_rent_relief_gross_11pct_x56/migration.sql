-- Authoritative Zermatt Rent Relief rule:
-- Recorded Rent = Monthly Gross Salary × 11% × 56.
-- Equivalent statutory Rent Relief is then derived from the active PAYE policy
-- (currently configured rate/cap) and made payroll-active automatically.
-- Applies to all current Zermatt employees and future salary-rate changes.

CREATE OR REPLACE FUNCTION zermatt_sync_rent_relief_from_salary()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_slug TEXT;
  v_employee_status TEXT;
  v_tax_year INTEGER;
  v_relief_rate NUMERIC := 20;
  v_relief_cap NUMERIC := 500000;
  v_recorded_rent NUMERIC(18,2);
  v_eligible NUMERIC(18,2);
  v_existing RECORD;
  v_relief_id TEXT;
BEGIN
  SELECT slug INTO v_slug FROM organizations WHERE id = NEW."organizationId" LIMIT 1;
  IF v_slug IS DISTINCT FROM 'zermatt-liquor-limited' THEN
    RETURN NEW;
  END IF;

  IF NEW.status::text <> 'ACTIVE' THEN
    RETURN NEW;
  END IF;

  SELECT e.status::text INTO v_employee_status
    FROM employees e
   WHERE e.id = NEW."employeeId"
     AND e."organizationId" = NEW."organizationId"
   LIMIT 1;

  IF v_employee_status IS NULL OR v_employee_status NOT IN ('ACTIVE','PROBATION','LEAVE','SUSPENDED') THEN
    RETURN NEW;
  END IF;

  v_tax_year := GREATEST(
    2026,
    EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER,
    EXTRACT(YEAR FROM NEW."effectiveFrom")::INTEGER
  );

  SELECT
    COALESCE((pp."payeRules"->>'rentReliefRate')::numeric,20),
    COALESCE((pp."payeRules"->>'rentReliefCap')::numeric,500000)
  INTO v_relief_rate, v_relief_cap
  FROM payroll_policy_versions pp
  WHERE pp."organizationId" = NEW."organizationId"
    AND pp.status='ACTIVE'
    AND pp."effectiveFrom" <= make_date(v_tax_year,12,31)
    AND (pp."effectiveTo" IS NULL OR pp."effectiveTo" >= make_date(v_tax_year,12,31))
  ORDER BY pp."effectiveFrom" DESC, pp."versionNumber" DESC
  LIMIT 1;

  v_recorded_rent := ROUND((NEW.amount::numeric * 0.11) * 56, 2);
  v_eligible := ROUND(LEAST(v_relief_cap, v_recorded_rent * v_relief_rate / 100.0), 2);

  SELECT * INTO v_existing
    FROM payroll_tax_reliefs
   WHERE "organizationId"=NEW."organizationId"
     AND "employeeId"=NEW."employeeId"
     AND "taxYear"=v_tax_year
     AND "reliefType"='RENT'
   LIMIT 1;

  v_relief_id := COALESCE(
    v_existing.id,
    md5(NEW."organizationId"||'|'||NEW."employeeId"||'|'||v_tax_year::text||'|RENT|ZLL-X56')
  );

  INSERT INTO payroll_tax_reliefs (
    id,"organizationId","employeeId","taxYear","reliefType",
    "annualDeclaredAmount","eligibleReliefAmount","evidenceReference",
    status,"declaredByUserId","verifiedByUserId","verifiedAt",
    notes,"createdAt","updatedAt"
  )
  VALUES (
    v_relief_id,
    NEW."organizationId",
    NEW."employeeId",
    v_tax_year,
    'RENT',
    v_recorded_rent,
    v_eligible,
    'CHRIS-SYSTEM-RENT-'||NEW."employeeId"||'-'||v_tax_year::text,
    'VERIFIED',
    NULL,
    NULL,
    CURRENT_TIMESTAMP,
    'System-derived Zermatt Recorded Rent = Monthly Gross × 11% × 56; equivalent Rent Relief applied automatically to payroll.',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT ("organizationId","employeeId","taxYear","reliefType")
  DO UPDATE SET
    "annualDeclaredAmount"=EXCLUDED."annualDeclaredAmount",
    "eligibleReliefAmount"=EXCLUDED."eligibleReliefAmount",
    "evidenceReference"=EXCLUDED."evidenceReference",
    status='VERIFIED',
    "verifiedAt"=CURRENT_TIMESTAMP,
    notes=EXCLUDED.notes,
    "updatedAt"=CURRENT_TIMESTAMP;

  INSERT INTO organization_audits (
    id,"organizationId","actorUserId","entityType","entityId",action,
    "previousValue","newValue",reason,"createdAt"
  )
  VALUES (
    gen_random_uuid()::text,
    NEW."organizationId",
    NULL,
    'PayrollTaxRelief',
    v_relief_id,
    CASE WHEN v_existing.id IS NULL THEN 'SYSTEM_RENT_RELIEF_CREATED' ELSE 'SYSTEM_RENT_RELIEF_RECALCULATED' END,
    CASE WHEN v_existing.id IS NULL THEN NULL ELSE jsonb_build_object(
      'annualDeclaredAmount',v_existing."annualDeclaredAmount",
      'eligibleReliefAmount',v_existing."eligibleReliefAmount",
      'status',v_existing.status
    ) END,
    jsonb_build_object(
      'taxYear',v_tax_year,
      'monthlyGrossSalary',NEW.amount,
      'housingRate',11,
      'multiplier',56,
      'recordedRent',v_recorded_rent,
      'eligibleRentRelief',v_eligible,
      'status','VERIFIED'
    ),
    'Zermatt authoritative Rent Relief synchronization from active payroll salary rate.',
    CURRENT_TIMESTAMP
  );

  UPDATE payroll_runs
     SET "statutoryStatus"='RECALCULATION_REQUIRED',
         "updatedAt"=CURRENT_TIMESTAMP
   WHERE "organizationId"=NEW."organizationId"
     AND status IN ('DRAFT','REJECTED')
     AND COALESCE("statutoryStatus",'') <> 'RECALCULATION_REQUIRED';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_zermatt_sync_rent_relief_from_salary ON payroll_salary_rates;
CREATE TRIGGER trg_zermatt_sync_rent_relief_from_salary
AFTER INSERT OR UPDATE OF amount,status,"effectiveFrom","effectiveTo"
ON payroll_salary_rates
FOR EACH ROW
EXECUTE FUNCTION zermatt_sync_rent_relief_from_salary();

DO $backfill$
DECLARE
  v_org TEXT;
  v_policy RECORD;
  r RECORD;
  v_recorded_rent NUMERIC(18,2);
  v_eligible NUMERIC(18,2);
  v_existing RECORD;
  v_relief_id TEXT;
  v_changed INTEGER := 0;
BEGIN
  SELECT id INTO v_org FROM organizations WHERE slug='zermatt-liquor-limited' LIMIT 1;
  IF v_org IS NULL THEN RETURN; END IF;

  SELECT
    COALESCE((pp."payeRules"->>'rentReliefRate')::numeric,20) AS relief_rate,
    COALESCE((pp."payeRules"->>'rentReliefCap')::numeric,500000) AS relief_cap
  INTO v_policy
  FROM payroll_policy_versions pp
  WHERE pp."organizationId"=v_org
    AND pp.status='ACTIVE'
    AND pp."effectiveFrom" <= DATE '2026-12-31'
    AND (pp."effectiveTo" IS NULL OR pp."effectiveTo" >= DATE '2026-12-31')
  ORDER BY pp."effectiveFrom" DESC, pp."versionNumber" DESC
  LIMIT 1;

  FOR r IN
    SELECT DISTINCT ON (e.id)
      e.id AS employee_id,
      e."employeeNumber",
      sr.amount,
      sr.currency,
      sr."effectiveFrom"
    FROM employees e
    JOIN payroll_salary_rates sr
      ON sr."organizationId"=e."organizationId"
     AND sr."employeeId"=e.id
     AND sr.status='ACTIVE'
     AND sr."effectiveFrom" <= CURRENT_DATE
     AND (sr."effectiveTo" IS NULL OR sr."effectiveTo" >= CURRENT_DATE)
    WHERE e."organizationId"=v_org
      AND e.status::text IN ('ACTIVE','PROBATION','LEAVE','SUSPENDED')
    ORDER BY e.id,sr."effectiveFrom" DESC
  LOOP
    v_recorded_rent := ROUND((r.amount::numeric * 0.11) * 56,2);
    v_eligible := ROUND(LEAST(v_policy.relief_cap, v_recorded_rent * v_policy.relief_rate / 100.0),2);

    SELECT * INTO v_existing
      FROM payroll_tax_reliefs
     WHERE "organizationId"=v_org
       AND "employeeId"=r.employee_id
       AND "taxYear"=2026
       AND "reliefType"='RENT'
     LIMIT 1;

    v_relief_id := COALESCE(
      v_existing.id,
      md5(v_org||'|'||r.employee_id||'|2026|RENT|ZLL-X56')
    );

    INSERT INTO payroll_tax_reliefs (
      id,"organizationId","employeeId","taxYear","reliefType",
      "annualDeclaredAmount","eligibleReliefAmount","evidenceReference",
      status,"declaredByUserId","verifiedByUserId","verifiedAt",
      notes,"createdAt","updatedAt"
    )
    VALUES (
      v_relief_id,v_org,r.employee_id,2026,'RENT',
      v_recorded_rent,v_eligible,
      'CHRIS-SYSTEM-RENT-'||r."employeeNumber"||'-2026',
      'VERIFIED',NULL,NULL,CURRENT_TIMESTAMP,
      'System-derived Zermatt Recorded Rent = Monthly Gross × 11% × 56; equivalent Rent Relief applied automatically to payroll.',
      CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
    )
    ON CONFLICT ("organizationId","employeeId","taxYear","reliefType")
    DO UPDATE SET
      "annualDeclaredAmount"=EXCLUDED."annualDeclaredAmount",
      "eligibleReliefAmount"=EXCLUDED."eligibleReliefAmount",
      "evidenceReference"=EXCLUDED."evidenceReference",
      status='VERIFIED',
      "verifiedAt"=CURRENT_TIMESTAMP,
      notes=EXCLUDED.notes,
      "updatedAt"=CURRENT_TIMESTAMP;

    INSERT INTO organization_audits (
      id,"organizationId","actorUserId","entityType","entityId",action,
      "previousValue","newValue",reason,"createdAt"
    )
    VALUES (
      gen_random_uuid()::text,v_org,NULL,'PayrollTaxRelief',v_relief_id,
      CASE WHEN v_existing.id IS NULL THEN 'SYSTEM_RENT_RELIEF_CREATED_X56' ELSE 'SYSTEM_RENT_RELIEF_CORRECTED_X56' END,
      CASE WHEN v_existing.id IS NULL THEN NULL ELSE jsonb_build_object(
        'annualDeclaredAmount',v_existing."annualDeclaredAmount",
        'eligibleReliefAmount',v_existing."eligibleReliefAmount",
        'status',v_existing.status
      ) END,
      jsonb_build_object(
        'employeeNumber',r."employeeNumber",
        'monthlyGrossSalary',r.amount,
        'housingRate',11,
        'multiplier',56,
        'recordedRent',v_recorded_rent,
        'eligibleRentRelief',v_eligible,
        'status','VERIFIED'
      ),
      'Corrected Zermatt Rent Relief rule from prior ×12 basis to Gross × 11% × 56.',
      CURRENT_TIMESTAMP
    );
    v_changed := v_changed + 1;
  END LOOP;

  UPDATE payroll_runs
     SET "statutoryStatus"='RECALCULATION_REQUIRED',
         "updatedAt"=CURRENT_TIMESTAMP
   WHERE "organizationId"=v_org
     AND status IN ('DRAFT','REJECTED')
     AND COALESCE("statutoryStatus",'') <> 'RECALCULATION_REQUIRED';

  INSERT INTO organization_audits (
    id,"organizationId","actorUserId","entityType","entityId",action,
    "previousValue","newValue",reason,"createdAt"
  )
  VALUES (
    gen_random_uuid()::text,v_org,NULL,'PayrollRentReliefPolicy',
    'ZLL-RENT-RELIEF-2026-X56','RENT_RELIEF_RULE_CORRECTED',
    jsonb_build_object('previousFormula','Monthly Gross × 11% × 12'),
    jsonb_build_object(
      'formula','Monthly Gross × 11% × 56',
      'taxYear',2026,
      'employeesSynchronized',v_changed,
      'payrollApplication','AUTO_VERIFIED_DIRECT'
    ),
    'Authoritative Zermatt Rent Relief rule correction applied organization-wide.',
    CURRENT_TIMESTAMP
  );
END
$backfill$;
