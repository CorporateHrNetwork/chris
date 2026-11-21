# CHRiS PR #306 — November 18 Readiness Review

**Status: NOT PRODUCTION-READY.** Review conducted with no production access or deployment.

## Verification executed
- Inspected draft PR #306 in `CorporateHrNetwork/chris`, branch `audit/document-presence-diagnostic-20261117`.
- Created clean isolated Windows checkout at `C:\Users\developer\chris-pr306-validation-20261118`.
- Verified commit `05e7328e52672d620bd2daaccd56bd3e28e37618`.
- Executed all three `node --test` document-presence suites: **26 passed / 0 failed / 0 skipped**.
- Searched backend source and startup scripts for diagnostic imports / activation flag: **none found**. No HTTP route or startup hook is registered.
- Previous developer worktrees and Zermatt production remain unchanged.

## Controls covered by automated tests
- Aggregate-only metadata counting on fictional files.
- Missing file, invalid path, wrong tenant, symlinked component, missing or symlinked root.
- Bound of 10,000 records.
- Server-owned environment gate and explicit invocation: both required.
- Real application `requireAuth` / `requirePermission` source exercised with mocked JWT verifier and Prisma identity lookups.
- Reject no session, invalid JWT, ESS, inactive account, Zermatt user attempting platform permission and engineering escalation without dedicated audit permission.

## Critical release gaps
1. **Authorization is not deployed or provisioned.** Dedicated `support.engineering.document_presence_audit` permission was absent from inspected production-like permission metadata; no role changes authorized.
2. **No approved execution mechanism.** The diagnostic is a standalone library; no privileged, authenticated one-time job or endpoint exists. Avoid exposing publicly accessible debug endpoints.
3. **Filesystem TOCTOU caveat.** The code uses repeated `lstatSync` calls and verifies symlinks at inspection time only; paths or files can change between checks. This is a best-effort presence snapshot, not proof of identity or durable availability.
4. **Content integrity unverified.** Counts do not verify read permission, file completeness, checksum, metadata alignment or restoration.
5. **Live database mapping unverified.** Confirm Render Zermatt API `DATABASE_URL` hostname by controlled secret-safe comparison; never log connection credentials.
6. **Backup entitlement and file storage location unverified.** The Zermatt-named Supabase project showed 81 document metadata records pointing to `uploads`, but the actual file bytes have never been inspected.
7. **Operational control missing.** A production plan needs a one-shot executor, change ticket, platform + HR approval, audit trail, timeout, concurrency prevention and immediate disable/rollback.
8. **Privacy scope.** Run only tenant-filtered metadata, return aggregate counts only, avoid employee names, paths, document bytes and connection strings in logs.
9. **Free Render filesystem risk.** Existing local upload records may refer to ephemeral files; do not trigger deployment just to run a check without preserving any recoverable data first.

## Safe next decision
Choose and implement an **isolated non-production rehearsal** of the eventual one-shot execution mechanism with fictional data; verify no public routes, disabled behavior, audit event shape and rollback. Seek security and HR data-custodian approvals before any live service changes.

## Release gate
- Do not merge PR #306 or deploy to production solely because 26 unit/integration-mock tests passed.
- Do not call this recovery-ready or describe any of the 81 original file binaries as present/missing without an authorized real-instance check.
