-- Authorized HR instructions, 29 October 2026. Run once after the archive migration.
-- Targeted draft correction only. No payroll approval, payment or loan posting.
DO $$
DECLARE
 org text; current_run text := 'f9296223-c182-4184-8c59-b5acb714ca75';
 current_period text := '4afbd8fb-cfab-4f02-a313-be2600e2da97';
 marker text := 'ZLL-OCT-2026-FINAL-REVIEW-20261029';
 current_hash text; untouched_hash text; recovery_hash text; balance_hash text;
 row_before record; row_after record; p record; staff record; prior jsonb; fresh jsonb;
 v_days numeric; v_gross numeric; v_stat jsonb; v_structure jsonb; v_bill numeric;
 november text; v_count integer; line_old payroll_run_lines%ROWTYPE;
BEGIN
 SELECT id INTO STRICT org FROM organizations WHERE slug='zermatt-liquor-limited';
 PERFORM 1 FROM organizations WHERE id=org FOR UPDATE;
 IF EXISTS(SELECT 1 FROM organization_audits WHERE "organizationId"=org AND action='OCTOBER_FINAL_REVIEW_APPLIED' AND "newValue"->>'reference'=marker) THEN RETURN; END IF;
 PERFORM 1 FROM payroll_runs WHERE id=current_run AND "organizationId"=org AND "periodId"=current_period AND status='DRAFT' AND "archivedAt" IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Current October draft not available; no changes applied'; END IF;
 IF (SELECT "employeeCount" FROM payroll_runs WHERE id=current_run)<>312 THEN RAISE EXCEPTION 'Headcount changed; re-review required'; END IF;
 PERFORM 1 FROM payroll_run_lines WHERE "organizationId"=org AND "runId"=current_run ORDER BY id FOR UPDATE;
 SELECT md5(COALESCE(jsonb_agg(to_jsonb(l) ORDER BY id)::text,'')) INTO current_hash FROM payroll_run_lines l WHERE "runId"=current_run AND "organizationId"=org;
 SELECT md5(COALESCE(jsonb_agg(to_jsonb(l) ORDER BY id)::text,'')) INTO untouched_hash FROM payroll_run_lines l WHERE "runId"=current_run AND "organizationId"=org AND "employeeNumber" NOT IN ('ZLL000178','ZLL000221','ZLL000122');
 SELECT md5(COALESCE(jsonb_agg(to_jsonb(r) ORDER BY id)::text,'')) INTO recovery_hash FROM payroll_loan_recoveries r WHERE "organizationId"=org;
 SELECT md5(COALESCE(jsonb_agg(jsonb_build_array(id,status,"principalAmount","outstandingAmount") ORDER BY id)::text,'')) INTO balance_hash FROM payroll_loans WHERE "organizationId"=org;

 -- Archive rather than delete: actual September recoveries keep their original FKs.
 FOR p IN SELECT * FROM payroll_periods WHERE "organizationId"=org AND "archivedAt" IS NULL AND (("periodStart"='2026-10-01' AND code='OCT-2026') OR ("periodStart"='2026-09-01')) ORDER BY id FOR UPDATE LOOP
  IF p.id=current_period OR EXISTS(SELECT 1 FROM payroll_runs WHERE "organizationId"=org AND "periodId"=p.id AND status NOT IN ('DRAFT','REJECTED')) THEN RAISE EXCEPTION 'Only superseded drafts may be archived'; END IF;
  IF EXISTS(SELECT 1 FROM statutory_obligations o JOIN payroll_runs r ON r.id=o."payrollRunId" AND r."organizationId"=o."organizationId" WHERE r."periodId"=p.id AND r."organizationId"=org AND (o."amountRemitted">0 OR o.status NOT IN ('DRAFT_CALCULATED','REVERSED'))) THEN RAISE EXCEPTION 'Archive would affect confirmed/remitted statutory records';END IF;
  prior:=jsonb_build_object('period',to_jsonb(p),'runs',(SELECT jsonb_agg(to_jsonb(r)) FROM payroll_runs r WHERE r."organizationId"=org AND r."periodId"=p.id),'statutoryEvidence',(SELECT jsonb_agg(to_jsonb(o)) FROM statutory_obligations o JOIN payroll_runs r ON r.id=o."payrollRunId" AND r."organizationId"=o."organizationId" WHERE r."periodId"=p.id AND r."organizationId"=org));
  UPDATE statutory_obligations o SET status='REVERSED',"calculationSnapshot"=COALESCE(o."calculationSnapshot",'{}')||jsonb_build_object('archiveReference',marker,'reason','Superseded draft archived; no amount remitted'),"updatedAt"=now() FROM payroll_runs r WHERE r.id=o."payrollRunId" AND r."organizationId"=o."organizationId" AND r."periodId"=p.id AND r."organizationId"=org AND o.status='DRAFT_CALCULATED' AND o."amountRemitted"=0;
  UPDATE payroll_periods SET status='CLOSED',"archivedAt"=now(),"updatedAt"=now() WHERE id=p.id AND "organizationId"=org;
  UPDATE payroll_runs SET "archivedAt"=now(),"updatedAt"=now() WHERE "periodId"=p.id AND "organizationId"=org;
  INSERT INTO organization_audits(id,"organizationId","actorUserId","entityType","entityId",action,"previousValue","newValue",reason,"createdAt") VALUES(gen_random_uuid()::text,org,NULL,'PayrollPeriod',p.id,'SUPERSEDED_PAYROLL_ARCHIVED',prior,jsonb_build_object('reviewRunId',current_run,'reference',marker,'archived',true,'retainedEvidence',true),'HR confirmed October 2026 is the maiden payroll. Superseded draft removed from operational lists; snapshots and actual loan recoveries retained.',now());
 END LOOP;
 IF current_hash IS DISTINCT FROM (SELECT md5(COALESCE(jsonb_agg(to_jsonb(l) ORDER BY id)::text,'')) FROM payroll_run_lines l WHERE "runId"=current_run AND "organizationId"=org) THEN RAISE EXCEPTION 'Archive altered current payroll'; END IF;

 -- Reject erroneous notes as instructed; no changes to the two salaries.
 FOR row_before IN SELECT n.* FROM chris_payroll_notes n JOIN employees e ON e.id=n."employeeId" AND e."organizationId"=n."organizationId" WHERE n."organizationId"=org AND n."payrollPeriodId"=current_period AND e."employeeNumber" IN ('ZLL000067','ZLL000074') AND n.status='SUBMITTED' FOR UPDATE OF n LOOP
  UPDATE chris_payroll_notes SET status='REJECTED',"reviewedNote"='Entered in error. Disregard per explicit HR instruction on 29 October 2026; no payroll adjustment.',"reviewedAt"=now(),revision=revision+1,"updatedAt"=now() WHERE id=row_before.id AND "organizationId"=org RETURNING * INTO row_after;
  INSERT INTO organization_audits(id,"organizationId","actorUserId","entityType","entityId",action,"previousValue","newValue",reason,"createdAt") VALUES(gen_random_uuid()::text,org,NULL,'PayrollNote',row_before.id,'ERRONEOUS_NOTE_DISREGARDED',to_jsonb(row_before),to_jsonb(row_after)||jsonb_build_object('reviewRunId',current_run),'HR explicitly confirmed this submitted note was entered in error; salary unchanged.',now());
 END LOOP;

 -- Correct the two 26-day-based entries to the agreed 16-day part-time cycle.
 FOR staff IN SELECT e.id,e."employeeNumber",a.id input_id,a."workedDays",a.notes FROM employees e JOIN attendance_payroll_inputs a ON a."employeeId"=e.id AND a."organizationId"=e."organizationId" WHERE e."organizationId"=org AND e."employeeNumber" IN ('ZLL000178','ZLL000221') AND a."periodStart"='2026-10-01' AND a."periodEnd"='2026-10-31' FOR UPDATE OF a LOOP
  IF (staff."employeeNumber"='ZLL000178' AND staff."workedDays"<>24) OR (staff."employeeNumber"='ZLL000221' AND staff."workedDays"<>25) THEN RAISE EXCEPTION 'Attendance source changed; review before correction'; END IF;
  v_days:=16-(26-staff."workedDays");
  SELECT * INTO STRICT line_old FROM payroll_run_lines WHERE "runId"=current_run AND "organizationId"=org AND "employeeId"=staff.id;
  IF line_old.details#>>'{attendance,employmentType}'<>'Part-time' OR (line_old.details#>>'{attendance,standardDays}')::numeric<>16 THEN RAISE EXCEPTION 'Part-time basis changed'; END IF;
  SELECT to_jsonb(a) INTO prior FROM attendance_payroll_inputs a WHERE id=staff.input_id;
  UPDATE attendance_payroll_inputs SET "workedDays"=v_days,notes=COALESCE(staff.notes,'')||format(' | HR correction: 16 scheduled part-time days less %s absence day(s) = %s payable days.',26-staff."workedDays",v_days),"updatedAt"=now() WHERE id=staff.input_id RETURNING to_jsonb(attendance_payroll_inputs.*) INTO fresh;
  INSERT INTO organization_audits(id,"organizationId","actorUserId","entityType","entityId",action,"previousValue","newValue",reason,"createdAt") VALUES(gen_random_uuid()::text,org,NULL,'AttendancePayrollInput',staff.input_id,'PART_TIME_ABSENCE_CYCLE_CORRECTED',prior,fresh||jsonb_build_object('reviewRunId',current_run),'HR instructed 16-day part-time cycle with the recorded absences applied; original 26-day basis retained in audit.',now());
  v_gross:=round((line_old.details->>'scheduledMonthlyGross')::numeric*v_days/16,2);
  v_structure:=jsonb_build_object('basic',round(v_gross*.57,2),'housing',round(v_gross*.11,2),'transport',round(v_gross*.10,2),'meal',round(v_gross*.09,2),'medical',round(v_gross*.08,2),'utility',round(v_gross*.05,2));
  v_stat:=line_old.details->'statutory'||jsonb_build_object('pensionableBase',(v_structure->>'basic')::numeric+(v_structure->>'housing')::numeric+(v_structure->>'transport')::numeric,'employeePension',0,'employerPension',0,'payeTax',0,'nhfEmployee',0,'nsitfEmployer',round(v_gross*.01,2),'itfEmployerAccrual',round(v_gross*.01,2),'employerStatutoryCost',round(v_gross*.01,2)*2,'minimumWageExempt',v_gross<=70000,'recurringAnnualChargeableIncome',greatest(0,v_gross*12-(line_old.details#>>'{statutory,rentReliefAnnual}')::numeric),'annualChargeableIncomeIncludingOneTime',greatest(0,v_gross*12-(line_old.details#>>'{statutory,rentReliefAnnual}')::numeric));
  UPDATE payroll_run_lines SET "baseSalary"=(v_structure->>'basic')::numeric,allowances=v_gross-(v_structure->>'basic')::numeric,"grossPay"=v_gross,details=line_old.details||jsonb_build_object('structuredGross',v_gross,'salaryStructure',v_structure,'statutory',v_stat,'attendance',(line_old.details->'attendance')||jsonb_build_object('payableDays',v_days,'prorationFactor',round(v_days/16,2),'notes',fresh->>'notes','hrNotes',fresh->>'notes')),"updatedAt"=now() WHERE id=line_old.id;
  UPDATE statutory_obligations SET "assessableBase"=v_gross,"employeeAmount"=0,"employerAmount"=round(v_gross*.01,2),"totalLiability"=round(v_gross*.01,2),"calculationSnapshot"=COALESCE("calculationSnapshot",'{}')||jsonb_build_object('hrCorrectionReference',marker,'grossPay',v_gross,'statutory',v_stat),"updatedAt"=now() WHERE "organizationId"=org AND "payrollRunId"=current_run AND "employeeId"=staff.id AND "obligationType" IN ('NSITF_ECS','ITF') AND status='DRAFT_CALCULATED' AND "amountRemitted"=0;
  INSERT INTO organization_audits(id,"organizationId","actorUserId","entityType","entityId",action,"previousValue","newValue",reason,"createdAt") SELECT gen_random_uuid()::text,org,NULL,'PayrollRunLine',l.id,'DRAFT_PART_TIME_PAY_CORRECTED',to_jsonb(line_old),to_jsonb(l)||jsonb_build_object('reviewRunId',current_run),'Targeted refresh of part-time days, salary elements and employer-only statutory costs. Employment-type exemptions retained.',now() FROM payroll_run_lines l WHERE l.id=line_old.id;
 END LOOP;
 GET DIAGNOSTICS v_count=ROW_COUNT;
 IF (SELECT count(*) FROM payroll_run_lines WHERE "runId"=current_run AND "employeeNumber" IN('ZLL000178','ZLL000221') AND (details#>>'{attendance,payableDays}')::numeric IN(14,15))<>2 THEN RAISE EXCEPTION 'Attendance corrections incomplete'; END IF;

 -- One specifically authorised sales-bill deferral, not a new global priority rule.
 SELECT * INTO STRICT line_old FROM payroll_run_lines WHERE "organizationId"=org AND "runId"=current_run AND "employeeNumber"='ZLL000122';
 SELECT i.* INTO STRICT row_before FROM payroll_variable_inputs i JOIN payroll_variable_components c ON c.id=i."componentId" AND c."organizationId"=i."organizationId" WHERE i."organizationId"=org AND i."employeeId"=line_old."employeeId" AND i."payrollPeriodId"=current_period AND c.code='DED-BBSB' AND i.status='ACTIVE' FOR UPDATE OF i;
 v_bill:=row_before."manualAmount";
 IF v_bill<>40400 OR line_old."loanRecovery"<>0 OR (line_old.details->>'loanScheduledTotal')::numeric<>50000 THEN RAISE EXCEPTION 'Loan/bill exception changed; re-review required'; END IF;
 SELECT id INTO november FROM payroll_periods WHERE "organizationId"=org AND code='2026-11' AND "archivedAt" IS NULL;
 IF november IS NULL THEN november:=gen_random_uuid()::text;INSERT INTO payroll_periods(id,"organizationId",code,name,"periodStart","periodEnd","payDate",status,"createdAt","updatedAt") VALUES(november,org,'2026-11','November 2026 Payroll','2026-11-01','2026-11-30','2026-11-30','OPEN',now(),now());END IF;
 UPDATE payroll_variable_inputs SET "payrollPeriodId"=november,remarks=COALESCE(remarks||' | ','')||'HR approved deferral from October 2026 to November 2026 to prioritise the scheduled loan instalment. Source October bill remains due once.',"updatedAt"=now() WHERE id=row_before.id AND "organizationId"=org RETURNING * INTO row_after;
 INSERT INTO organization_audits(id,"organizationId","actorUserId","entityType","entityId",action,"previousValue","newValue",reason,"createdAt") VALUES(gen_random_uuid()::text,org,NULL,'PayrollVariableInput',row_before.id,'SALES_BILL_DEFERRED_FOR_LOAN_RECOVERY',to_jsonb(row_before),to_jsonb(row_after)||jsonb_build_object('reviewRunId',current_run,'targetPeriodId',november),'HR instructed that the 40400 Beer Barn Sales Bill moves to next payroll month so the 50000 loan instalment is recovered in October. No bill waived or duplicated.',now());
 UPDATE payroll_run_lines SET deductions=deductions-v_bill,details=details||jsonb_build_object('customDeductions',COALESCE((SELECT jsonb_agg(x) FROM jsonb_array_elements(details->'customDeductions') x WHERE x->>'inputId'<>row_before.id),'[]'::jsonb),'authorisedRecoveryException',jsonb_build_object('reference',marker,'deferredInputId',row_before.id,'deferredSalesBill',v_bill,'deferredTo','2026-11','loanInstalmentPriority',50000)),"updatedAt"=now() WHERE id=line_old.id;
 IF (SELECT "loanRecovery" FROM payroll_run_lines WHERE id=line_old.id)<>50000 THEN RAISE EXCEPTION 'Loan instalment not restored'; END IF;
 INSERT INTO organization_audits(id,"organizationId","actorUserId","entityType","entityId",action,"previousValue","newValue",reason,"createdAt") SELECT gen_random_uuid()::text,org,NULL,'PayrollRunLine',l.id,'DRAFT_LOAN_PRIORITY_EXCEPTION_APPLIED',to_jsonb(line_old),to_jsonb(l)||jsonb_build_object('reviewRunId',current_run),'Scheduled loan reinstated in draft; deferred sales bill retained as next-month active input. No recovery posted until payroll approval.',now() FROM payroll_run_lines l WHERE l.id=line_old.id;

 FOR row_before IN SELECT l.* FROM payroll_loans l JOIN employees e ON e.id=l."employeeId" AND e."organizationId"=l."organizationId" WHERE l."organizationId"=org AND e."employeeNumber" IN('ZLL000020','ZLL000026','ZLL000042','ZLL000046','ZLL000089','ZLL000151') AND l.status='COMPLETED' AND l."outstandingAmount"=0 FOR UPDATE OF l LOOP
  UPDATE payroll_loans SET "historyConfirmedAt"=now(),"historyConfirmationReference"=marker WHERE id=row_before.id AND "organizationId"=org RETURNING * INTO row_after;
  INSERT INTO organization_audits(id,"organizationId","actorUserId","entityType","entityId",action,"previousValue","newValue",reason,"createdAt") VALUES(gen_random_uuid()::text,org,NULL,'PayrollLoan',row_before.id,'OPENING_LOAN_HISTORY_HR_CONFIRMED',to_jsonb(row_before),to_jsonb(row_after)||jsonb_build_object('reviewRunId',current_run),'HR confirmed the six flagged completed loan histories and actual recoveries. Principal, balances, schedules and posted payments not rewritten.',now());
 END LOOP;
 UPDATE payroll_runs r SET "employeeCount"=s.n,"grossTotal"=s.gross,"deductionTotal"=s.ded,"netPreviewTotal"=s.net,"updatedAt"=now() FROM (SELECT count(*)::int n,sum("grossPay") gross,sum(deductions+"advanceRecovery"+"loanRecovery") ded,sum("netPreview") net FROM payroll_run_lines WHERE "organizationId"=org AND "runId"=current_run)s WHERE r.id=current_run AND r."organizationId"=org;
 IF untouched_hash IS DISTINCT FROM (SELECT md5(COALESCE(jsonb_agg(to_jsonb(l) ORDER BY id)::text,'')) FROM payroll_run_lines l WHERE "runId"=current_run AND "organizationId"=org AND "employeeNumber" NOT IN ('ZLL000178','ZLL000221','ZLL000122')) THEN RAISE EXCEPTION 'Unrelated payroll line changed'; END IF;
 IF recovery_hash IS DISTINCT FROM (SELECT md5(COALESCE(jsonb_agg(to_jsonb(r) ORDER BY id)::text,'')) FROM payroll_loan_recoveries r WHERE "organizationId"=org) THEN RAISE EXCEPTION 'Recovery evidence changed';END IF;
 IF balance_hash IS DISTINCT FROM (SELECT md5(COALESCE(jsonb_agg(jsonb_build_array(id,status,"principalAmount","outstandingAmount") ORDER BY id)::text,'')) FROM payroll_loans WHERE "organizationId"=org) THEN RAISE EXCEPTION 'Loan balance/status changed';END IF;
 INSERT INTO organization_audits(id,"organizationId","actorUserId","entityType","entityId",action,"newValue",reason,"createdAt") SELECT gen_random_uuid()::text,org,NULL,'PayrollRun',id,'OCTOBER_FINAL_REVIEW_APPLIED',to_jsonb(r)||jsonb_build_object('reviewRunId',current_run,'reference',marker,'unrelatedLinesUnchanged',true,'recoveriesUnchanged',true,'loanBalancesUnchanged',true,'endMonthSalaryBasisConfirmed',true),'Explicit HR review instructions applied to draft only. October is the maiden operational payroll; no approval, payout or historical loan posting performed.',now() FROM payroll_runs r WHERE id=current_run;
END $$;
