# CRNETWORK–CCA: real MFA → restored PostgreSQL acceptance — 18 November 2026

**Verified:** PASS in isolated fictional environment; no permanent service deployment or production cutover.

## Environment and implementation

- Windows authorized developer device; Node.js 22; PostgreSQL 16 binaries; temporary `pg` client 8.16.3 installed separately outside the repository.
- Reusable source: `backend/scripts/cca/fictionalStagingMfaPostgresAcceptance.cjs`.
- Mandatory `--fictional-only`, `CCA_FICTIONAL_PG_ACCEPTANCE=true`, explicit local test dependency paths, Windows only, and refusal when production, Render or pre-existing database connection environment is present.
- Creates **isolated, short-lived loopback PostgreSQL cluster** with separate source and restored databases; both use fictional CCA tenants and service requests.
- Runs actual PostgreSQL `pg_dump` followed by `pg_restore` into a second database; the application is then connected **to the restored database** with a restricted PostgreSQL login.
- Uses actual `pg` Pool and the CCA read adapter, encrypted fictional CCA identity vault, password step, time-based MFA, local staging HTTP server and session validation.
- Tests two fictional tenants, Cedar and Atlas. Tenant Cedar gets its single restored request; a client attempting to select Atlas is blocked; database-native tenant RLS shows zero records without scope and exactly Atlas's record with explicit Atlas scope. Login role is neither superuser nor `BYPASSRLS`; attempted INSERT denied. Logout invalidates read access.
- The temporary PostgreSQL cluster, dump, passwords, identity records and MFA session artifacts were cleaned up after the test.

## Verification results

- Commit `041d334ada042756ebfead9f751eebc06af79db7`: fictional MFA-to-**restored**-database acceptance command exit **0**, positive PASS and cleanup log.
- `node --test backend/tests/cca*.test.js`: **101 passed / 0 failed / 0 skipped**, 22 files. The detached validation worktree remains clean.
- Earlier manual integration attempt without explicit `--fictional-only` correctly failed closed; executed test later passed with the required flag.
- Source is on draft PR #311 targeting `feature/cca-control-plane-foundation`; it has **not** been merged or deployed to live services.

## Limitations and next release gate

- This proves end-to-end **fictional recovery and authenticated read-only application behavior**, not a durable, always-on staging database or automated production failover.
- The existing CCA local runtime still maintains encrypted identity state and fictional support workflow snapshots separately; these are **not migrated to PostgreSQL** by this rehearsal.
- The CCA runtime does not yet inject an actual database pool on permanent startup. Controlled pool lifecycle/configuration, schema migrations, service requests persistence and comprehensive application restart/restore remain to implement.
- A production-ready deployment requires hardened off-device hosting, operator and service accounts, least-privilege database role management, RLS security audit, monitored storage, verified encrypted off-site backups, restart acceptance, secret rotation, rollback and an approved launch decision.
- No Zermatt production, Supabase project, real client data, DNS, SSL or server provisioning has been modified.
