-- CRNETWORK–CCA internal PostgreSQL staging schema proposal.
-- Migration review required before applying to a persistent environment.
-- NEVER run on Zermatt production, Supabase, or a shared database.
-- No client/customer records, secrets, login credentials or billing actions.
BEGIN;

-- NOLOGIN policy role: a separately provisioned, named application LOGIN
-- must be explicitly granted membership by the approved DB operator.
CREATE ROLE cca_staging_request_reader NOLOGIN;

CREATE TABLE public.cca_service_requests (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128),
  tenant_id TEXT NOT NULL CHECK (
    length(tenant_id) BETWEEN 1 AND 128 AND tenant_id ~ '^[a-zA-Z0-9_-]+$'
  ),
  service_code TEXT NOT NULL CHECK (service_code IN (
    'MANAGED_POSTGRESQL', 'DOMAIN_REGISTRATION', 'DNS_MANAGEMENT',
    'SSL_TLS_CERTIFICATE', 'MANAGED_SERVER_VPS', 'APPLICATION_HOSTING',
    'BACKUP_RECOVERY', 'MONITORING_SUPPORT'
  )),
  status TEXT NOT NULL DEFAULT 'REQUEST_ONLY'
    CHECK (status = 'REQUEST_ONLY')
);

REVOKE ALL ON TABLE public.cca_service_requests FROM PUBLIC;
ALTER TABLE public.cca_service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cca_service_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY cca_requests_tenant_read_only
 ON public.cca_service_requests FOR SELECT
 TO cca_staging_request_reader
 USING (
   tenant_id = NULLIF(current_setting('cca.tenant_id', true), '')
 );

GRANT USAGE ON SCHEMA public TO cca_staging_request_reader;
GRANT SELECT ON TABLE public.cca_service_requests
 TO cca_staging_request_reader;

COMMIT;

-- Apply with a dedicated, audited CCA staging migration role.
-- Afterwards operator provisions a unique LOGIN (without SUPERUSER or
-- BYPASSRLS), grants cca_staging_request_reader membership, and stores
-- credentials in an approved secrets vault. NEVER create credentials here.
-- Transaction-local tenant context is set by the authenticated server,
-- not by a client-supplied tenant ID. Login role must not own the table.
