-- Explicit HR confirmation: seven proposed managers plus Poku Nelson for Umar Muhammad.
-- The General Manager's assignment and scorecard are left untouched.
DO $confirmed$
DECLARE
 org text; ref constant text := 'ZLL-ROLE-MANAGERS-CONFIRMED-20261029';
 stamp timestamptz := now(); pair record; employee record; manager record; review record; cycle record;
 assignment_id text; revision_no int; new_value jsonb; assigned_ids text[] := '{}';
 would_cycle boolean; old_assignment_hash text; old_assignment_ids text[]; applied int := 0;
BEGIN
 SELECT id INTO STRICT org FROM organizations WHERE slug='zermatt-liquor-limited' AND status='ACTIVE';
 PERFORM pg_advisory_xact_lock(hashtext('chris-pe:'||org));
 IF EXISTS(SELECT 1 FROM organization_audits WHERE "organizationId"=org AND "entityType"='ZermattRoleProfileProvisioning' AND "entityId"=ref AND action='CONFIRMED_ROLE_MANAGERS_APPLIED') THEN RETURN; END IF;
 SELECT array_agg(id),md5(COALESCE(string_agg(to_jsonb(a)::text,'' ORDER BY id),'')) INTO old_assignment_ids,old_assignment_hash
  FROM employee_line_manager_assignments a WHERE "organizationId"=org;
 FOR pair IN SELECT * FROM (VALUES
  ('ZLL000146','ZLL000044'),('ZLL000181','ZLL000044'),('ZLL000244','ZLL000092'),('ZLL000260','ZLL000044'),
  ('ZLL000261','ZLL000044'),('ZLL000322','ZLL000013'),('ZLL000332','ZLL000183'),('ZLL000334','ZLL000092')
 ) v(employee_no,manager_no) LOOP
  SELECT * INTO STRICT employee FROM employees WHERE "organizationId"=org AND "employeeNumber"=pair.employee_no FOR UPDATE;
  SELECT * INTO STRICT manager FROM employees WHERE "organizationId"=org AND "employeeNumber"=pair.manager_no FOR KEY SHARE;
  IF employee.id=manager.id OR employee.status NOT IN('ACTIVE','PROBATION','LEAVE') OR manager.status NOT IN('ACTIVE','PROBATION','LEAVE') OR employee."exitDate" IS NOT NULL OR manager."exitDate" IS NOT NULL
   OR employee."locationId" IS DISTINCT FROM manager."locationId" THEN RAISE EXCEPTION 'Unavailable, self or cross-branch manager for %',pair.employee_no; END IF;
  IF EXISTS(SELECT 1 FROM employee_line_manager_assignments WHERE "organizationId"=org AND "employeeId"=employee.id AND "effectiveTo" IS NULL) THEN RAISE EXCEPTION 'Reporting line changed since HR confirmation for %',pair.employee_no; END IF;
  WITH RECURSIVE chain AS(
   SELECT manager.id AS id,ARRAY[employee.id] AS path,false AS cycle
   UNION ALL SELECT a."managerEmployeeId",c.path||c.id,c.id=ANY(c.path) FROM chain c JOIN employee_line_manager_assignments a ON a."employeeId"=c.id AND a."organizationId"=org AND a."effectiveTo" IS NULL WHERE NOT c.cycle AND cardinality(c.path)<500
  ) SELECT COALESCE(bool_or(c.id=employee.id OR c.cycle),false) INTO would_cycle FROM chain c;
  IF would_cycle THEN RAISE EXCEPTION 'Reporting cycle for %',pair.employee_no; END IF;
  SELECT * INTO STRICT review FROM organization_audits WHERE "organizationId"=org AND "entityType"='ZermattPerformanceEvaluation' AND "entityId"='review:2026-Q4:'||employee.id ORDER BY ("newValue"->>'revision')::int DESC LIMIT 1;
  IF review."newValue"->>'status' NOT IN('GOALS_PUBLISHED','SELF_REVIEW_PENDING','MANAGER_PENDING') OR review."newValue"->>'managerEmployeeId' IS NOT NULL OR NULLIF(review."newValue"->>'managerAssessment','null') IS NOT NULL OR NULLIF(review."newValue"->>'finalScore','null') IS NOT NULL THEN RAISE EXCEPTION 'Scorecard changed and requires review for %',pair.employee_no; END IF;
  assignment_id:=gen_random_uuid();
  INSERT INTO employee_line_manager_assignments(id,"organizationId","employeeId","managerEmployeeId","effectiveFrom",reason,notes,"performedByUserId","createdAt","updatedAt")
   VALUES(assignment_id,org,employee.id,manager.id,stamp,'Explicit HR confirmation of line manager',ref,NULL,stamp,stamp);
  INSERT INTO organization_audits(id,"organizationId","actorUserId","entityType","entityId",action,"newValue",reason,"createdAt") VALUES
   (gen_random_uuid(),org,NULL,'EmployeeLineManagerAssignment',assignment_id,'LINE_MANAGER_HIERARCHY_OVERRIDE_ASSIGNED',jsonb_build_object('employeeId',employee.id,'employeeNumber',employee."employeeNumber",'managerEmployeeId',manager.id,'managerEmployeeNumber',manager."employeeNumber",'effectiveFrom',stamp,'hierarchyOverride',true,'hierarchyOverrideReason','HR explicitly confirmed the named manager after reviewing ambiguous hierarchy candidates','reference',ref),
    'User confirmed seven proposed mappings and specifically selected Poku Nelson for Umar Muhammad; General Manager excluded from this operation',stamp);
  revision_no:=(review."newValue"->>'revision')::int+1;
  new_value:=review."newValue"||jsonb_build_object('managerEmployeeId',manager.id,'managerMappingRequired',false,'managerMappingReference',ref,'managerAssignedAt',stamp,'revision',revision_no,'updatedAt',stamp);
  INSERT INTO organization_audits(id,"organizationId","actorUserId","entityType","entityId",action,"previousValue","newValue",reason,"createdAt") VALUES
   (gen_random_uuid(),org,NULL,'ZermattPerformanceEvaluation',review."entityId",'PE_REVIEW',jsonb_build_object('managerEmployeeId',review."newValue"->'managerEmployeeId','revision',review."newValue"->'revision'),new_value,'HR-confirmed manager linked to the existing scorecard; goals, dates, drafts, self-assessments and results preserved; '||ref,stamp);
  assigned_ids:=array_append(assigned_ids,employee.id); applied:=applied+1;
 END LOOP;
 SELECT * INTO STRICT cycle FROM organization_audits WHERE "organizationId"=org AND "entityType"='ZermattPerformanceEvaluation' AND "entityId"='cycle:2026-Q4' ORDER BY ("newValue"->>'revision')::int DESC LIMIT 1;
 new_value:=cycle."newValue"||jsonb_build_object('exceptions',COALESCE((SELECT jsonb_agg(x) FROM jsonb_array_elements(cycle."newValue"->'exceptions') x WHERE NOT (x->>'employeeId')=ANY(assigned_ids)),'[]'::jsonb),'revision',(cycle."newValue"->>'revision')::int+1,'updatedAt',stamp,'managerResolutionReference',ref);
 INSERT INTO organization_audits(id,"organizationId","actorUserId","entityType","entityId",action,"newValue",reason,"createdAt") VALUES
  (gen_random_uuid(),org,NULL,'ZermattPerformanceEvaluation',cycle."entityId",'PE_CYCLE',new_value,'Removed eight resolved reporting exceptions; General Manager left unassigned as instructed; '||ref,stamp);
 IF old_assignment_hash IS DISTINCT FROM (SELECT md5(COALESCE(string_agg(to_jsonb(a)::text,'' ORDER BY id),'')) FROM employee_line_manager_assignments a WHERE "organizationId"=org AND id=ANY(old_assignment_ids)) THEN RAISE EXCEPTION 'Existing reporting lines changed'; END IF;
 INSERT INTO organization_audits(id,"organizationId","actorUserId","entityType","entityId",action,"newValue",reason,"createdAt") VALUES
  (gen_random_uuid(),org,NULL,'ZermattRoleProfileProvisioning',ref,'CONFIRMED_ROLE_MANAGERS_APPLIED',jsonb_build_object('reference',ref,'assignments',applied,'employeeIds',to_jsonb(assigned_ids),'generalManagerUnchanged',true,'existingReportingLinesUnchanged',true),'Explicit user-confirmed reporting assignments synchronized with existing ESS/manager scorecards; no payroll or loan tables written',stamp);
END
$confirmed$;
