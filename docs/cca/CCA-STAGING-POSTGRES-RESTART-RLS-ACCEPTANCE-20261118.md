# CCA PostgreSQL staging restart and RLS acceptance — 18 Nov 2026

**Status: PASS in disposable fictional rehearsal. NOT a permanent production/staging database cutover.**

## Code and schema
- `backend/sql/cca/001_fictional_staging_service_requests.sql`: internal staging-only SQL proposal creating a NOLOGIN reader policy role; a request-only service table; restricted grants; PostgreSQL row-level security `ENABLE` and `FORCE`; tenant-scoped read policy. No credentials or live customer data.
- `backend/src/cca/postgresTenantReadAdapter.js`: server-authorized tenant read, bound tenant parameter and transaction-local context. At query time refuses a PostgreSQL role with `rolsuper` or `rolbypassrls`; rolls back on failure.
- `tools/cca-local-demo/runStaging.js`: accepts an explicit server-owned reader injection at `openStaging`, but **normal runtime startup does not instantiate or enable a PostgreSQL pool**.
- `backend/tests/ccaPersistentStagingPostgres.test.js`: two protected-staging restart tests; absent reader is disabled, old MFA token is rejected after restart and a separately injected fictional reader is queried only for its tenant.
- `backend/scripts/cca/fictionalStagingMfaPostgresAcceptance.cjs`: disposable real PostgreSQL 16 cluster, schema migration, restricted fictional reader login, two fictional tenant records, actual `pg_dump` and `pg_restore`, actual Node `pg` pool, CCA MFA+HTTP read, logout, then server/identity-vault and database-pool restart with new MFA and read from the restored database.

## Verifications
- **All 104 CCA tests passed**, 0 failed, 0 skipped, using a clean detached checkout at `83f1780`.
- Real isolated integration test exit **0**: applies the exact proposed SQL migration; verifies dump/restore and two tenants; unscoped reads reveal no records, explicit tenant isolation succeeds; unauthorized writes are denied. MFA old session rejected after service restart, fresh MFA obtains the same restored record.
- The first migration attempt failed on a Windows client character-encoding issue (non-ASCII dash in a SQL comment). SQL proposal was corrected to ASCII-only, then successfully re-executed against a new isolated cluster.
- Temporary PostgreSQL cluster, dump, test credentials and fictional records were deleted. No connection to current CCA staging data or Zermatt production.

## Remaining production readiness gates
1. Provision a **persistent dedicated CCA staging PostgreSQL database** under an approved operations identity and a least-privilege login. Never share a production database login or turn a privileged user into an app pool.
2. Establish secure per-environment connection configuration using an approved vault/DPAPI protection. Confirm the actual startup path, role-membership grants and network isolation. The optional reader injection must stay disabled until verified.
3. Migrate CCA support and catalogue records from the local snapshot store with reconciliation, rather than merely enabling a read-only table.
4. Verify restart and restore using the **persistent** database, including scheduled recovery and independent off-site copy; define alerting, ownership, rollback and data-retention controls.
5. Confirm the public-hosting platform, DNS, SSL/TLS, payment boundaries, monitoring, on-call coverage and customer obligations before a commercial launch.
6. Keep draft PR #311 isolated from Zermatt production. All live database migrations, DNS, certificate provisioning and payment activations require separate release controls.

**No permanent CCA cutover, merge, service deployment, domain registration, server provisioning, SSL issuance or live data migration was performed.**
