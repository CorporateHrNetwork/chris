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
