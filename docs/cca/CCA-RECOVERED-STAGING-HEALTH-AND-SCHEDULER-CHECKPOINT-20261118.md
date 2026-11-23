# CCA recovered staging — health and scheduler readiness (18 November 2026)

**Target:** 4 December 2026. **Scope:** private, fictional CCA staging only.

## Verified today

- Parallel recovered Stage4D service remains on local `127.0.0.2:4184` and uses the separately provisioned persistent PostgreSQL 16 service on loopback `127.0.0.1:55451`.
- Original primary and previous encrypted vault SHA256 values reverified unchanged following quarantine-copy recovery. The two unknown-role identities remain disabled/no-access in the recovered copy; the original vault was not rewritten.
- Unauthenticated `/` returns HTTP 200; unauthenticated protected `/api/staging-postgres-requests` and `/api/fictional-cases` return HTTP 401. The real recovered operator **has not** completed independently verified password/MFA login.
- The new **read-only** `Audit-CCA-PersistentStagingHealth.ps1` returned PASS at 2026-11-18T21:41:34Z. PostgreSQL readiness true, private web true, unauthenticated API gate true, restored-vault evidence true, local encrypted archive SHA256/manifest true; backup age ~1.16 hours, verified isolated restore age ~0.04 days.
- CCA regression tests, including additional quarantined-role authentication tests: **106 passed, 0 failed**, isolated detached Windows Git checkout.
- `Install-CCA-PersistentPostgresScheduledJobs.ps1` added with explicit `-Install` (interactive Windows password prompt on workstation) or `-InspectOnly`. Syntax validated; the safe `-InspectOnly` check returned both new task names **absent**, as expected. Existing `CRNETWORK-CCA-Staging-Backup`, `CRNETWORK-CCA-Staging-Restore` and `CRNETWORK-CCA-Staging-Health-Audit` remain unchanged.

## Not yet done

- **No new scheduled jobs were installed or run headlessly.** Installer needs an administrator session for the actual DPAPI owner and an interactive password supplied locally; without a password logon task, the new database's unattended backups cannot be claimed operational. Do not install as SYSTEM or S4U to bypass the existing user-scoped DPAPI.
- No automatic failure alerts, reboot continuity or off-device always-on CCA service verified.
- No authenticated MFA sign-in against the protected recovered local CCA service yet verified. Do not extract the existing operator's password/MFA secrets to fake a successful test.
- No public managed hosting, domain registration, SSL issuance, VPS provisioning or actual commercial billing integration.
- No production CHRiS cutover, no Zermatt Live change, no merge/deploy from draft CCA PR.

## Next launch priority

1. **On the authorized Windows staging computer**, run the new task installer interactively as the same Windows DPAPI owner (Administrator) and provide the password only in the Windows prompt. Verify task principal LogonType=Password and run a signed-out/reboot trial; examine encrypted off-site backup hashes and validate a fresh isolated restore.
2. Complete genuine CCA operator MFA login in the recovered private workspace and verify `demo-cedar` only in the authenticated PostgreSQL request response; confirm stale session/revocation and cross-tenant denial.
3. Add operator alert delivery for failed backup and stale restore audit, distinguish pilot from public/production service reliability.
4. Prepare off-device hosted deployment and go/no-go security review before 4 December.

**Operational status:** Private staging and manually verified DR = PASS. **Unattended operations and customer launch readiness = NOT YET CERTIFIED.**
