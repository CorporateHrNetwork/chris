-- HELD: DO NOT EXECUTE BEFORE RELEASE WINDOW, verified backup, and signed-in Head HR/ESS review.
-- ZERMATT-ONLY policy metadata reconciliation: all leave is calendar-day leave,
-- weekends and rostered off-days count, approved public holidays DO NOT count.
-- Existing balances, requests, leave approvals and attendance history are NOT rewritten.
-- Requires updated leaveDayCalculator code to be deployed BEFORE this transaction.
BEGIN;
DO $$
DECLARE
  v_org text;
  v_policy_count integer;
  v_rule_count integer;
BEGIN
  SELECT id INTO STRICT v_org FROM organizations WHERE slug='zermatt-liquor-limited';

  SELECT COUNT(*) INTO v_policy_count FROM leave_policies
  WHERE "organizationId"=v_org AND status='ACTIVE' AND "isActive"=true
    AND code IN ('ZLL-ANNUAL-FT','ZLL-SICK-FT','ZLL-UNPAID-CASUAL-FT',
                 'ZLL-COMPASSIONATE-FT','ZLL-MATERNITY-FT-FEMALE');
  IF v_policy_count <> 5 THEN
    RAISE EXCEPTION 'Expected exactly 5 active Zermatt leave policies; found %',v_policy_count;
  END IF;

  IF EXISTS (
    SELECT 1 FROM leave_policies
    WHERE "organizationId"=v_org AND status='ACTIVE' AND "isActive"=true
      AND code IN ('ZLL-ANNUAL-FT','ZLL-SICK-FT','ZLL-UNPAID-CASUAL-FT',
                   'ZLL-COMPASSIONATE-FT','ZLL-MATERNITY-FT-FEMALE')
      AND (COALESCE("calendarRules"->>'countWeekends','')<>'true'
        OR COALESCE("calendarRules"->>'countPublicHolidays','')<>'false'
        OR COALESCE("entitlementRules"->>'unit','')<>'WORKING_DAYS')
  ) THEN
    RAISE EXCEPTION 'Calendar policy preflight changed; review before update';
  END IF;

  SELECT COUNT(*) INTO v_rule_count FROM leave_entitlement_matrix_rules m
  JOIN leave_policies p ON p.id=m."leavePolicyId"
  WHERE p."organizationId"=v_org AND m."organizationId"=v_org
    AND p.status='ACTIVE' AND p."isActive"=true AND m."isActive"=true
    AND p.code IN ('ZLL-ANNUAL-FT','ZLL-SICK-FT','ZLL-UNPAID-CASUAL-FT',
                   'ZLL-COMPASSIONATE-FT','ZLL-MATERNITY-FT-FEMALE')
    AND m.unit='WORKING_DAYS';
  IF v_rule_count <> 35 THEN
    RAISE EXCEPTION 'Expected exactly 35 active working-day matrix rules; found %',v_rule_count;
  END IF;

  INSERT INTO organization_audits
    (id,"organizationId","actorUserId","entityType","entityId",action,
     "previousValue","newValue",reason,"createdAt")
  SELECT gen_random_uuid()::text,v_org,NULL,'LEAVE_POLICY',p.id,
         'ZERMATT_CALENDAR_DAY_UNIT_METADATA_20261118',
         jsonb_build_object('code',p.code,'entitlementRules',p."entitlementRules",
                            'calendarRules',p."calendarRules"),
         jsonb_build_object('code',p.code,'unit','CALENDAR_DAYS',
                            'countWeekends',true,'countPublicHolidays',false,
                            'activeMatrixRulesConverted',7),
         'HR-confirmed calendar days include weekends and exclude approved public holidays; no leave-ledger rewrite',
         now()
  FROM leave_policies p
  WHERE p."organizationId"=v_org AND p.status='ACTIVE' AND p."isActive"=true
    AND p.code IN ('ZLL-ANNUAL-FT','ZLL-SICK-FT','ZLL-UNPAID-CASUAL-FT',
                   'ZLL-COMPASSIONATE-FT','ZLL-MATERNITY-FT-FEMALE');

  UPDATE leave_policies SET
    "entitlementRules"=jsonb_set("entitlementRules",'{unit}','"CALENDAR_DAYS"'::jsonb,true),
    "updatedAt"=now()
  WHERE "organizationId"=v_org AND status='ACTIVE' AND "isActive"=true
    AND code IN ('ZLL-ANNUAL-FT','ZLL-SICK-FT','ZLL-UNPAID-CASUAL-FT',
                 'ZLL-COMPASSIONATE-FT','ZLL-MATERNITY-FT-FEMALE');
  GET DIAGNOSTICS v_policy_count=ROW_COUNT;
  IF v_policy_count<>5 THEN RAISE EXCEPTION 'Unexpected policy update count: %',v_policy_count; END IF;

  UPDATE leave_entitlement_matrix_rules m
  SET unit='CALENDAR_DAYS',"updatedAt"=now()
  FROM leave_policies p
  WHERE p.id=m."leavePolicyId" AND p."organizationId"=v_org
    AND m."organizationId"=v_org AND p.status='ACTIVE' AND p."isActive"=true
    AND m."isActive"=true AND m.unit='WORKING_DAYS'
    AND p.code IN ('ZLL-ANNUAL-FT','ZLL-SICK-FT','ZLL-UNPAID-CASUAL-FT',
                   'ZLL-COMPASSIONATE-FT','ZLL-MATERNITY-FT-FEMALE');
  GET DIAGNOSTICS v_rule_count=ROW_COUNT;
  IF v_rule_count<>35 THEN RAISE EXCEPTION 'Unexpected matrix update count: %',v_rule_count; END IF;
END $$;
-- After commit verify five policy units, 35 matrix units and calendar flags.
-- This statement must not be used to recalculate or overwrite historical leave ledger balances.
COMMIT;
