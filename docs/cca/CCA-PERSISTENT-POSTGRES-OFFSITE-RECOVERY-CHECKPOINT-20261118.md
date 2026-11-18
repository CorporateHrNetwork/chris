# CRNETWORK–CCA — Persistent PostgreSQL and off-site recovery checkpoint

**Date:** 18 November 2026, Africa/Lagos  
**Launch target:** 4 December 2026  
**Status:** persistent fictional staging DB and off-site recovery verified; protected CCA workspace remains blocked

## Verified engineering milestones

1. **Persistent separate PostgreSQL staging cluster.** The Windows development device now has an independent PostgreSQL 16 data directory under `%LOCALAPPDATA%\CRNETWORK-CCA-ManagedPostgres-Staging`, bound only to `127.0.0.1:55451`, separately from existing CHRiS and CCA databases. Source bootstrap script `tools/cca-local-demo/Initialize-CCA-PersistentPostgres-Staging.ps1`.
2. **Credential custody and isolation.** Randomly generated superuser and read-only app credentials are protected as user-scoped Windows DPAPI blobs. The application login is not a superuser and has no BYPASSRLS privilege; the database contains an explicitly request-only CCA service table with FORCE RLS. Two fictional rows (Cedar and Atlas) were added and persisted. Direct database verification returned total=2, unscoped=0, Cedar=1, Atlas=1. Source `Verify-CCA-PersistentPostgres-Staging.ps1`.
3. **Opt-in CCA read adapter.** `persistentPostgresReader.js` validates the fixed host, port, database, role and staging-only scope. `runStaging.js` and `Start-CCA-Staging.ps1` support **explicit opt-in** for the persistent reader. Normal staging startup remains unchanged; no service provisioning, payments, DNS or SSL certificate actions are enabled.
4. **Encrypted backups.** `Backup-CCA-PersistentPostgres-Staging.ps1` generated PostgreSQL custom-format dumps, encrypted them with CMS AES-256-GCM using the existing CCA recovery public certificate, and transferred an encrypted backup + manifest to `cca_backup:CRNETWORK-CCA-Staging-Backups/Managed-Postgres-CCA`. Off-site comparison and checksums passed. A local encrypted copy also exists. Neither plaintext dumps nor credentials were committed to GitHub.
5. **True off-site restoration.** `Test-CCA-PersistentPostgres-Restore.ps1` downloaded an encrypted archive, checked SHA-256, decrypted it with the existing encrypted CCA recovery private key and protected passphrase, verified plaintext dump SHA-256, recreated required non-login database roles, then restored into a new isolated PostgreSQL cluster and validated total=2, unscoped=0, Cedar=1, Atlas=1. Restoration **PASS**, with temporary decrypted dump, secret files and restore cluster removed.
6. **Regression safety.** `node --test backend/tests/cca*.test.js` — **104 passed, 0 failed** in a clean separate Git worktree. Existing local dirty development checkout and Zermatt production resources were not modified.

## First-attempt issues resolved

- PowerShell startup initially blocked on a native `pg_ctl` pipe held open by the PostgreSQL daemon; replaced with redirected child process startup and readiness verification. The partial isolated test instance was stopped and deleted before successful clean provisioning.
- The direct tenant verification script initially parsed the second-to-last rather than last PostgreSQL result row; confirmed the actual tenant counts were correct and fixed the verifier.
- Initial isolated off-site restore needed the inert source table-owner role to exist in the fresh test cluster; fixed the test and achieved complete restore/tenant-isolation PASS.

## Important unresolved blockers

- **Legacy protected CCA staging identity vault incompatibility.** Normal staging startup and opt-in PostgreSQL startup both independently failed on the existing `CRNetwork-CCA-Stage4D` workspace. A secret-safe read-only diagnostic classified it as `CCA_INVALID_IDENTITY_VAULT`. No vault, checkpoint or audit files were reset, removed or rewritten. This is currently a **blocking operational issue** for the protected CCA host. The new PostgreSQL cluster remains healthy and does not cause that issue.
- **Permanent authenticated CCA runtime not yet running.** The new PostgreSQL reader integration has passed synthetic tests and earlier actual temporary-database MFA integration. The protected live staging application has **not** been connected successfully to its new persistent database; `status.json` correctly reports `liveServiceConfigured=false`.
- **Automated scheduling/monitoring for the new database not yet configured.** A manually verified encrypted off-site backup and actual recovery exist, but unattended backup, independent success/late alerts, and restart-on-boot have not been established for this separate CCA database. Older CRNETWORK-CCA staging scheduled tasks must **not** be claimed as coverage for this new cluster.
- **Off-device production hosting not established.** The Windows machine is a controlled engineering environment, not a commercial multi-customer server.
- **Scope honesty.** Domain registration, DNS, SSL, VPS and hosting catalogue entries remain request-only and are not operational provider integrations.
- **Supabase independence for CHRiS** and live Zermatt file recovery remain separate gated workstreams.

## Next acceptance order

1. Investigate the existing encrypted identity-vault schema incompatibility without wiping the vault; preserve a verified backup and implement a migration/recovery path using fictional rehearsal before working with protected staging state.
2. Confirm an opt-in authenticated CCA session uses the persistent PostgreSQL reader, stays tenant-isolated and survives process restart with rollback.
3. Install a separately authorized, scheduled encrypted backup and off-site restore monitoring workflow for the new cluster; validate signed-out and reboot behavior, alert delivery and key-escrow recovery.
4. Decide and provision appropriately isolated always-on infrastructure outside the Windows workstation; verify full service continuity, DNS, SSL and incident coverage.
5. Pass security and operations go/no-go before public commercial launch on **4 December 2026**.

**No production deployment, merge, customer provisioning, payments, domain registration, certificate issuance or migration of real customer data was performed.**
