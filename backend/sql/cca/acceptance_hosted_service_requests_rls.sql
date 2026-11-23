-- Fictional CCA hosted database acceptance. Run in disposable CI ONLY.
-- The pipeline supplies an isolated cca_hosted_test DB and reader role.
BEGIN;
DO $scope$
BEGIN
 IF current_database() <> 'cca_hosted_test' THEN
  RAISE EXCEPTION 'CCA_ACCEPTANCE_DISPOSABLE_DATABASE_REQUIRED';
 END IF;
 IF current_user <> 'cca_migrator' THEN
  RAISE EXCEPTION 'CCA_ACCEPTANCE_MIGRATOR_REQUIRED';
 END IF;
END
$scope$;
INSERT INTO public.cca_service_requests (id,tenant_id,service_code,status)
 VALUES
  ('fictional-cedar-01','demo-cedar','MANAGED_POSTGRESQL','REQUEST_ONLY'),
  ('fictional-atlas-01','demo-atlas','MANAGED_POSTGRESQL','REQUEST_ONLY')
 ON CONFLICT (id) DO NOTHING;
COMMIT;

BEGIN READ ONLY;
SET LOCAL ROLE cca_hosted_reader;
DO $no_scope$
BEGIN
 IF (SELECT count(*) FROM public.cca_service_requests) <> 0 THEN
  RAISE EXCEPTION 'CCA_RLS_NO_SCOPE_LEAK';
 END IF;
 IF NOT row_security_active('public.cca_service_requests'::regclass) THEN
  RAISE EXCEPTION 'CCA_RLS_INACTIVE';
 END IF;
END
$no_scope$;
SELECT set_config('cca.tenant_id','demo-cedar',true);
DO $cedar$
BEGIN
 IF (SELECT count(*) FROM public.cca_service_requests) <> 1
    OR (SELECT min(id) FROM public.cca_service_requests) <> 'fictional-cedar-01'
 THEN RAISE EXCEPTION 'CCA_RLS_CEDAR_SCOPE_FAILED';
 END IF;
END
$cedar$;
SELECT set_config('cca.tenant_id','demo-atlas',true);
DO $atlas$
BEGIN
 IF (SELECT count(*) FROM public.cca_service_requests) <> 1
    OR (SELECT min(id) FROM public.cca_service_requests) <> 'fictional-atlas-01'
 THEN RAISE EXCEPTION 'CCA_RLS_ATLAS_SCOPE_FAILED';
 END IF;
END
$atlas$;
SELECT set_config('cca.tenant_id','nonexistent',true);
DO $missing$
BEGIN
 IF (SELECT count(*) FROM public.cca_service_requests) <> 0
 THEN RAISE EXCEPTION 'CCA_RLS_UNKNOWN_TENANT_LEAK';
 END IF;
END
$missing$;
ROLLBACK;

DO $privs$
BEGIN
 IF has_table_privilege('cca_hosted_reader','public.cca_service_requests','INSERT')
    OR has_table_privilege('cca_hosted_reader','public.cca_service_requests','UPDATE')
    OR has_table_privilege('cca_hosted_reader','public.cca_service_requests','DELETE')
 THEN RAISE EXCEPTION 'CCA_READONLY_ROLE_PRIVILEGE_LEAK';
 END IF;
END
$privs$;
