-- Run only after all catalog batches for this reference have been prepared.
-- One atomic, idempotent, tenant-locked rollout; no payroll or assessment outcomes are changed.
DO $rollout$
DECLARE
 org text; ref constant text := 'ZLL-ROLE-PROFILES-20261029'; stamp timestamptz := now();
 today text := to_char(now() AT TIME ZONE 'Africa/Lagos','YYYY-MM-DD');
 year_no int := extract(year FROM now() AT TIME ZONE 'Africa/Lagos');
 quarter_no int := extract(quarter FROM now() AT TIME ZONE 'Africa/Lagos');
 quarter_end date; cycle_key text; cycle_id text; policy jsonb; profiles jsonb; item jsonb;
 role record; old_template record; employee record; assignment record; latest record;
 next_value jsonb; old_value jsonb; template_id text; review_id text; manager_id text;
 candidate_ids text[]; assignment_id text; has_cycle boolean; exceptions jsonb := '[]';
 role_count int := 0; review_count int := 0; mapped_count int := 0;
 payroll_before text; lines_before text; loans_before text; assignments_before text; existing_assignment_ids text[];
BEGIN
 SELECT id INTO STRICT org FROM organizations WHERE slug='zermatt-liquor-limited' AND status='ACTIVE';
 PERFORM pg_advisory_xact_lock(hashtext('chris-pe:'||org));
 IF EXISTS(SELECT 1 FROM organization_audits WHERE "organizationId"=org AND "entityType"='ZermattRoleProfileProvisioning' AND "entityId"=ref AND action='ZERMATT_ROLE_PROFILES_PROVISIONED') THEN RETURN; END IF;
 SELECT md5(COALESCE(string_agg(to_jsonb(x)::text,'' ORDER BY x.id),'')) INTO payroll_before FROM payroll_runs x WHERE "organizationId"=org;
 SELECT md5(COALESCE(string_agg(to_jsonb(x)::text,'' ORDER BY x.id),'')) INTO lines_before FROM payroll_run_lines x WHERE "organizationId"=org;
 SELECT array_agg(id) INTO existing_assignment_ids FROM employee_line_manager_assignments WHERE "organizationId"=org AND "effectiveTo" IS NULL;
 SELECT md5(COALESCE(string_agg(to_jsonb(x)::text,'' ORDER BY x.id),'')) INTO loans_before FROM payroll_loans x WHERE "organizationId"=org;
 SELECT md5(COALESCE(string_agg(to_jsonb(x)::text,'' ORDER BY x.id),'')) INTO assignments_before FROM employee_line_manager_assignments x WHERE "organizationId"=org AND "effectiveTo" IS NULL;
 SELECT jsonb_agg(p.value) INTO profiles FROM organization_audits a CROSS JOIN LATERAL jsonb_array_elements(a."newValue"->'profiles') p
 WHERE a."organizationId"=org AND a."entityType"='ZermattRoleProfileProvisioning' AND a.action='ROLE_PROFILE_BATCH_PREPARED' AND a."newValue"->>'reference'=ref;
 IF jsonb_array_length(profiles) IS DISTINCT FROM 120 OR
   (SELECT count(DISTINCT p->>'name') FROM jsonb_array_elements(profiles) p)<>120 OR
   (SELECT count(*) FROM designations WHERE "organizationId"=org AND "isActive")<>120 THEN
   RAISE EXCEPTION 'Prepared catalog is incomplete or the active designation register changed';
 END IF;
 SELECT "newValue" INTO policy FROM organization_audits WHERE "organizationId"=org AND "entityType"='ZermattPerformanceEvaluation' AND "entityId"='policy' ORDER BY ("newValue"->>'revision')::int DESC LIMIT 1;
 IF policy IS NULL THEN RAISE EXCEPTION 'A published performance policy is required'; END IF;
 quarter_end := (make_date(year_no,(quarter_no-1)*3+1,1)+interval '3 months -1 day')::date;
 cycle_key := year_no||'-Q'||quarter_no; cycle_id := 'cycle:'||cycle_key;
 FOR item IN SELECT value FROM jsonb_array_elements(profiles) LOOP
  IF item->>'catalogVersion' IS DISTINCT FROM 'ZLL-JD-GOALS-2026.1' OR jsonb_array_length(item->'goals') IS DISTINCT FROM 5 OR NULLIF(item->>'description','') IS NULL OR (item#>>'{jobDescription,title}') IS DISTINCT FROM (item->>'name')
   OR (SELECT sum((g->>'weight')::numeric) FROM jsonb_array_elements(item->'goals') g WHERE g->>'category'='results') IS DISTINCT FROM 60
   OR (SELECT sum((g->>'weight')::numeric) FROM jsonb_array_elements(item->'goals') g WHERE g->>'category'='quality') IS DISTINCT FROM 20
   OR (SELECT sum((g->>'weight')::numeric) FROM jsonb_array_elements(item->'goals') g WHERE g->>'category'='teamwork') IS DISTINCT FROM 20
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(item->'goals') g WHERE jsonb_array_length(g->'anchors') IS DISTINCT FROM 5) THEN RAISE EXCEPTION 'Invalid prepared role standard'; END IF;
  SELECT d.* INTO STRICT role FROM designations d WHERE d."organizationId"=org AND d.name=item->>'name' AND d."isActive";
  IF NULLIF(btrim(role.description),'') IS NOT NULL AND role.description<>item->>'description' THEN
   RAISE EXCEPTION 'A pre-existing job description requires preservation and review: %',role.name;
  END IF;
  SELECT a.* INTO old_template FROM organization_audits a WHERE a."organizationId"=org AND a."entityType"='ZermattPerformanceEvaluation' AND a."newValue"->>'kind'='template' AND a."newValue"->>'roleId'=role.id
   ORDER BY (a."newValue"->>'revision')::int DESC,a."createdAt" DESC,a.id DESC LIMIT 1;
  IF old_template."newValue"->>'status'='PUBLISHED' THEN RAISE EXCEPTION 'Published standard already exists: %',role.name; END IF;
  template_id := COALESCE(old_template."entityId",'template:'||role.id||':'||gen_random_uuid());
  next_value := COALESCE(old_template."newValue",'{}') || (item-'name') || jsonb_build_object(
   'kind','template','id',template_id,'roleId',role.id,'roleName',role.name,'source','MANAGEMENT_DIRECTED_ROLE_STANDARD',
   'status','PUBLISHED','version',COALESCE((old_template."newValue"->>'version')::int,1),'revision',COALESCE((old_template."newValue"->>'revision')::int,0)+1,
   'allowSelfReviewWithoutManager',true,'publishedAt',stamp,'updatedAt',stamp,'publishedBy',NULL,
   'publicationAuthority','Explicit HR instruction to generate, set and provision role job descriptions and goals; technical rollout reference '||ref);
  UPDATE designations SET description=item->>'description',"updatedAt"=stamp WHERE id=role.id AND "organizationId"=org;
  INSERT INTO organization_audits(id,"organizationId","actorUserId","entityType","entityId",action,"previousValue","newValue",reason,"createdAt") VALUES
   (gen_random_uuid(),org,NULL,'Designation',role.id,'ROLE_JOB_DESCRIPTION_PROVISIONED',jsonb_build_object('description',role.description),jsonb_build_object('description',item->>'description','reference',ref),'Management-directed role job description; no employment terms or system permissions changed',stamp),
   (gen_random_uuid(),org,NULL,'ZermattPerformanceEvaluation',template_id,'PE_TEMPLATE',old_template."newValue",next_value,'Management-directed publication of prospective role-specific goals and expectations; '||ref,stamp);
  role_count:=role_count+1;
 END LOOP;
 -- Fill only vacant, unambiguous reporting lines using the existing designation hierarchy and branch/department ranking.
 FOR employee IN SELECT e.* FROM employees e WHERE e."organizationId"=org AND e.status IN('ACTIVE','PROBATION','LEAVE') AND e."exitDate" IS NULL
  AND NOT EXISTS(SELECT 1 FROM employee_line_manager_assignments a WHERE a."organizationId"=org AND a."employeeId"=e.id AND a."effectiveTo" IS NULL) ORDER BY e."employeeNumber" LOOP
  WITH RECURSIVE chain AS(
   SELECT d."reportsToDesignationId" AS role_id,1 AS hops,ARRAY[d.id] AS path FROM designations d WHERE d.id=employee."designationId" AND d."organizationId"=org
   UNION ALL SELECT d."reportsToDesignationId",c.hops+1,c.path||d.id FROM chain c JOIN designations d ON d.id=c.role_id AND d."organizationId"=org WHERE NOT d.id=ANY(c.path) AND c.hops<30
  ), candidates AS(
   SELECT m.id,c.hops,(CASE WHEN m."locationId"=employee."locationId" THEN 100 ELSE 0 END+CASE WHEN m."departmentId"=employee."departmentId" THEN 20 ELSE 0 END) AS score
   FROM chain c JOIN employees m ON m."designationId"=c.role_id AND m."organizationId"=org AND m.id<>employee.id AND m.status IN('ACTIVE','PROBATION','LEAVE') AND m."exitDate" IS NULL
  ), nearest AS(SELECT *,min(hops) OVER() AS first_hop FROM candidates), ranked AS(SELECT *,max(score) OVER() AS top_score FROM nearest WHERE hops=first_hop)
  SELECT array_agg(id) INTO candidate_ids FROM ranked WHERE score=top_score;
  IF cardinality(candidate_ids) IS DISTINCT FROM 1 THEN CONTINUE; END IF;
  manager_id:=candidate_ids[1];
  WITH RECURSIVE reporting AS(
   SELECT manager_id AS id,ARRAY[employee.id] AS path,false AS cycle
   UNION ALL SELECT a."managerEmployeeId",r.path||r.id,r.id=ANY(r.path) FROM reporting r JOIN employee_line_manager_assignments a ON a."employeeId"=r.id AND a."organizationId"=org AND a."effectiveTo" IS NULL WHERE NOT r.cycle AND cardinality(r.path)<500
  ) SELECT COALESCE(bool_or(id=employee.id OR cycle),false) INTO has_cycle FROM reporting;
  IF has_cycle THEN CONTINUE; END IF;
  assignment_id:=gen_random_uuid();
  INSERT INTO employee_line_manager_assignments(id,"organizationId","employeeId","managerEmployeeId","effectiveFrom",reason,notes,"performedByUserId","createdAt","updatedAt")
   VALUES(assignment_id,org,employee.id,manager_id,stamp,'Unambiguous designation-hierarchy mapping for role performance rollout',ref,NULL,stamp,stamp);
  INSERT INTO organization_audits(id,"organizationId","actorUserId","entityType","entityId",action,"newValue",reason,"createdAt") VALUES
   (gen_random_uuid(),org,NULL,'EmployeeLineManagerAssignment',assignment_id,'LINE_MANAGER_ASSIGNED',jsonb_build_object('employeeId',employee.id,'managerEmployeeId',manager_id,'reference',ref,'effectiveFrom',stamp),'Existing reporting hierarchy and branch/department ranking identify exactly one candidate; existing assignments retained',stamp);
  mapped_count:=mapped_count+1;
 END LOOP;
 FOR employee IN SELECT e.* FROM employees e WHERE e."organizationId"=org AND e.status IN('ACTIVE','PROBATION','LEAVE') AND e."exitDate" IS NULL ORDER BY e."employeeNumber" LOOP
  review_id:='review:'||cycle_key||':'||employee.id;
  IF EXISTS(SELECT 1 FROM organization_audits WHERE "organizationId"=org AND "entityType"='ZermattPerformanceEvaluation' AND "entityId"=review_id) THEN
   RAISE EXCEPTION 'Existing employee assessment must not be overwritten: %',employee."employeeNumber";
  END IF;
  SELECT a."newValue" INTO STRICT next_value FROM organization_audits a WHERE a."organizationId"=org AND a."entityType"='ZermattPerformanceEvaluation' AND a."newValue"->>'roleId'=employee."designationId" AND a."newValue"->>'status'='PUBLISHED'
   ORDER BY (a."newValue"->>'revision')::int DESC,a."createdAt" DESC LIMIT 1;
  SELECT CASE WHEN count(*)=1 THEN min(a."managerEmployeeId") ELSE NULL END INTO manager_id FROM employee_line_manager_assignments a JOIN employees m ON m.id=a."managerEmployeeId" AND m."organizationId"=a."organizationId"
   WHERE a."organizationId"=org AND a."employeeId"=employee.id AND a."effectiveTo" IS NULL AND a."effectiveFrom"<=stamp AND m.id<>employee.id AND m.status IN('ACTIVE','PROBATION','LEAVE') AND m."exitDate" IS NULL;
  IF manager_id IS NULL THEN exceptions:=exceptions||jsonb_build_array(jsonb_build_object('employeeId',employee.id,'employeeNumber',employee."employeeNumber",'reason','Missing or ambiguous reporting line; employee goals and private self-assessment draft remain available. HR must assign a manager before manager assessment.')); END IF;
  old_value:=jsonb_build_object('kind','review','id',review_id,'cycleId',cycle_id,'employeeId',employee.id,'employeeNumber',employee."employeeNumber",'employeeName',concat_ws(' ',employee."firstName",employee."middleName",employee."lastName"),
   'managerEmployeeId',manager_id,'managerMappingRequired',manager_id IS NULL,'templateId',next_value->>'id','roleName',next_value->>'roleName','goals',next_value->'goals','description',next_value->>'description','jobDescription',next_value->'jobDescription',
   'policyVersion',policy->>'version','policy',policy,'selfRatingRequired',true,'effectiveFrom',GREATEST(today,COALESCE(to_char(employee."hireDate",'YYYY-MM-DD'),today)),'endDate',quarter_end::text,
   'deadlines',jsonb_build_object('self',(quarter_end+7)::text,'manager',(quarter_end+14)::text,'hr',(quarter_end+21)::text),'status','GOALS_PUBLISHED','selfAssessment',NULL,'managerAssessment',NULL,'finalScore',NULL,'revision',1,'updatedAt',stamp,'rolloutReference',ref);
  INSERT INTO organization_audits(id,"organizationId","actorUserId","entityType","entityId",action,"newValue",reason,"createdAt") VALUES
   (gen_random_uuid(),org,NULL,'ZermattPerformanceEvaluation',review_id,'PE_REVIEW',old_value,'Prospective employee scorecard provisioned from management-directed role standard; no self or manager assessment fabricated; '||ref,stamp);
  review_count:=review_count+1;
 END LOOP;
 IF EXISTS(SELECT 1 FROM organization_audits WHERE "organizationId"=org AND "entityType"='ZermattPerformanceEvaluation' AND "entityId"=cycle_id) THEN RAISE EXCEPTION 'Existing cycle must be reviewed before rollout'; END IF;
 next_value:=jsonb_build_object('kind','cycle','id',cycle_id,'key',cycle_key,'year',year_no,'quarter',quarter_no,'start',make_date(year_no,(quarter_no-1)*3+1,1)::text,'end',quarter_end::text,'effectiveFrom',today,'partial',true,'openedAt',stamp,'policy',policy,'exceptions',exceptions,
  'deadlines',jsonb_build_object('self',(quarter_end+7)::text,'manager',(quarter_end+14)::text,'hr',(quarter_end+21)::text),'revision',1,'updatedAt',stamp,'rolloutReference',ref);
 INSERT INTO organization_audits(id,"organizationId","actorUserId","entityType","entityId",action,"newValue",reason,"createdAt") VALUES
  (gen_random_uuid(),org,NULL,'ZermattPerformanceEvaluation',cycle_id,'PE_CYCLE',next_value,'Management-directed prospective partial-quarter rollout; no backdated assessment; '||ref,stamp);
 IF payroll_before IS DISTINCT FROM (SELECT md5(COALESCE(string_agg(to_jsonb(x)::text,'' ORDER BY x.id),'')) FROM payroll_runs x WHERE "organizationId"=org) OR
  lines_before IS DISTINCT FROM (SELECT md5(COALESCE(string_agg(to_jsonb(x)::text,'' ORDER BY x.id),'')) FROM payroll_run_lines x WHERE "organizationId"=org) OR
  assignments_before IS DISTINCT FROM (SELECT md5(COALESCE(string_agg(to_jsonb(x)::text,'' ORDER BY x.id),'')) FROM employee_line_manager_assignments x WHERE "organizationId"=org AND id=ANY(existing_assignment_ids)) OR
  loans_before IS DISTINCT FROM (SELECT md5(COALESCE(string_agg(to_jsonb(x)::text,'' ORDER BY x.id),'')) FROM payroll_loans x WHERE "organizationId"=org) THEN RAISE EXCEPTION 'Payroll or loan state changed during role rollout'; END IF;
 INSERT INTO organization_audits(id,"organizationId","actorUserId","entityType","entityId",action,"newValue",reason,"createdAt") VALUES
  (gen_random_uuid(),org,NULL,'ZermattRoleProfileProvisioning',ref,'ZERMATT_ROLE_PROFILES_PROVISIONED',jsonb_build_object('reference',ref,'roles',role_count,'employeeScorecards',review_count,'newUnambiguousManagerMappings',mapped_count,'reportingExceptions',exceptions,'existingAssignmentHash',assignments_before,'payrollUnchanged',true,'loansUnchanged',true,'existingReportingLinesUnchanged',true,'effectiveFrom',today),
  'Explicit user instruction to set role goals and expectations and provision employee ESS self-assessment and assigned-manager assessment access; existing reporting lines preserved',stamp);
END
$rollout$;
