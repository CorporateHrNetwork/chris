# CCA independent identity store: Phase 1 implementation plan

Status: **review-only SQL design** in `docs/cca/sql/cca_identity_schema_PROPOSAL.sql`.
It is not in `backend/prisma/migrations`, is never required by CHRiS startup,
and has not been applied to Supabase, production, staging or any database.

## Review outcome
Current tenant CHRiS login uses tenant `Organization`/`User` records.
CCA identity must not be an ordinary CHRiS user, including existing fictional
CorporateHr Network employees. The new control plane requires an independent
server-side principal and session store.

### Proposed entities
1. `cca.principals`: independent CCA identities, default inactive, session
   version to support global logout, external subject from a vetted IdP.
2. `cca.sessions`: per-user short-lived sessions, MFA verification timestamp,
   revocation, and hashed token identifier. No credentials or raw MFA secrets.
3. `cca.role_assignments`: explicit active PLATFORM or TENANT scoped roles.
   The application must require BOTH a platform grant and tenant assignment
   for tenant case reads; a tenant-scoped assignment cannot grant platform
   privileges alone.
4. `cca.identity_audit`: append-only identity / permission change history,
   operated by restricted DB roles.

### Mandatory pre-deployment changes
- Verify the PostgreSQL version supports NULLS NOT DISTINCT (PostgreSQL 15+);
  otherwise use an equivalent compatible unique index design.
- Validate actual Supabase policy, roles, schema exposure, Data API grants,
  user provisioning, RLS, and cross-schema tenant foreign keys.
- External identity provider must enforce phishing-resistant MFA if supported;
  do not self-invent login credential or recovery mechanisms.
- Use separate CCA cryptographic keys and protected deployment environment,
  not CHRiS tenant JWT_SECRET.
- Review access-control and least-privilege SQL GRANT policy. The SQL proposal
  revokes PUBLIC but **does not** automatically harden existing Supabase
  privileged roles; security review is essential.
- Ensure `token_id_hash` verification uses a one-way hash of high-entropy JTI
  and deterministic constant-time comparison when necessary. Never persist a
  plain bearer token.
- Authentication must check active principal, session revocation, session
  version, issuer, audience, token type, token expiry and MFA.
- Changes to subscriptions/deactivation/deployments require *additional* human
  approval, tenancy scope checks, idempotency controls and audit records.
- Verify full restore, separate staging DB and deployment branch auto-deploy
  settings before permitting any migration.
- Never archive the 18 fictional employee records until all dependencies have
  been verified. No deletion is included in this phase.

### Acceptance criteria
- Synthetic CCA principal with no grants cannot access tenant data.
- CHRiS tenant JWT cannot authenticate as CCA (even corporatehr-network).
- Revoked CCA session cannot authenticate.
- Tenant-A assignment does not permit Tenant-B case access.
- Pending/inactive admin and any session without verified MFA are rejected.
- Role revocation is enforced without waiting for a client-side refresh.
- Runtime CHRiS tenant login and existing payroll flows are unchanged.
- Staging migration up/down, backups, and restore checks pass.

## Decision still pending
Whether CCA identity resides in a dedicated Supabase project (strongest
isolation) or a separate `cca` database schema with explicitly isolated
service roles. Review security, maintainability, availability, costs and
operational recovery before selecting either deployment topology.
