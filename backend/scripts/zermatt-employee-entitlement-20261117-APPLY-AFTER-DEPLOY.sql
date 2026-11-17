-- HOLD: Do not execute before application code, payroll, ESS and leave checks are verified.
-- Zermatt Live employee classification change: effective 17 November 2026.
-- This script is intentionally separate from automatic Prisma migrations.
-- MUST first confirm an off-site backup and an approved compliance basis.
BEGIN;

DO $$
DECLARE
  v_org text;
  v_count integer;
BEGIN
  SELECT id INTO STRICT v_org
  FROM organizations WHERE slug='zermatt-liquor-limited';

  SELECT COUNT(*) INTO v_count FROM employees
  WHERE "organizationId"=v_org
    AND "employmentType"='Part-time'
    AND "employeeNumber" IN ('ZLL000046','ZLL000053')
    AND (
      ("employeeNumber"='ZLL000046' AND "firstName"='Kpokou' AND "lastName"='Michael')
      OR
      ("employeeNumber"='ZLL000053' AND "firstName"='Uchenna' AND "middleName"='Michael' AND "lastName"='Ubagwu')
    );
  IF v_count<>2 THEN
    RAISE EXCEPTION 'Zermatt identity/classification preflight failed: found %, expected 2',v_count;
  END IF;

  INSERT INTO organization_audits
    (id,"organizationId","actorUserId","entityType","entityId",action,"previousValue","newValue",reason,"createdAt")
  SELECT gen_random_uuid()::text,v_org,NULL,'EMPLOYEE',e.id,
    'ZERMATT_FULL_TIME_STATUTORY_EXCEPTION_20261117',
    jsonb_build_object('employmentType',e."employmentType"),
    jsonb_build_object('employmentType','Full-Time','effectiveFrom','2026-11-17',
      'statutoryDeductionExempt',true,
      'employeeNumber',e."employeeNumber"),
    'Authorized HR instruction: full-time employment and full-time benefits, with separately recorded statutory exemption',
    now()
  FROM employees e
  WHERE e."organizationId"=v_org AND e."employeeNumber" IN ('ZLL000046','ZLL000053');

  UPDATE employees SET "employmentType"='Full-Time',"updatedAt"=now()
  WHERE "organizationId"=v_org AND "employeeNumber" IN ('ZLL000046','ZLL000053');

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count<>2 THEN
    RAISE EXCEPTION 'Employee update must affect exactly two records, affected %',v_count;
  END IF;
END $$;

-- No approved payrolls, historical salaries, leave balances or settlements are rewritten.
COMMIT;
