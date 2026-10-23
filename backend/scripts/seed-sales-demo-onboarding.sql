-- CHRiS sales demo only. Run against confirmed compliance STAGING project.
-- No schema changes, production reads, deletes, employee updates or credential changes.
-- Transactional and additive: existing onboarding progress is never reset.
DO $seed$
DECLARE
 org_id constant text := 'chris-demo-org-20261022';
 template_id constant text := 'chris-demo-onboarding-template-v1';
 seed_sections jsonb := '[{"key":"personal-details","label":"Personal Details","items":["Name","Phone Number","Email Address","Gender","Date of Birth","Marital Status","Nationality","Address","ID Details"],"required":true,"order":1},{"key":"statutory-details","label":"Statutory Details","items":["Tax / PAYE Information","Pension / PFA / PIN","NHIA / Health Information","Other Statutory Requirements"],"required":true,"order":2},{"key":"payment-details","label":"Payment Details","items":["Bank Name","Account Name","Account Number","Payroll Currency","Payment Method"],"required":true,"order":3},{"key":"documents","label":"Documents","items":["CV / Resume","Offer / Appointment Letter","Valid ID","Certificates","Passport Photograph","Other Required Documents"],"required":true,"order":4},{"key":"next-of-kin","label":"Next of Kin","items":["Name","Relationship","Phone Number","Address"],"required":true,"order":5},{"key":"emergency-contact","label":"Emergency Contact","items":["Name","Relationship","Phone Number"],"required":true,"order":6},{"key":"legal","label":"Legal","items":["Employment Contract","Confidentiality / NDA","Policy Acknowledgements","Data Privacy Consent"],"required":true,"order":7},{"key":"assets","label":"Assets","required":false,"items":["Laptop / Computer","Phone","ID / Access Card","PPE","Other Assigned Assets"],"order":8}]'::jsonb;
 employee record; section jsonb; item text; item_no integer;
 record_id text; completed_keys text[]; progress jsonb; data jsonb;
 done boolean; next_stage text; done_count integer; cohort integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('chris-demo-onboarding-seed-v1'));
 IF NOT EXISTS (SELECT 1 FROM organizations WHERE id=org_id AND slug='chris-demo-company') THEN
  RAISE EXCEPTION 'Refusing seed: exact fictional demo organization missing';
 END IF;
 IF (SELECT count(*) FROM employees WHERE "organizationId"=org_id) <> 48
 OR EXISTS (SELECT 1 FROM employees WHERE "organizationId"=org_id AND
  (email IS NULL OR email NOT LIKE '%@northstar-demo.example' OR "employeeNumber" !~ '^NSD[0-9]{4}$')) THEN
  RAISE EXCEPTION 'Refusing seed: expected 48 fictional NSD employees';
 END IF;
 INSERT INTO onboarding_workflow_templates
 (id,"organizationId",name,code,sections,"isActive","createdAt","updatedAt")
 VALUES (template_id,org_id,'Fictional Demo Onboarding','DEMO_ONBOARDING_V1',seed_sections,true,now(),now())
 ON CONFLICT (id) DO NOTHING;
 IF NOT EXISTS (SELECT 1 FROM onboarding_workflow_templates WHERE id=template_id
 AND "organizationId"=org_id AND code='DEMO_ONBOARDING_V1' AND onboarding_workflow_templates.sections::jsonb=seed_sections) THEN
  RAISE EXCEPTION 'Refusing seed: demo template collision or modification';
 END IF;
 FOR employee IN SELECT id,"employeeNumber","firstName","lastName",email,gender
 FROM employees WHERE "organizationId"=org_id ORDER BY "employeeNumber" LOOP
  IF EXISTS (SELECT 1 FROM employee_onboardings WHERE "organizationId"=org_id AND "employeeId"=employee.id) THEN CONTINUE; END IF;
  record_id := 'demo-onboarding-v1-' || employee.id;
  cohort := ((substring(employee."employeeNumber" from 4)::integer)-1) % 4;
  completed_keys := CASE cohort
   WHEN 0 THEN ARRAY[]::text[]
   WHEN 1 THEN ARRAY['personal-details']
   WHEN 2 THEN ARRAY['personal-details','next-of-kin','emergency-contact']
   ELSE ARRAY['personal-details','next-of-kin','emergency-contact','payment-details','legal'] END;
  done_count := cardinality(completed_keys);
  progress := '{}'::jsonb; data := '{}'::jsonb; next_stage := NULL;
  FOR section IN SELECT value FROM jsonb_array_elements(seed_sections) LOOP
   done := (section->>'key')=ANY(completed_keys);
   IF NOT done AND next_stage IS NULL THEN next_stage := section->>'label'; END IF;
   progress := progress || jsonb_build_object(section->>'key',jsonb_build_object(
    'label',section->>'label','required',(section->>'required')::boolean,
    'completed',done,'completedItems',CASE WHEN done THEN jsonb_array_length(section->'items') ELSE 0 END,
    'totalItems',jsonb_array_length(section->'items'),
    'completedItemKeys',CASE WHEN done THEN section->'items' ELSE '[]'::jsonb END));
  END LOOP;
  IF cohort>0 THEN
   data := data || jsonb_build_object('personal-details',jsonb_build_object(
    'fullName',employee."firstName" || ' ' || employee."lastName",'phone','00000000000',
    'email',employee.email,'gender',employee.gender,'dateOfBirth','1995-01-01',
    'maritalStatus','SINGLE','nationality','Nigerian',
    'residentialAddress','Fictional Demo Address - not a real residence',
    'idType','DEMO ID - NOT GOVERNMENT ID','idNumber','FICTIONAL-' || employee."employeeNumber"));
  END IF;
  IF cohort>=2 THEN
   data := data || jsonb_build_object(
    'next-of-kin',jsonb_build_object('name','Fictional Demo Relative','relationship','Sibling','phoneNumber','00000000000','address','Fictional Demo Address'),
    'emergency-contact',jsonb_build_object('name','Fictional Demo Contact','relationship','Sibling','phoneNumber','00000000000'));
  END IF;
  IF cohort=3 THEN
   data := data || jsonb_build_object(
    'payment-details',jsonb_build_object('bankName','FICTIONAL DEMO BANK - NOT FOR PAYMENT',
     'accountName','DEMO ONLY ' || employee."employeeNumber",'accountNumber','0000000000','payrollCurrency','NGN','paymentMethod','Bank Transfer'),
    'legal',jsonb_build_object('employmentContractStatus','Completed','ndaStatus','Completed',
     'policyAcknowledgementStatus','Completed','dataPrivacyConsentStatus','Completed',
     'notes','Fictional demonstration only; no real contract, acknowledgement or consent.'));
  END IF;
  INSERT INTO employee_onboardings
  (id,"organizationId","employeeId","templateId",status,"completionPercent","currentStage",
   "sectionProgress","sectionData","startedAt","createdAt","updatedAt")
  VALUES (record_id,org_id,employee.id,template_id,
   CASE WHEN cohort=0 THEN 'DRAFT'::"OnboardingStatus" ELSE 'IN_PROGRESS'::"OnboardingStatus" END,
   round(done_count*100.0/7)::integer,next_stage,progress,data,
   CASE WHEN cohort=0 THEN NULL ELSE now() END,now(),now());
  FOR section IN SELECT value FROM jsonb_array_elements(seed_sections) LOOP
   done := (section->>'key')=ANY(completed_keys); item_no := 0;
   FOR item IN SELECT jsonb_array_elements_text(section->'items') LOOP
    item_no := item_no+1;
    INSERT INTO employee_onboarding_tasks
    (id,"organizationId","onboardingId","itemKey",title,category,"isRequired",status,"completedAt",notes,"createdAt","updatedAt")
    VALUES ('demo-task-v1-' || md5(record_id || ':' || (section->>'key') || ':' || item_no),
     org_id,record_id,(section->>'key') || ':' || item_no,item,section->>'label',(section->>'required')::boolean,
     CASE WHEN done THEN 'COMPLETED'::"EmployeeOnboardingTaskStatus" ELSE 'NOT_STARTED'::"EmployeeOnboardingTaskStatus" END,
     CASE WHEN done THEN now() ELSE NULL END,
     'FICTIONAL DEMO CHECKLIST - no real employee documents or production evidence.',now(),now());
   END LOOP;
  END LOOP;
 END LOOP;
END $seed$;
