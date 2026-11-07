-- CRNetwork Central Agency: independent identity schema PROPOSAL ONLY.
-- DO NOT RUN on production. This is not a Prisma migration.
-- Requires a reviewed, transactionally reversible staging migration, backups
-- and a restricted database role prior to execution.
BEGIN;

CREATE SCHEMA IF NOT EXISTS cca;

CREATE TABLE cca.principals (
  id uuid PRIMARY KEY,
  external_subject text NOT NULL UNIQUE,
  email_normalized text NOT NULL UNIQUE,
  display_name text NOT NULL,
  active boolean NOT NULL DEFAULT false,
  session_version integer NOT NULL DEFAULT 1 CHECK (session_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  disabled_at timestamptz,
  CONSTRAINT cca_principal_email_lowercase CHECK (email_normalized = lower(email_normalized)),
  CONSTRAINT cca_principal_disabled_consistent CHECK (disabled_at IS NULL OR active = false)
);

-- MFA enrollment/validation belongs to a vetted identity provider.
-- Never store passwords, OTP plaintext, recovery codes or MFA secrets here.
CREATE TABLE cca.sessions (
  id uuid PRIMARY KEY,
  principal_id uuid NOT NULL REFERENCES cca.principals(id) ON DELETE RESTRICT,
  token_id_hash bytea NOT NULL UNIQUE,
  mfa_verified_at timestamptz NOT NULL,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cca_session_positive_lifetime CHECK (expires_at > issued_at),
  CONSTRAINT cca_session_mfa_before_expiry CHECK (mfa_verified_at <= expires_at)
);
CREATE INDEX cca_session_principal_idx ON cca.sessions (principal_id, expires_at DESC);

CREATE TABLE cca.role_assignments (
  id uuid PRIMARY KEY,
  principal_id uuid NOT NULL REFERENCES cca.principals(id) ON DELETE RESTRICT,
  role_name text NOT NULL CHECK (role_name IN
    ('SERVICE_AGENT','AI_OPERATOR','BILLING_OFFICER',
     'CLIENT_LIFECYCLE_MANAGER','RELEASE_MANAGER','AUDITOR','PLATFORM_APPROVER')),
  scope text NOT NULL CHECK (scope IN ('PLATFORM','TENANT')),
  tenant_id uuid,
  active boolean NOT NULL DEFAULT false,
  assigned_by uuid NOT NULL REFERENCES cca.principals(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CONSTRAINT cca_assignment_scope CHECK
    ((scope = 'PLATFORM' AND tenant_id IS NULL) OR (scope = 'TENANT' AND tenant_id IS NOT NULL)),
  CONSTRAINT cca_assignment_revocation CHECK (revoked_at IS NULL OR active = false)
);
CREATE INDEX cca_assignment_by_principal ON cca.role_assignments
  (principal_id, active, scope, tenant_id);
CREATE UNIQUE INDEX cca_assignment_active_unique ON cca.role_assignments
  (principal_id, role_name, scope, tenant_id) NULLS NOT DISTINCT WHERE active = true;

-- Append-only audit: application role should be INSERT-only, not DELETE/UPDATE.
CREATE TABLE cca.identity_audit (
  id uuid PRIMARY KEY,
  actor_principal_id uuid REFERENCES cca.principals(id) ON DELETE RESTRICT,
  subject_principal_id uuid REFERENCES cca.principals(id) ON DELETE RESTRICT,
  action text NOT NULL,
  reason text NOT NULL CHECK (length(trim(reason)) > 0),
  correlation_id text NOT NULL,
  event_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cca_identity_audit_created_idx ON cca.identity_audit (created_at DESC);

-- Default access: no privileges for PUBLIC; grant only dedicated reviewed
-- CCA backend roles in a separate migration. Never GRANT to existing CHRiS
-- tenant application/database roles.
REVOKE ALL ON SCHEMA cca FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA cca FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA cca FROM PUBLIC;

COMMIT;

-- Excluded deliberately: principal provisioning, RLS policies, tenant FK,
-- DB users/GRANT, system jobs, deletion and seed users.
-- Production-ready deployment requires explicit verified tenant FK, credential
-- store architecture, RLS/security review, backup & rollback validation.
