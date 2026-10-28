-- Current-month reconciliation authorized by HR. Earlier paid/corrected months
-- remain unchanged. Each removed line is retained in organization audit history.
DO $$
DECLARE v_org TEXT; rec RECORD;
BEGIN
 SELECT id INTO STRICT v_org FROM organizations WHERE slug='zermatt-liquor-limited' FOR UPDATE;
 FOR rec IN SELECT e.id,COALESCE(d."effectiveDate",TIMESTAMP '2026-10-01') AS effective_date FROM employees e LEFT JOIN LATERAL(SELECT "effectiveDate" FROM employee_lifecycle_events d WHERE d."organizationId"=e."organizationId" AND d."employeeId"=e.id AND d."eventType"::text='DEACTIVATED' ORDER BY d."effectiveDate" DESC,d."createdAt" DESC LIMIT 1)d ON TRUE WHERE e."organizationId"=v_org AND e.status::text='INACTIVE' FOR UPDATE OF e
 LOOP
  PERFORM chris_exclude_deactivated_payroll_employee(v_org,rec.id,GREATEST(rec.effective_date,TIMESTAMP '2026-10-01'),NULL);
 END LOOP;
END $$;
