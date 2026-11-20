# PR #306 — Isolated CHRiS Backend Integration Validation

Date: 2026-11-17. Scope: **fictional tests only; no deployment or production access**.

## Test environment

- Remote Windows development machine, Node.js v22.23.2.
- An isolated clone at `C:\Users\developer\chris-pr306-validation` from branch `audit/document-presence-diagnostic-20261117`.
- The existing `cca-local` working directory contains unrelated uncommitted changes and was **not** modified.
- Test suite executed in isolated clone:

```powershell
node --test backend/scripts/audit/documentPresenceDiagnostic.test.cjs backend/scripts/audit/documentPresenceIntegrationPrototype.test.cjs backend/scripts/audit/documentPresenceRealAuth.test.cjs
```

## Results

- 25 tests passed, 0 failed, 0 skipped.
- Fictional file existence and absence; unsafe paths; missing or symlinked root; symlinked child directory; 10,000-record bound.
- Fictional tenant scope enforced.
- Actual CHRiS `requireAuth` and `requirePermission` source was used with mocked JWT verification and mocked Prisma. Missing/invalid sessions, ESS, inactive account, cross-tenant invocation, and insufficient engineering permissions were rejected. This is **not** a live JWT or database integration test.
- Feature is disabled by default and calls no database when disabled.
- `git grep` found no references to diagnostic modules in `backend/src` or the backend package startup configuration. There is **no HTTP endpoint or automatic invocation**.
- Backend startup uses `prisma migrate deploy`; no server was started for these tests.
- Git working tree in the isolated checkout was clean after running tests.

## Release blockers and limits

1. This is a prototype, not approved production code. The diagnostic has no operational entry point; production existence counts have never been obtained.
2. The required `support.engineering.document_presence_audit` permission is not currently present in the inspected Zermatt-named Supabase permission catalog. Existing `support.engineering.escalate` is insufficient by design. Do not add/grant roles without approved changes.
3. Real JWT verification, application instance access, storage availability, runtime migration startup, and Render service environment are untested in this validation.
4. A production-grade diagnostic must enforce authorization from server-verified identity, use a default-off flag, rate limiting, audited one-shot execution, and fully controlled tenant binding. Do not expose paths or document bytes.
5. 81 Zermatt-named Supabase metadata records reference local `uploads` paths, but availability of actual binaries is unknown. No employee files were accessed or deleted.
6. Never start the production application or migrate the live database as part of a recovery experiment.
7. A missing upload root causes an explicit failure, rather than classifying all files as missing.

**Disposition:** Retain PR #306 as a draft; do not merge, deploy, or enable the diagnostic until separate security review and Zermatt HR data-custodian approval.
