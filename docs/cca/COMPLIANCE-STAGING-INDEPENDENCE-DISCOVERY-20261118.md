# CRNETWORK–CCA — Compliance staging migration discovery (read-only)

Date: 18 November 2026  
Source project: `chris-compliance-staging-db` — `amnbmmewmvbtiylhquin`  
**Status: SOURCE ACTIVE; MIGRATION NOT STARTED**

## Read-only source inventory

The source PostgreSQL service returned `ACTIVE_HEALTHY`, version `17.6`.

| Namespace | Plain tables |
|---|---:|
| public | 120 |
| auth | 27 |
| storage | 8 |
| realtime | 2 |
| vault | 1 |
| supabase_migrations | 1 |
| graphql, graphql_public, extensions | 0 |

Installed extensions: `pg_stat_statements` 1.11, `pgcrypto` 1.3, `plpgsql` 1.0, `supabase_vault` 0.3.1, `uuid-ossp` 1.1.

No table contents, employee records, credentials or file objects were read for this inventory.

## Critical portability consequences

- **120 public tables alone are not a full application cutover.** The source also has managed Supabase auth, storage, realtime and vault namespaces.
- Independently hosted PostgreSQL cannot automatically replace Supabase Auth, its storage object service, or vault-managed encryption/decryption. Map consumers before switching application URLs.
- Do not assume that `supabase_vault` is installed or compatible on a generic PostgreSQL server; classify it as an integration dependency.
- PostgreSQL schema contents and storage object metadata are different from actual underlying file bytes. Verify storage and external object locations separately, especially given PR #306's 81 document references.
- Preserve Supabase staging project and credentials until isolated restoration, authentication, application routes, regression tests and rollback have passed. Its inactivity-warning email does not imply the project was paused.

## Next actions / acceptance evidence

1. Identify application callers and environment variable **names only**, not secret values, for staging DB/Auth/Storage/Realtime/Vault.
2. Inspect schema migrations, role grants, extensions and required data APIs under a read-only session; generate a privacy-safe dependency matrix.
3. Take an encrypted source snapshot and verify its off-site checksum and isolated recovery; include all essential application dependencies.
4. Test public application-schema restore to independently managed PostgreSQL using synthetic fixtures, then validate CCA app logins and access controls without affecting production.
5. Demonstrate an explicit revert to the existing Supabase staging endpoint with no data loss or orphaned credentials.
6. Only after success, conduct a staged cutover; log actual changed connection settings without publishing secrets.

No migration, project pause, deletion, role change or DNS changes have been executed.
