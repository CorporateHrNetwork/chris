-- Zermatt catalogue reconciliation using historical cost-centre codes.
-- Preserves existing employee cost-centre authority and pre-existing department
-- mappings. Creates the three explicitly approved BB Takeaway departments only.
-- Existing codes are authoritative. Conflicts are audited, NEVER overwritten.
-- Because current Supabase may differ from the retained Render snapshot,
-- every operation verifies the live tenant records inside this transaction.

DO $reconcile$
DECLARE
  v_org TEXT;
  entry RECORD;
  v_cost_id TEXT;
  v_cost_status TEXT;
  v_department_id TEXT;
  v_department_code TEXT;
  v_department_active BOOLEAN;
  v_existing_mapping TEXT;
  v_code_owner TEXT;
  v_created JSONB := '[]'::jsonb;
  v_mapped JSONB := '[]'::jsonb;
  v_unresolved JSONB := '[]'::jsonb;
  v_is_takeaway BOOLEAN;
BEGIN
  SELECT id INTO v_org FROM organizations WHERE slug='zermatt-liquor-limited' LIMIT 1;
  -- Empty databases used by the migration-chain CI have no Zermatt tenant.
  IF v_org IS NULL THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('zermatt:20260930:department-cost-centres'));

  FOR entry IN
    SELECT * FROM (VALUES
    ('Accounts & Finance','FIN','FIN-GEN','Accounts & Finance',false),
    ('Audit & Internal Control','AIC','AIC-GEN','Audit & Internal Control',false),
    ('Beer Barn Operations','BBO','BBO-MAIN','Beer Barn - Main Operations',false),
    ('Entertainment','ENT','ENT-GEN','Entertainment',false),
    ('Executive Management','EXEC','EXEC','Executive Office',false),
    ('Facilities Management','FAC','FAC-MNT','Facilities Maintenance',false),
    ('Housekeeping','HSE','HSE-GEN','Housekeeping',true),
    ('Housekeeping & Facilities','HKF','HKF-GEN','Housekeeping & Facilities',false),
    ('Human Resources & Administration','HRA','HRA-GEN','HR & Administration',false),
    ('ICT','ICT','ICT-GEN','ICT',false),
    ('Purchase & Procurement','PROC','PROC','Purchase & Procurement',false),
    ('Security','SEC','SEC','Security Operations',false),
    ('Transport & Logistics','LOG','LOG-GEN','Transport & Logistics',false),
    ('Warehouse & Stores','WHSE','WHSE-GEN','Warehouse & Stores',false),
    ('Zermatt Operations','ZOP','ZOP-MAIN','Zermatt - Main Operations',false),
    ('BB Takeaway','BBT','BBT-GEN','BB Takeaway',true),
    ('BB Takeaway (WSE)','BBT-WSE','BBT-WSE','BB Takeaway - WSE',true),
    ('BB Takeaway (GWP)','BBT-GWP','BBT-GWP','BB Takeaway - GWP',true)
    ) AS mappings(department_name, department_code, cost_code, cost_name, may_create_cost_centre)
  LOOP
    v_is_takeaway := entry.department_code IN ('BBT','BBT-WSE','BBT-GWP');

    v_cost_id := NULL;
    v_cost_status := NULL;
    SELECT id, status::text INTO v_cost_id, v_cost_status
      FROM cost_centres
     WHERE "organizationId"=v_org AND code=entry.cost_code LIMIT 1;

    -- New cost centres are permitted only for clearly identified new takeaways
    -- and standalone Housekeeping. The other 14 mappings MUST reuse existing
    -- live Zermatt accounting records, never silently invent new accounts.
    IF v_cost_id IS NULL AND entry.may_create_cost_centre THEN
      -- Avoid a second code for an existing account with the proposed name.
      SELECT id, status::text INTO v_cost_id, v_cost_status
        FROM cost_centres
       WHERE "organizationId"=v_org AND lower(trim(name))=lower(trim(entry.cost_name))
       ORDER BY CASE WHEN status::text='ACTIVE' THEN 0 ELSE 1 END, "createdAt"
       LIMIT 1;
      IF v_cost_id IS NULL THEN
        v_cost_id := gen_random_uuid()::text;
        INSERT INTO cost_centres
          (id,"organizationId",code,name,description,status,"effectiveFrom","createdAt","updatedAt")
        VALUES (v_cost_id,v_org,entry.cost_code,entry.cost_name,
          'Zermatt department reconciliation: approved '||entry.department_name,
          'ACTIVE',CURRENT_DATE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        ON CONFLICT ("organizationId",code) DO NOTHING;
        SELECT id, status::text INTO v_cost_id, v_cost_status
          FROM cost_centres WHERE "organizationId"=v_org AND code=entry.cost_code LIMIT 1;
        v_created := v_created || jsonb_build_array(
          jsonb_build_object('resource','costCentre','name',entry.cost_name,'code',entry.cost_code));
      END IF;
    END IF;

    IF v_cost_id IS NOT NULL THEN
      DECLARE
        actual_cost_code TEXT;
      BEGIN
        SELECT code INTO actual_cost_code FROM cost_centres
          WHERE id=v_cost_id AND "organizationId"=v_org;
        IF actual_cost_code IS DISTINCT FROM entry.cost_code THEN
          v_unresolved := v_unresolved || jsonb_build_array(
            jsonb_build_object('department',entry.department_name,
              'reason','Reused existing matching Cost Centre name with a different live code',
              'storedCostCentreCode',actual_cost_code,
              'suggestedHistoricalCostCentreCode',entry.cost_code));
        END IF;
      END;
    END IF;
    IF v_cost_id IS NULL OR v_cost_status IS DISTINCT FROM 'ACTIVE' THEN
      v_unresolved := v_unresolved || jsonb_build_array(
        jsonb_build_object('department',entry.department_name,'costCentre',entry.cost_code,
          'reason','Missing or inactive matching Cost Centre in live Supabase'));
      CONTINUE;
    END IF;

    v_department_id := NULL;
    v_department_code := NULL;
    v_existing_mapping := NULL;
    v_department_active := NULL;
    SELECT id,code,"isActive","costCentreId"
      INTO v_department_id,v_department_code,v_department_active,v_existing_mapping
      FROM departments
     WHERE "organizationId"=v_org AND lower(trim(name))=lower(trim(entry.department_name))
     LIMIT 1;

    IF v_department_id IS NULL THEN
      IF NOT v_is_takeaway THEN
        v_unresolved := v_unresolved || jsonb_build_array(
          jsonb_build_object('department',entry.department_name,'reason',
            'No live department record; existing department name requires HR reconciliation'));
        CONTINUE;
      END IF;
      SELECT id INTO v_code_owner FROM departments
       WHERE "organizationId"=v_org AND code=entry.department_code LIMIT 1;
      IF v_code_owner IS NOT NULL THEN
        v_unresolved := v_unresolved || jsonb_build_array(
          jsonb_build_object('department',entry.department_name,'proposedCode',entry.department_code,
            'reason','Department code already belongs to another live department'));
        CONTINUE;
      END IF;
      v_department_id := gen_random_uuid()::text;
      INSERT INTO departments
        (id,"organizationId",name,code,description,"isActive","costCentreId","createdAt","updatedAt")
      VALUES (v_department_id,v_org,entry.department_name,entry.department_code,
         'Approved Zermatt department reconciled with existing Cost Centre '||entry.cost_code,
         TRUE,v_cost_id,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      ON CONFLICT ("organizationId",name) DO NOTHING;
      v_created := v_created || jsonb_build_array(
        jsonb_build_object('resource','department','name',entry.department_name,
          'code',entry.department_code,'costCentre',entry.cost_code));
      CONTINUE;
    END IF;

    IF NOT v_department_active THEN
      v_unresolved := v_unresolved || jsonb_build_array(
        jsonb_build_object('department',entry.department_name,'reason',
          'Existing department is inactive; needs explicit HR reactivation'));
      CONTINUE;
    END IF;

    IF v_department_code IS NULL OR trim(v_department_code)='' THEN
      SELECT id INTO v_code_owner FROM departments
       WHERE "organizationId"=v_org AND code=entry.department_code AND id<>v_department_id LIMIT 1;
      IF v_code_owner IS NULL THEN
        UPDATE departments SET code=entry.department_code,"updatedAt"=CURRENT_TIMESTAMP
         WHERE id=v_department_id AND "organizationId"=v_org;
      ELSE
        v_unresolved := v_unresolved || jsonb_build_array(
          jsonb_build_object('department',entry.department_name,
            'reason','Proposed department code is already assigned elsewhere',
            'proposedCode',entry.department_code));
      END IF;
    ELSIF v_department_code <> entry.department_code THEN
      -- Historical/live authoritative code wins over the retained snapshot.
      v_unresolved := v_unresolved || jsonb_build_array(
        jsonb_build_object('department',entry.department_name,
          'reason','Stored department code differs from suggested historical code; retained stored code',
          'storedCode',v_department_code,'suggestedCode',entry.department_code));
    END IF;

    IF v_existing_mapping IS NULL THEN
      UPDATE departments SET "costCentreId"=v_cost_id,"updatedAt"=CURRENT_TIMESTAMP
       WHERE id=v_department_id AND "organizationId"=v_org AND "costCentreId" IS NULL;
      v_mapped := v_mapped || jsonb_build_array(
        jsonb_build_object('department',entry.department_name,'costCentre',entry.cost_code));
    ELSIF v_existing_mapping<>v_cost_id THEN
      v_unresolved := v_unresolved || jsonb_build_array(
        jsonb_build_object('department',entry.department_name,
          'reason','Existing live Cost Centre mapping preserved; review discrepancy',
          'suggestedCostCentre',entry.cost_code));
    END IF;
  END LOOP;

  -- System-generated immutable reconciliation evidence; no employee, payroll,
  -- designation, or historical Cost Centre assignment is modified.
  INSERT INTO organization_audits
    (id,"organizationId","entityType","entityId",action,"previousValue","newValue",reason,"createdAt")
  VALUES (gen_random_uuid()::text,v_org,'ZermattDepartmentCostCentreReconciliation',
    '20260930-BBT-RECONCILIATION','RECONCILIATION_EXECUTED',NULL,
    jsonb_build_object('created',v_created,'mapped',v_mapped,'unresolved',v_unresolved),
    'Reused pre-existing Zermatt codes where verified live; no existing mappings were overwritten.',
    CURRENT_TIMESTAMP);
END
$reconcile$;
