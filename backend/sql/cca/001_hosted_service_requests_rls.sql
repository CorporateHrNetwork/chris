-- CCA isolated hosted PostgreSQL migration 001.
-- Run ONLY against a separately provisioned cca_* database, as its migration
-- owner. Pre-create LOGIN role cca_hosted_reader with NOSUPERUSER NOBYPASSRLS
-- and a secret managed out of band. Never execute against CHRiS or Zermatt.
BEGIN;
DO $guard$
BEGIN
  IF current_database() !~ '^cca_[a-z0-9_]{3,55}$' THEN
    RAISE EXCEPTION 'CCA_MIGRATION_DATABASE_SCOPE_DENIED';
  END IF;
  IF to_regrole('cca_hosted_reader') IS NULL THEN
    RAISE EXCEPTION 'CCA_HOSTED_READER_ROLE_MISSING';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='cca_hosted_reader'
             AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb)) THEN
    RAISE EXCEPTION 'CCA_HOSTED_READER_ROLE_UNSAFE';
  END IF;
END
$guard$;

CREATE TABLE IF NOT EXISTS public.cca_service_requests (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  service_code text NOT NULL,
  status text NOT NULL DEFAULT 'REQUEST_ONLY',
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT cca_request_id_valid CHECK (id ~ '^[a-zA-Z0-9_-]{4,128}$'),
  CONSTRAINT cca_request_tenant_valid CHECK (tenant_id ~ '^[a-zA-Z0-9_-]{1,128}$'),
  CONSTRAINT cca_request_service_valid CHECK (service_code ~ '^[A-Z_]{3,64}$'),
  CONSTRAINT cca_request_status_valid CHECK (
    status IN ('REQUEST_ONLY','PENDING_REVIEW','APPROVED','REJECTED','CANCELLED')
  )
);
CREATE INDEX IF NOT EXISTS cca_service_requests_tenant_id_idx
 ON public.cca_service_requests (tenant_id, id);

ALTER TABLE public.cca_service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cca_service_requests FORCE ROW LEVEL SECURITY;

-- The reader sets tenant context using set_config(..., true) inside a
-- READ ONLY transaction. Absent/empty tenant setting matches no rows.
DO $policy$
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM pg_policies
  WHERE schemaname='public' AND tablename='cca_service_requests'
    AND policyname='cca_service_request_tenant_select'
 ) THEN
  EXECUTE $ddl$
   CREATE POLICY cca_service_request_tenant_select
     ON public.cca_service_requests FOR SELECT
     TO cca_hosted_reader
     USING (tenant_id = NULLIF(current_setting('cca.tenant_id', true), ''))
  $ddl$;
 END IF;
END
$policy$;

REVOKE ALL ON public.cca_service_requests FROM PUBLIC;
REVOKE ALL ON public.cca_service_requests FROM cca_hosted_reader;
GRANT USAGE ON SCHEMA public TO cca_hosted_reader;
GRANT SELECT ON public.cca_service_requests TO cca_hosted_reader;
COMMIT;
