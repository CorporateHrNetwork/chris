# Priority 1: Zermatt database relocation to CRNETWORK, November 2026

**Deadline:** production cutover no later than 30 November 2026 (Africa/Lagos).
**State:** IN PROGRESS; NOT YET MIGRATED. Live Zermatt must remain on its existing source until GO criteria are met.
**Workstreams:** (A) Zermatt real database migration in draft PR #322, (B) CCA independent infrastructure in draft PR #311. No cross-contamination.

## Verified baseline — 20 Nov 2026
- Source project: Supabase `ldmwsptljgnspwtwcdtm`, healthy PostgreSQL 17 (not decommissioned).
- Source: approximately 66 MB; 123 public tables, 319 foreign keys, 15 public functions, 15 public triggers.
- Tenants: `zermatt-liquor-limited` (342 employee records, four payroll runs, 25 leave requests) and `corporatehr-network` (18 employee records).
- Database auth users and storage objects: zero in the inspected Supabase project; this does not prove document and application auth independence.
- Created isolated *temporary* Render PostgreSQL 17 `dpg-dbvug07f3r2c7386bm90-a` in Frankfurt, free tier; available, external IP allowlist is empty, expires 20 Dec 2026. This is NOT approved as a production destination.
- A free Render database does NOT provide managed backups/PITR; do not place production data on it or treat an unencrypted test copy as production.
- Windows CCA recovery server remained disconnected from Desktop Commander during the signed-out Task Scheduler test; no success claim for 6:30 backup or 7:15 audit until direct evidence exists.

## Daily gates (planned — not earned)

| Date (WAT) | Evidence required to mark complete | State |
|---|---|---|
| 20 Nov | Source inventory, isolated rehearsal DB, separate migration PR + CI; confirm production funding path | PARTIAL |
| 21 Nov | Separate durable PostgreSQL 17 target approved/provisioned; source logical backup verified and encrypted off-site | PENDING |
| 22 Nov | Full-database schema/role/extension dependency mapping; first test restore in secured staging | PENDING |
| 23 Nov | Baseline full restore and initial exact table-count inventory; resolve restore errors | PENDING |
| 24 Nov | Repeat full restore, compare schema objects/counts; verify all organization IDs and tenant access | PENDING |
| 25 Nov | Zermatt app staging switches to target; secure authentication, ESS, documents and API smoke checks | PENDING |
| 26 Nov | Test main payroll, TSP, leave, benefits, approvals, bank data, statutory data, exports | PENDING |
| 27 Nov | Full backup + timed restore, rollback test, scheduling/monitoring, audit evidence | PENDING |
| 28 Nov | HR/Finance acceptance, discrepancies closed, freeze window and deployment checklist agreed | PENDING |
| 29 Nov | Final rehearsal and GO/NO-GO; production destination healthy and funded | PENDING |
| 30 Nov | Quiesce source writes/jobs, final consistent dump + restore/reconciliation, approved connection switch, verify and retain rollback | PENDING |

A missed gate must be reported as MISSED/AT RISK, not silently carried forward as complete.

## Hard production GO gates
1. Durable CRNETWORK-managed PostgreSQL **17** server provisioned separately from CCA fictional tenants, with explicit operating budget, least-privilege roles and verified TLS.
2. Encrypted recoverable source backup (including roles/extensions and all application schemas that are actually used). Never publish credentials, backup files, employee data or account details to GitHub.
3. Whole-database restore rehearsal, PostgreSQL extension/role/function validation, **exact 123-public-table baseline comparison** and 319 FK/15 function/15 trigger checks; source schema may change, so use fresh captured manifests.
4. Public `employees`, payroll, attendance, leave, benefits and TSP tables and dependent auth/document stores confirmed. Both original organization tenants handled deliberately; no tenant-to-tenant leakage.
5. User authentication, ESS, workflows, scheduler background writes and integrations checked. Cutover must be coordinated with payroll activities; do not create duplicate payroll or reminder jobs.
6. Backups, tested recovery, monitoring and high-confidence rollback; check final changed-row reconciliation while writes are paused.
7. Explicit production GO approval after evidence. No automated cutover by CI, no source deletion or destructive SQL.

## Approved work order
- Perform metadata-only source and target inventory using `tools/zermatt-migration/captureInventory.cjs` from an authorized machine with secrets set locally, then reconcile using `databaseInventory.cjs`.
- Run full `pg_dump` custom format on the authorized migration workstation with secure source credentials and an encryption mechanism. Restore only to explicitly approved **secure** CRNETWORK staging/durable server; keep backup outside the repository.
- Never point the running Zermatt Render API at the free rehearsal instance; this is explicitly a blocker.
- During final cutover, stop application writers/schedulers, get final consistent backup, restore to verified target, reconcile, switch only after GO, test, preserve source for rollback.
- All draft PRs and synthetic CI tests are engineering readiness evidence, NOT actual migration evidence.

## 20 November — migration workstation preflight (10:47 WAT)
- Authorized desktop `DESKTOP-IQEJRMU` is connected; the preflight ran on this Windows host.
- `pg_dump` PostgreSQL 16 is present; PostgreSQL 17 client tooling is **not** installed. Do not use the older client to dump the 17 source.
- No source/target connection secrets were configured in the migration process environment. Neither endpoint identity nor its authorization can be validated yet.
- The PostgreSQL 17 free Render rehearsal database exists but blocks remote connections by IP allowlist. **No real-data transfer performed.** Do not loosen its network policy or treat it as production.
- The fail-closed preflight `tools/zermatt-migration/migrationPreflight.cjs` ran on Windows and returned `BLOCKED`, with no employee data or credentials accessed.
- The dedicated GitHub migration-inventory and preflight contract workflow passed at commit `04b713a`; other compliance checks should be read separately.
- **Priority actions:** install trusted PostgreSQL 17 client tools, establish a protected credential path, and approve a secured/durable migration destination before any real source export.

## 23 November — on-site recovery evidence and outstanding acceptance
- Desktop Commander verified `DESKTOP-IQEJRMU` online. Live Zermatt API and frontend on Render are not suspended; Supabase source project remains `ACTIVE_HEALTHY`.
- Google Drive remote `chrisdrive:` includes dedicated `CHRiS Zermatt — Encrypted Database Backups` collection with dated archives, including `chris-zermatt-cloud-20261123T090831Z.dump.gpg`. Encrypted file downloaded successfully for integrity evidence: 2,982,359 bytes, SHA-256 `A9B56CF40B9141D73D29522DF2958D5533DD3B2E5BFAE9D9D45D3FF1A059A953`. No decrypted records handled.
- Prior recovery manifest `zermatt-production-20261118-122143.recovery-manifest.json` explicitly names the live Supabase project, AES-256 encryption and isolated restore PASS on 18 November for **public schema only; 122 tables**. This is real but incomplete disaster-recovery evidence; roles, other schemas, storage/auth, complete application acceptance, and newer archives are unverified.
- Supabase metadata-only live query on 23 November reports PostgreSQL 17.6, **123 public tables**, database size 71,552,147 bytes. The earlier 122-table restoration **must not** be treated as fully reconciled. Source and backup timestamps differ, but a fresh full restore and schema comparison are still mandatory.
- Workstation has `pg_dump` version 16; PostgreSQL 17 client tooling and local migration source/target credential path remain unconfigured. Latest GPG backup can be retrieved, but decryption/restore has not been verified on 23 November.
- CCA fictional staging managed-backup Task Scheduler result had failures on 23 November. Direct manual encrypted backup succeeded off-site and fresh health audit returned PASS; scheduled-job repair remains outstanding. CCA staging != CHRiS production backup.
- **GO status: BLOCKED** pending secure 17-compatible restore of a current real production backup and complete tenant, schema, application and rollback reconciliation. Neither production cutover nor source deletion authorized.

## 23 November — unattended CCA staging backup recovery milestone
- Windows task account password was refreshed locally for existing CCA managed PostgreSQL backup and health-audit tasks; no password transmitted to GitHub or ChatGPT.
- Backup task now calls a local diagnostic wrapper with limited logging. Verified actual `Start-ScheduledTask` run under its saved-password principal, completed with Windows Task Scheduler `LastTaskResult=0`, created `cca-managed-postgres-20261123-132940-294dcbd3.cms`, uploaded off-site and recorded `TASK_SUCCESS`.
- Managed staging health-audit Task Scheduler run subsequently returned `LastTaskResult=0` at 14:30:47 local time.
- This certifies the repaired CCA fictional staging backup/audit execution, **not** a complete CHRiS/Zermatt production restore or production database cutover.
- Current live Supabase metadata is healthy with PostgreSQL 17, 123 public tables, 15 functions and 15 triggers. The 23 November encrypted production archive is accessible in Google Drive but a full isolated restore remains a HARD GO blocker.

## 23 November — verified protected production recovery, newer snapshot

- **Current source:** Supabase project `ldmwsptljgnspwtwcdtm`, PostgreSQL 17, 123 application `public` tables, 15 public functions and 15 public triggers. Live employee aggregates at inspection: `zermatt-liquor-limited=346`, `corporatehr-network=18`.
- Existing 23 Nov morning Google Drive AES256-GPG backup successfully decrypted on authorized Windows computer. PostgreSQL 17.11 TOC includes **123 public TABLE entries and 123 TABLE DATA entries**. Isolated local `public` schema restore passed and reported 123 public tables, with 344 Zermatt + 18 CorporateHr employee records. Disposable test instance and decrypted archive removed. The two-record difference versus later live source data demonstrates this earlier backup is not the most up-to-date.
- A fresh protected **read-only** GitHub Actions snapshot was created and encrypted successfully: run `45193953294`, artifact `zermatt-live-encrypted-45193953294`. GitHub artifact expires 7 Dec 2026; do not rely on artifact retention alone.
- **Independent recovery of the fresh snapshot passed:** workflow run `45194289483`, disposable Linux PostgreSQL 17; **123 tables, 364 employee records, 92 completed migrations, 2 organizations**, all acceptance conditions passed. This reconciles with the then-live 346 Zermatt + 18 CorporateHr employee counts.
- The same fresh encrypted artifact was independently copied to Google Drive as `zermatt-protected-github-45193953294-20261123.dump.enc` (3,509,312 bytes; SHA-256 `443F8BD3DF2E13A6183F21D1E39F04D4A3CC46DFE81565471456A19ECF3C75B9`). Remote retrieval verified the same SHA-256, and a separate manifest was uploaded. No plaintext records placed in GitHub or Google Drive.
- An additional manual Windows direct production `pg_dump` attempt ended with an unexpected Supabase SSL connection closure while reading `organization_audits`; its partial archive is **NOT** a valid backup and must not be relied upon. The protected GitHub runner backup is the successful alternative.
- Windows full-database rehearsal hit a local **Application Control** restriction on `pg_stat_statements.dll`. The security policy was not weakened. The local `public`-schema-only rehearsal succeeded. Full **Supabase-managed** `auth`, `storage`, `realtime`, `vault`, extensions/roles/policies, application authentication, attached documents and downstream workflows remain out of scope for current restore acceptance.
- **Production cutover remains NO-GO** pending a durable CRNETWORK-managed destination, complete schema/extension/identity dependency mapping, application smoke tests, security, monitored backup/rollback and explicit authorization. Existing Render application and source Supabase service remain unchanged.

### 23 November — final verified controls / outstanding full recovery
- Latest read-only source metadata check: built-in `auth.users=0`, `storage.objects=0`, `storage.buckets=0`. Public `relrowsecurity` enabled on 14 tables; zero rows returned from `pg_policies` for `public`. Four nondefault PostgreSQL extensions exist. No policy, authentication, extensions or schema setting was changed.
- `chris-zermatt-20261123T141021Z.dump.gpg` was an **incomplete** local export after Supabase session-pooler SSL disconnect. It was safely marked `.gpg.incomplete` so no process treats it as a valid backup.
- The abandoned unverified PostgreSQL 17.12 installer download was removed. Independently existing verified PostgreSQL 17.11 client/server test binaries were found in the dedicated CHRiS backup tools folder; no Windows 16 staging services were modified.
- Windows Application Control blocked `pg_stat_statements.dll` when attempting a full local restore. This restriction remains enforced and must not be bypassed. The independent Linux GitHub public-schema restore succeeded.
- GitHub protected source backup, disposable restore and separately verified Google Drive encrypted copy all passed, but the full **Supabase-platform** disaster-recovery and production migration gates remain **BLOCKED** pending independent destination, extension/role mapping, application acceptance and approved go-live.

- **Automated protected GitHub backups:** the `zermatt-backup-schedule.yml` scheduled runs dated 19, 20, 21, 22 and 23 November each completed with `success`. This supplies an independent scheduled backup route while the Windows `CHRiS Zermatt AES256 Offsite Backup` job remains unreliable; expiration and independent Google Drive copy still require monitoring.

## 23 November — live source platform dependency audit and local migration preflight

- **Verified source metadata (read-only):** Supabase project `ldmwsptljgnspwtwcdtm`, PostgreSQL 17.6, `public` **123 tables**, `auth` **27 tables**, `storage` **10 tables**, `realtime` **3 tables**, `vault` **1 table + 1 view**, `extensions` **2 views**. The `public` schema has **14 RLS-enabled tables**, while the `pg_policies` inspection returned **0 policies**. Extension inventory: `pg_stat_statements 1.11`, `pgcrypto 1.3`, `plpgsql 1.0`, `supabase_vault 0.3.1`, `uuid-ossp 1.1`.
- At inspection, Supabase-managed `auth.users`, `storage.objects`, `storage.buckets` each had **0 rows**. These are metadata counts only. **No inference is made that CHRiS application identities, authorization or documents are fully recoverable.**
- A fresh Windows execution of `migrationPreflight.cjs`, with the correct existing PostgreSQL **17.11** tooling path supplied, returned `BLOCKED`. Outstanding conditions: `SOURCE_CONNECTION_NOT_CONFIGURED`, `TARGET_CONNECTION_NOT_CONFIGURED`, `DISTINCT_DATABASE_DESTINATIONS_REQUIRED`, `SECURE_DESTINATION_APPROVAL_REQUIRED`. The protected existing Zermatt backup source credentials were **not copied into the migration preflight**; encrypted archive recoverability is separate from live source/target transfer authorization.
- Render staging target `dpg-dbvug07f3r2c7386bm90-a` remains `available`, PostgreSQL 17, **free**, no HA, expires **20 December 2026**. It is NOT suitable or approved for durable Zermatt production and confidential data was not transferred to it.
- Added `tools/zermatt-migration/platformDependencyInventory.cjs` and `backend/tests/zermattMigrationPlatformDependencies.test.js`. This read-only metadata inventory adds an independent fail-closed platform acceptance gate and ensures **public-schema restore by itself cannot authorize production cutover**. Dedicated GitHub migration gate workflow passed on commit `cce7e78d5de6b35cf6886dd4fc092fffca3c8988`.
- **Next go/no-go decision:** identify a durable monitored PostgreSQL 17 destination with protected backups, off-site retention, TLS, extension/role compatibility, application login and document recovery acceptance, and a rehearsed rollback. Do not approve source deletion, switch the live DATABASE_URL or use expiring Render Free as production.

## 23 November — Supabase continuity risk and read-only security/performance advisors

- Supabase organization `tqwhndyjovmuvtyizzaa` is confirmed on the **Free** plan, not Pro. Support ticket `SU-563995` states the egress overage grace period **cannot be extended to 22 December**; next billing-cycle reset is **17 December 2026**. Prior reported grace deadline is **11 December 2026**, so a service-availability gap is possible if overage remains. Support warned of possible API 402 errors, read-only/paused projects, or service restrictions. **No extension is confirmed.** Verify current measured egress on `https://supabase.com/dashboard/org/tqwhndyjovmuvtyizzaa/usage` before choosing mitigation. Do not assume cache/query changes will clear already accrued egress without official billing confirmation.
- Read-only Supabase security advisor: **14 `public` tables** have RLS enabled with no row policies. These may intentionally be accessible only to trusted backend roles; review application access paths before changing any policy. Reference: `https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy`. **No RLS changes authorized or performed.**
- Read-only Supabase performance advisor: **159 unindexed foreign-key notices**. An index rollout could impact writes and should be evaluated separately; no live indexes were created. Reference: `https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys`.
- Supabase egress includes traffic from the shared pooler and the Database/Data API, Auth, Storage, Realtime and other services. An encrypted backup from GitHub or a database client can contribute some network egress, but the dominant source must be diagnosed from Supabase Usage Breakdown before drawing a conclusion. Official guide: `https://supabase.com/docs/guides/platform/manage-your-usage/egress`.
- **Business continuity gate:** until a dependable independently operated destination is proven, prioritize restoring allowance compliance or obtaining an authorized paid Supabase bridge before any reported grace cutoff. Render free rehearsal database is NOT an acceptable substitute for production.
