-- Explicitly authorized after HR confirmed these amounts were deducted from
-- September salaries. Run only after confirmed-recovery protection is deployed.
-- Idempotent; no payroll approval, employee notification or payout is performed.
DO $$
DECLARE
 v_org TEXT; v_run TEXT; v_count INTEGER; v_total NUMERIC;
 rec RECORD; v_before JSONB; v_after JSONB;
BEGIN
 SELECT id INTO STRICT v_org FROM organizations WHERE slug='zermatt-liquor-limited' FOR UPDATE;
 SELECT r.id INTO STRICT v_run FROM payroll_runs r JOIN payroll_periods p ON p.id=r."periodId" AND p."organizationId"=r."organizationId"
 WHERE r."organizationId"=v_org AND p."periodStart"='2026-09-01' AND p."periodEnd"='2026-09-30' AND p.code='SEP-2026' AND r.status='DRAFT' FOR UPDATE OF r;
 IF (SELECT count(*) FROM payroll_loan_recoveries WHERE "organizationId"=v_org AND "runId"=v_run AND status='POSTED' AND "confirmedPaidAt" IS NOT NULL)=62 THEN RETURN; END IF;
 SELECT count(*),sum(amount) INTO v_count,v_total FROM payroll_loan_recoveries WHERE "organizationId"=v_org AND "runId"=v_run AND status='REVERSED' AND "confirmedPaidAt" IS NULL AND "recoveryDate"='2026-09-30';
 IF v_count<>62 OR v_total<>4038049.38 THEN RAISE EXCEPTION 'September recovery evidence changed: count %, amount %',v_count,v_total; END IF;
 FOR rec IN SELECT x.*,l."outstandingAmount",l.status AS "loanStatus" FROM payroll_loan_recoveries x JOIN payroll_loans l ON l.id=x."loanId" AND l."organizationId"=x."organizationId" WHERE x."organizationId"=v_org AND x."runId"=v_run AND x.status='REVERSED' ORDER BY l.id FOR UPDATE OF x,l
 LOOP
  IF rec."outstandingAmount"<rec.amount OR rec."loanStatus"<>'ACTIVE' THEN RAISE EXCEPTION 'Loan balance/status changed for %',rec."loanId"; END IF;
  UPDATE payroll_loans SET "outstandingAmount"="outstandingAmount"-rec.amount,status=CASE WHEN "outstandingAmount"-rec.amount=0 THEN 'COMPLETED' ELSE status END,"updatedAt"=CURRENT_TIMESTAMP WHERE "organizationId"=v_org AND id=rec."loanId";
  UPDATE payroll_loan_recoveries SET status='POSTED',"confirmedPaidAt"=CURRENT_TIMESTAMP,"confirmationSource"='HR_CONFIRMED_SEPTEMBER_2026_SALARY_DEDUCTION' WHERE "organizationId"=v_org AND id=rec.id;
  INSERT INTO organization_audits(id,"organizationId","actorUserId","entityType","entityId",action,"previousValue","newValue",reason,"createdAt") VALUES
  (gen_random_uuid()::text,v_org,NULL,'PayrollLoanRecovery',rec.id,'ACTUAL_SALARY_DEDUCTION_CONFIRMED',jsonb_build_object('status','REVERSED','loanOutstanding',rec."outstandingAmount",'loanStatus',rec."loanStatus"),jsonb_build_object('status','POSTED','loanId',rec."loanId",'runId',v_run,'amount',rec.amount,'loanOutstanding',rec."outstandingAmount"-rec.amount,'period','2026-09','confirmationSource','HR_CONFIRMED_SEPTEMBER_2026_SALARY_DEDUCTION'),'HR explicitly confirmed September 2026 loan deductions were actually taken from salaries. Restore paid recovery without approving reopened payroll.',CURRENT_TIMESTAMP);
 END LOOP;
 -- Refresh only open draft payroll loan fields through the normal calculation
 -- trigger. This removes future deductions for loans cleared by September.
 FOR rec IN SELECT r.* FROM payroll_runs r JOIN payroll_periods p ON p.id=r."periodId" AND p."organizationId"=r."organizationId" WHERE r."organizationId"=v_org AND r.status='DRAFT' AND p."periodStart">='2026-09-01' AND EXISTS(SELECT 1 FROM payroll_run_lines line JOIN payroll_loan_recoveries x ON x."employeeId"=line."employeeId" AND x."organizationId"=line."organizationId" WHERE line."runId"=r.id AND line."organizationId"=v_org AND x."runId"=v_run)
 LOOP
  v_before=jsonb_build_object('status',rec.status,'deductionTotal',rec."deductionTotal",'netPreviewTotal',rec."netPreviewTotal");
  UPDATE payroll_run_lines line SET details=COALESCE(details,'{}'::jsonb)||jsonb_build_object('confirmedSeptemberLoanReconciliation',jsonb_build_object('sourceRunId',v_run,'period','2026-09','confirmedPaid',true)),"updatedAt"=CURRENT_TIMESTAMP WHERE line."organizationId"=v_org AND line."runId"=rec.id AND EXISTS(SELECT 1 FROM payroll_loan_recoveries x WHERE x."organizationId"=v_org AND x."runId"=v_run AND x."employeeId"=line."employeeId");
  UPDATE payroll_runs r SET "grossTotal"=s.gross,"deductionTotal"=s.deductions,"netPreviewTotal"=s.net,"employeeCount"=s.employees,"updatedAt"=CURRENT_TIMESTAMP
  FROM (SELECT COALESCE(sum("grossPay"),0) gross,COALESCE(sum(deductions+"advanceRecovery"+"loanRecovery"),0) deductions,COALESCE(sum("netPreview"),0) net,count(*)::integer employees FROM payroll_run_lines WHERE "organizationId"=v_org AND "runId"=rec.id) s
  WHERE r."organizationId"=v_org AND r.id=rec.id AND r.status='DRAFT';
  SELECT jsonb_build_object('status',status,'deductionTotal',"deductionTotal",'netPreviewTotal',"netPreviewTotal") INTO v_after FROM payroll_runs WHERE "organizationId"=v_org AND id=rec.id;
  INSERT INTO organization_audits(id,"organizationId","entityType","entityId",action,"previousValue","newValue",reason,"createdAt") VALUES(gen_random_uuid()::text,v_org,'PayrollRun',rec.id,'CONFIRMED_LOAN_RECOVERY_DRAFT_REFRESH',v_before,v_after,'Refresh draft loan deductions after HR-confirmed actual September recoveries; preserve payroll approval state.',CURRENT_TIMESTAMP);
 END LOOP;
END $$;
