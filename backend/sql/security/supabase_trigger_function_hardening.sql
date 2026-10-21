-- Trigger functions use only trusted application and system schemas.
-- Existing table grants, RLS, salary records and payroll calculations are unchanged.
DO $hardening$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY['chris_apply_active_loan_recovery','chris_apply_payroll_statutory_employment_exemption','chris_post_loan_recoveries_on_payroll_approval','chris_refresh_payroll_run_totals_from_lines','chris_seed_zermatt_opening_loan_legacy_history','zermatt_sync_rent_relief_from_salary'] LOOP
    IF to_regprocedure(format('public.%I()',fn)) IS NOT NULL THEN
      EXECUTE format('ALTER FUNCTION public.%I() SET search_path = pg_catalog, public, pg_temp',fn);
      -- These are trigger functions, not browser-callable RPCs.
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I() FROM PUBLIC, anon, authenticated',fn);
    END IF;
  END LOOP;
END
$hardening$;
