-- Isolated mid-month loan safeguard. Existing recovery functions are unchanged.
CREATE FUNCTION public.chris_block_midmonth_loan_recovery()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $guard$
BEGIN
  IF COALESCE(NEW.details->>'payrollElement','END_MONTH') = 'MID_MONTH_TRANSPORT_SUPPORT' THEN
    -- The preceding regular recovery trigger has subtracted this exact amount.
    -- Add back only that recovery; preserve all other payroll and leave elements.
    NEW."netPreview" := COALESCE(NEW."netPreview",0) + GREATEST(0,COALESCE(NULLIF(NEW.details->>'loanRecoveryTotal','')::numeric,0));
    NEW."loanRecovery" := 0;
    NEW.details := (COALESCE(NEW.details,'{}'::jsonb) - 'loanRecoveries' - 'loanRecoveryTotal' - 'loanScheduledTotal' - 'loanRecoveryShortfall')
      || jsonb_build_object('loanRecoveries','[]'::jsonb,'loanRecoveryTotal',0,'loanRecoveryMode','PROHIBITED_MID_MONTH');
  END IF;
  RETURN NEW;
END;
$guard$;
REVOKE EXECUTE ON FUNCTION public.chris_block_midmonth_loan_recovery() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER zzzz_block_midmonth_loan_recovery
BEFORE INSERT OR UPDATE OF deductions, "advanceRecovery", "grossPay", details, "loanRecovery"
ON public.payroll_run_lines
FOR EACH ROW EXECUTE FUNCTION public.chris_block_midmonth_loan_recovery();
