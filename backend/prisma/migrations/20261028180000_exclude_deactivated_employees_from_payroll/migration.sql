-- Deactivation excludes the whole effective calendar month and future drafts.
-- Paid/approved history is preserved; final approval cannot bypass eligibility.
CREATE OR REPLACE FUNCTION public.chris_exclude_deactivated_payroll_employee(p_org TEXT,p_employee TEXT,p_effective TIMESTAMP,p_actor TEXT DEFAULT NULL)
RETURNS INTEGER LANGUAGE plpgsql SET search_path TO pg_catalog,public,pg_temp AS $$
DECLARE row_data RECORD; v_run RECORD; v_count INTEGER:=0; v_month DATE:=date_trunc('month',p_effective)::date;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM organizations WHERE id=p_org AND slug='zermatt-liquor-limited') THEN RETURN 0; END IF;
 FOR v_run IN SELECT r.* FROM payroll_runs r JOIN payroll_periods p ON p.id=r."periodId" AND p."organizationId"=r."organizationId" WHERE r."organizationId"=p_org AND r.status IN ('DRAFT','REJECTED') AND p.status<>'CLOSED' AND p."periodEnd">=v_month AND EXISTS(SELECT 1 FROM payroll_run_lines l WHERE l."organizationId"=p_org AND l."runId"=r.id AND l."employeeId"=p_employee) ORDER BY r.id FOR UPDATE OF r
 LOOP
  FOR row_data IN SELECT * FROM payroll_run_lines WHERE "organizationId"=p_org AND "runId"=v_run.id AND "employeeId"=p_employee FOR UPDATE
  LOOP
   INSERT INTO organization_audits(id,"organizationId","actorUserId","entityType","entityId",action,"previousValue","newValue",reason,"createdAt") VALUES(gen_random_uuid()::text,p_org,p_actor,'PayrollRunLine',row_data.id,'DEACTIVATED_EMPLOYEE_EXCLUDED',to_jsonb(row_data),jsonb_build_object('employeeId',p_employee,'runId',v_run.id,'effectiveMonth',v_month,'excluded',true),'Employee deactivation excludes the entire effective month and subsequent unpaid draft payroll. Historical paid recoveries are retained.',CURRENT_TIMESTAMP);
   DELETE FROM statutory_obligations WHERE "organizationId"=p_org AND "payrollRunId"=v_run.id AND "employeeId"=p_employee AND status='DRAFT_CALCULATED' AND "amountRemitted"=0;
   DELETE FROM payroll_run_lines WHERE "organizationId"=p_org AND id=row_data.id;
   v_count:=v_count+1;
  END LOOP;
  UPDATE payroll_runs r SET "employeeCount"=t.n,"grossTotal"=t.gross,"deductionTotal"=t.deductions,"netPreviewTotal"=t.net,"statutoryStatus"='RECALCULATION_REQUIRED',"updatedAt"=CURRENT_TIMESTAMP
  FROM(SELECT count(*)::integer n,COALESCE(sum("grossPay"),0) gross,COALESCE(sum(deductions+"advanceRecovery"+"loanRecovery"),0) deductions,COALESCE(sum("netPreview"),0) net FROM payroll_run_lines WHERE "organizationId"=p_org AND "runId"=v_run.id)t WHERE r."organizationId"=p_org AND r.id=v_run.id;
 END LOOP;
 IF to_regclass('public.zermatt_midmonth_lines') IS NOT NULL THEN
  FOR row_data IN SELECT l.* FROM zermatt_midmonth_lines l JOIN zermatt_midmonth_runs r ON r.id=l."runId" AND r."organizationId"=l."organizationId" WHERE l."organizationId"=p_org AND l."employeeId"=p_employee AND r."periodMonth">=v_month AND r.status IN ('DRAFT','REJECTED') FOR UPDATE OF l,r
  LOOP
   INSERT INTO organization_audits(id,"organizationId","actorUserId","entityType","entityId",action,"previousValue","newValue",reason,"createdAt") VALUES(gen_random_uuid()::text,p_org,p_actor,'MidmonthPayrollLine',row_data.id,'DEACTIVATED_EMPLOYEE_EXCLUDED',to_jsonb(row_data),jsonb_build_object('employeeId',p_employee,'runId',row_data."runId",'effectiveMonth',v_month,'excluded',true),'Deactivation removes unpaid mid-month draft entries; carry-forward balances and actual payments remain unchanged.',CURRENT_TIMESTAMP);
   DELETE FROM zermatt_midmonth_lines WHERE "organizationId"=p_org AND id=row_data.id;
   UPDATE zermatt_midmonth_runs SET "sourceHash"='DEACTIVATED_REGENERATE_REQUIRED',"updatedAt"=CURRENT_TIMESTAMP WHERE "organizationId"=p_org AND id=row_data."runId";
  END LOOP;
 END IF;
 RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION public.chris_exclude_deactivated_payroll_employee(TEXT,TEXT,TIMESTAMP,TEXT) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.chris_deactivation_payroll_cleanup() RETURNS TRIGGER LANGUAGE plpgsql SET search_path TO pg_catalog,public,pg_temp AS $$
BEGIN
 IF NEW."eventType"::text='DEACTIVATED' THEN PERFORM chris_exclude_deactivated_payroll_employee(NEW."organizationId",NEW."employeeId",NEW."effectiveDate"::timestamp,NEW."performedByUserId"); END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS chris_deactivation_payroll_cleanup ON employee_lifecycle_events;
CREATE TRIGGER chris_deactivation_payroll_cleanup AFTER INSERT ON employee_lifecycle_events FOR EACH ROW EXECUTE FUNCTION chris_deactivation_payroll_cleanup();

CREATE OR REPLACE FUNCTION public.chris_guard_deactivated_payroll_line() RETURNS TRIGGER LANGUAGE plpgsql SET search_path TO pg_catalog,public,pg_temp AS $$
DECLARE v_start DATE; v_end DATE;
BEGIN
 SELECT p."periodStart",p."periodEnd" INTO v_start,v_end FROM payroll_runs r JOIN payroll_periods p ON p.id=r."periodId" AND p."organizationId"=r."organizationId" JOIN organizations o ON o.id=r."organizationId" WHERE r.id=NEW."runId" AND r."organizationId"=NEW."organizationId" AND o.slug='zermatt-liquor-limited';
 IF v_start IS NULL THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM employees e WHERE e."organizationId"=NEW."organizationId" AND e.id=NEW."employeeId" AND (e.status::text='INACTIVE' OR EXISTS(SELECT 1 FROM employee_lifecycle_events d WHERE d."organizationId"=e."organizationId" AND d."employeeId"=e.id AND d."eventType"::text='DEACTIVATED' AND d."effectiveDate">=date_trunc('month',v_start) AND d."effectiveDate"<date_trunc('month',v_end)+interval '1 month'))) THEN
 RAISE EXCEPTION 'DEACTIVATED_EMPLOYEE_PAYROLL_EXCLUDED: employee cannot appear in the deactivation month payroll; recalculate payroll.';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS aaa_guard_deactivated_payroll_line ON payroll_run_lines;
CREATE TRIGGER aaa_guard_deactivated_payroll_line BEFORE INSERT OR UPDATE ON payroll_run_lines FOR EACH ROW EXECUTE FUNCTION chris_guard_deactivated_payroll_line();

CREATE OR REPLACE FUNCTION public.chris_guard_deactivated_payroll_approval() RETURNS TRIGGER LANGUAGE plpgsql SET search_path TO pg_catalog,public,pg_temp AS $$
BEGIN
 IF NEW.status IN ('PENDING_APPROVAL','APPROVED') AND NEW.status IS DISTINCT FROM OLD.status AND EXISTS(
 SELECT 1 FROM payroll_run_lines l JOIN employees e ON e.id=l."employeeId" AND e."organizationId"=l."organizationId" JOIN payroll_periods p ON p.id=NEW."periodId" AND p."organizationId"=NEW."organizationId" JOIN organizations o ON o.id=NEW."organizationId"
 WHERE l."runId"=NEW.id AND l."organizationId"=NEW."organizationId" AND o.slug='zermatt-liquor-limited' AND (e.status::text='INACTIVE' OR EXISTS(SELECT 1 FROM employee_lifecycle_events d WHERE d."organizationId"=e."organizationId" AND d."employeeId"=e.id AND d."eventType"::text='DEACTIVATED' AND d."effectiveDate">=date_trunc('month',p."periodStart") AND d."effectiveDate"<date_trunc('month',p."periodEnd")+interval '1 month'))
 ) THEN RAISE EXCEPTION 'DEACTIVATED_EMPLOYEE_PAYROLL_EXCLUDED: return payroll for correction and recalculate before approval.'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS aaa_guard_deactivated_payroll_approval ON payroll_runs;
CREATE TRIGGER aaa_guard_deactivated_payroll_approval BEFORE UPDATE OF status ON payroll_runs FOR EACH ROW EXECUTE FUNCTION chris_guard_deactivated_payroll_approval();

-- Also cover authorized status changes outside the profile deactivation route.
-- The lifecycle event subsequently applies its precise effective month when
-- available; this immediate fallback removes current/future unpaid drafts.
CREATE OR REPLACE FUNCTION public.chris_inactive_status_payroll_cleanup() RETURNS TRIGGER LANGUAGE plpgsql SET search_path TO pg_catalog,public,pg_temp AS $$
BEGIN
 IF NEW.status::text='INACTIVE' AND OLD.status IS DISTINCT FROM NEW.status THEN
  PERFORM chris_exclude_deactivated_payroll_employee(NEW."organizationId",NEW.id,(CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Lagos')::timestamp,NULL);
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS chris_inactive_status_payroll_cleanup ON employees;
CREATE TRIGGER chris_inactive_status_payroll_cleanup AFTER UPDATE OF status ON employees FOR EACH ROW EXECUTE FUNCTION chris_inactive_status_payroll_cleanup();
