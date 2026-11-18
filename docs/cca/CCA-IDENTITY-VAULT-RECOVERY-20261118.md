# CCA identity-vault recovery and PostgreSQL-staging linkage

**Date:** 18 November 2026 (Africa/Lagos)  
**Target launch:** 4 December 2026  
**Result:** Recovered parallel staging environment STARTED; legacy source remains unchanged.

## Root-cause findings

The original encrypted CCA Stage4D identity vault failed at startup with `CCA_INVALID_IDENTITY_VAULT`. We extended the *existing Windows DPAPI-backed startup path* with a read-only, operator-initiated inspection mode. No decryption keys, password hashes, MFA secrets, employee data or actual role labels were logged or exported.

The diagnostic classified **both** encrypted vault versions as `CCA_INVALID_IDENTITY_VAULT:USER_ROLE_UNRECOGNIZED`. Historical Git records show the list of seven supported roles has not changed since the original Stage4D module. The role mismatch was therefore not confidently attributable to a recent rename.

- Primary original SHA-256: `bb4e2681e754d9dcb560431f9c2726f40a7802d59d8fa4eb1bb061a8ba20801a`.
- Previous encrypted copy SHA-256: `97a07d977007ae10fea7585832c6c3c50d552a43b29c73d705efc08a55c12577`.
- Both hashes were **reverified unchanged after recovery preparation and startup**.

## Recovery approach: no destructive overwrite

1. Added categorized validation errors without exposing encrypted account contents.
2. Created `inspectVaultCompatibility.js` for read-only primary/previous inspection in temporary encrypted copies.
3. Added `vaultQuarantineRehearsal.js` to preserve unsupported role strings as encrypted `quarantineOriginalRoles`, disable affected identities, and assign a specially validated **zero-grants sentinel**, `CCA_QUARANTINED_NO_ACCESS`. Normal enrollment and role-change flows cannot assign it; quarantined identities cannot authenticate.
4. Ran the quarantine on **both encrypted vault copies** in disposable directories. Both passed: **two accounts quarantined**, **one active unaffected**, and the established `cca-staging-operator` identity remains enabled.
5. `rehearseStagingVaultRecovery.js` cloned protected files, validated the signed checkpoint and chained audit, reconciled the temporary copy's new checkpoint, and successfully constructed the CCA staging server while confirming original sources were unchanged.
6. `prepareRecoveredStaging.js` and explicit PowerShell switches `-PrepareRecoveredVault` and `-UseRecoveredVault` created a separate, private directory `%LOCALAPPDATA%\CRNetwork-CCA-Stage4D-Recovered`. The original `%LOCALAPPDATA%\CRNetwork-CCA-Stage4D` was NOT modified. The recovered clone retains the source's encrypted credential/key material and preserved original-role evidence. It has a separately signed audit entry `CCA_IDENTITY_ROLE_QUARANTINED`.
7. Launched the recovered instance using `Start-CCA-Staging.ps1 -UseRecoveredVault -UsePersistentPostgres`, with the previously provisioned persistent PostgreSQL 16 staging reader.
8. Verified only `127.0.0.2:4184` is listening, local sign-in `GET /` returns HTTP 200, and unauthenticated `/api/staging-postgres-requests` and `/api/fictional-cases` both return HTTP 401. Persistent database `127.0.0.1:55451` remains listening.

## Automated regression results

- `node --test backend/tests/cca*.test.js`: **106 passed, 0 failed**, in detached clean checkout after adding quarantine-specific authorization tests.
- Fictional quarantine tests confirmed that unsupported-role identities cannot authenticate even with the correct fictional password; the unaffected fictional operator successfully completed password/MFA and retained only previously valid, tenant-scoped permissions.
- Original encrypted CCA vault and previous backup hashes remained unchanged after preparation.

## Safety boundaries and pending acceptance

- **Recovered workspace is NOT yet publicly hosted, deployed to Render, or configured as a Windows startup service.** It is a running, local engineering instance.
- **An actual password + MFA sign-in by the preserved legacy staging operator has not been performed**, because no operator password or MFA code was supplied to the test. HTTP 200/401 alone is not authenticated end-to-end validation on the recovered instance. Do not mark this complete.
- The two quarantined identities require operator security review and **explicit, independently approved role reassignments** before activation. Never infer their roles from old strings or automatically grant access. The original vault must be retained.
- The persistent PostgreSQL database has passed encrypted off-site backup and isolated real restore; the recovered *identity-vault workspace* does not yet have separate scheduled and off-site restore coverage.
- Current CCA support workflow remains snapshot-backed. Only the optional service-request read path is connected to PostgreSQL. Full application persistence migration remains pending.
- Backup scheduler, signed-out restart behavior, alerting and off-device commercial hosting remain outstanding launch gates.
- No Zermatt production changes, Supabase cutover, domain sales, SSL issuance, server purchases, payment runs, or external client onboarding occurred.

## Safe operator use

For the authorized Windows development computer, `Start-CCA-Staging.ps1 -UseRecoveredVault -UsePersistentPostgres` starts the recovered CCA staging instance at `http://127.0.0.2:4184/`, subject to the writer lock. The original environment remains available as protected evidence but fails validation due to the unsupported role strings.

**Next verification order:** original operator's sign-in + MFA in the recovered local instance; owner audit of the two quarantined identities; separately verified backup/restore of the recovered identity vault; scheduled recovery and monitoring; off-device platform deployment review and a final go/no-go for 4 December.
