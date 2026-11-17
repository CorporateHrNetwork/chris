-- HOLD: Do not execute before application code, payroll, ESS and leave checks are verified.
-- Zermatt Live employee classification change: effective 17 November 2026.
-- This script is intentionally separate from automatic Prisma migrations.
-- HR confirmed in chat: statutory deduction exemptions approved by Zermatt on 17 November 2026.
-- Full-Time employment classification effective 17 November 2026.
-- PAYE/employee pension/NHF exemption applies to the full November 2026 payroll period from 1 November.
-- MUST first confirm an off-site backup, payroll trigger consistency and leave provisioning readiness.
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
      'statutoryExemptionEffectiveFrom','2026-11-01',
      'statutoryExemptionAuthorizedBy','ZERMATT_HR_APPROVAL',
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

  -- Individual grade override: Uchenna Michael Ubagwu is L1 (internal V3 201).
  -- Kpokou Michael remains at designation-default L2 (internal V3 202).
  -- Do not globally reclassify the Facilities Maintenance Officer designation.
  IF NOT EXISTS (
    SELECT 1 FROM organization_employment_levels
    WHERE "organizationId"=v_org AND "levelNumber"=201 AND code='L1' AND "isActive"=true
  ) THEN
    RAISE EXCEPTION 'Zermatt active L1 mapping (201) is not configured';
  END IF;
  IF EXISTS (
    SELECT 1 FROM employee_employment_level_assignments a
    JOIN employees e ON e.id=a."employeeId"
    WHERE e."organizationId"=v_org AND e."employeeNumber"='ZLL000053'
  ) THEN
    RAISE EXCEPTION 'Uchenna already has level assignment history; manual review is required';
  END IF;
  INSERT INTO employee_employment_level_assignments
    (id,"organizationId","employeeId","levelNumber","effectiveFrom","effectiveTo",reason,notes,"performedByUserId","createdAt","updatedAt")
  SELECT gen_random_uuid()::text,v_org,e.id,201,'2026-11-17'::timestamp,NULL,
    'HR-approved employee-specific L1 classification effective 17 November 2026',
    'Full 14-calendar-day annual leave in 2026; no proration; leave ledger provisioned separately',NULL,now(),now()
  FROM employees e WHERE e."organizationId"=v_org AND e."employeeNumber"='ZLL000053';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count<>1 THEN
    RAISE EXCEPTION 'Expected exactly one employee level override, inserted %',v_count;
  END IF;
  INSERT INTO organization_audits
    (id,"organizationId","actorUserId","entityType","entityId",action,"previousValue","newValue",reason,"createdAt")
  SELECT gen_random_uuid()::text,v_org,NULL,'EmployeeEmploymentLevelAssignment',a.id,
    'EMPLOYEE_EMPLOYMENT_LEVEL_OVERRIDE_ASSIGNED',
    jsonb_build_object('levelNumber',202,'code','L2','source','DESIGNATION_DEFAULT'),
    jsonb_build_object('levelNumber',201,'code','L1','source','EMPLOYEE_OVERRIDE','effectiveFrom','2026-11-17',
      'annualEntitlementDays2026',14,'proration','NONE'),
    'HR approval: Michael Uchenna moves to L1 with full 14-day annual leave in 2026',now()
  FROM employee_employment_level_assignments a
  JOIN employees e ON e.id=a."employeeId"
  WHERE e."organizationId"=v_org AND e."employeeNumber"='ZLL000053'
    AND a."levelNumber"=201 AND a."effectiveFrom"='2026-11-17'::timestamp;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count<>1 THEN
    RAISE EXCEPTION 'Expected exactly one level override audit, inserted %',v_count;
  END IF;
END $$;

-- No approved payrolls, historical salaries, leave balances or settlements are rewritten.
COMMIT;
