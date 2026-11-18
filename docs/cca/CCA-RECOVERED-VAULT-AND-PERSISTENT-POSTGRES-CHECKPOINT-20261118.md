# CRNETWORK–CCA — Protected staging vault recovery checkpoint

**Date:** 18 November 2026 (Africa/Lagos)  
**Launch target:** 4 December 2026  
**Status:** recovered parallel staging online; authenticated sign-in and public deployment not certified

## Root cause — verified
- The original protected `CRNetwork-CCA-Stage4D` vault decrypts but fails role validation. Both primary and previous encrypted copies contain unsupported role names, not merely case/whitespace differences.
- SHA-256 primary: `bb4e2681e754d9dcb560431f9c2726f40a7802d59d8fa4eb1bb061a8ba20801a`.
- SHA-256 previous: `97a07d977007ae10fea7585832c6c3c50d552a43b29c73d705efc08a55c12577`.
- Re-checked after creation of a separate recovered workspace; both original source hashes remained identical.
- The original encrypted vault, backup, checkpoint and audit records were not rewritten or reset.

## Non-destructive recovery — verified
- Built read-only comparison and detached, encrypted quarantine tests against both source versions.
- Both variants contained **2 accounts with unsupported roles**; quarantining those accounts with `active=false` and a `CCA_QUARANTINED_NO_ACCESS` sentinel preserves encrypted original role evidence and grants **no** additional access. Existing `cca-staging-operator` remains active and unchanged.
- A full ephemeral rehearsal successfully reconciled a copy of the signed checkpoint and verified the staging server could be constructed, with source hashes unchanged.
- Created **separate** owner-controlled protected `CRNetwork-CCA-Stage4D-Recovered` workspace. It contains an encrypted quarantined primary vault, its independently verified signed checkpoint and copied original audit history plus a logged recovery event. No source destructive changes.
- Started recovered CCA server using explicit `-UseRecoveredVault -UsePersistentPostgres` and a restricted DPAPI-backed PostgreSQL reader. Local loopback service returned `HTTP 200` on `/`, and `HTTP 401` on unauthenticated `/api/staging-postgres-requests` and `/api/fictional-cases`.
- Persistent PostgreSQL on `127.0.0.1:55451` remains online and has separately demonstrated successful encrypted off-site restore with tenant isolation.
- Added regression tests prohibiting quarantined identities from password/MFA authentication or registration, while preserving valid fictional operator MFA. The CCA suite passed **106/106 tests** on commit `c332a6b`.

## Remaining release blocks

1. **Authenticated staging login NOT yet independently verified** on this recovered instance: the existing staging operator password/MFA possession is separate from preserving the identity. Never extract MFA seed or password hashes to simulate an operator login.
2. The parallel recovered workspace is a controlled engineering environment on a Windows workstation; no internet/public customer access, resilient off-device CCA host or full HA has been established.
3. Encrypted **off-site** persistent PostgreSQL backup and independent restoration passed manually, but the *new* database is not yet covered by reliable unattended scheduled backups and alerting.
4. All Domain/DNS, SSL/TLS, VPS/server and hosting catalogue entries remain **request-only**; no registrar/VPS/ACME provider integrations are certified for sales.
5. PR #311 is draft, targets CCA development, and must not be merged/deployed to Zermatt Live as a shortcut.

## Safe next actions

- Test the staging operator's actual password and authenticator through the local UI under operator control; verify MFA→Cedar PostgreSQL request and deny Atlas/cross-tenant access. Do not send passwords or authenticator seeds to chat.
- Design and verify separately authorized recurring encrypted persistent-DB backup and a health audit without altering existing CCA staging scheduled jobs.
- Verify identity review and least-privilege role re-enablement through independent approval; keep quarantined identities disabled until then.
- Plan supported off-device hosting and monitored rollback for 4 December go/no-go.

**Do not claim the recovered UI's HTTP 200 alone means an authenticated operator has successfully logged in or that a public service is deployed.**
