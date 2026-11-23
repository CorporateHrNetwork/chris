# CCA authenticated staging PostgreSQL read bridge — 18 November 2026

**Status: Source integration and test suite PASS; actual application-to-PostgreSQL connectivity NOT YET PROVEN.**

## Implementation

- `backend/src/cca/postgresTenantReadAdapter.js`: read-only transaction, parameterized tenant scope, explicit CCA tenant authorization, bounded results, rollback/release and cross-tenant rejection.
- `tools/cca-local-demo/stagingAuthAdapter.js`: obtains full verified operator context from the CCA encrypted identity vault, not request data.
- `tools/cca-local-demo/localAuthServer.js`: optional `GET /api/staging-postgres-requests`, only available when a server-owned `postgresReader` is supplied **and** the server is explicitly marked staging. No URL tenant override; fixed fictional `demo-cedar` scope. Requires an MFA session and read permission, returns safe aggregate request fields, and hides database errors.
- `backend/tests/ccaStagingPostgresBridge.test.js`: test-only injected mock pool verifies MFA, fail-closed default, tenant scope, error suppression and absence from ordinary local demo.
- No production bootstrap injects the database reader; the currently deployed/operating local CCA staging host remains unchanged and the HTTP route remains inactive by default.

## Tests

- Clean detached worktree from commit `223a06fd3e0c523c980566175cc66a536ece389f`.
- `node --test backend/tests/cca*.test.js`: **101 passed, 0 failed**, 22 test files.
- GitHub CCA isolated policy tests and CHRiS Compliance PR Gate: **success**.
- Independent PostgreSQL 16 fictional dump+restore exercise (previous commit `4e60477`): **PASS**, two fictional tenants and two request rows, tenant A and B independently isolated; temp data and credentials removed.

## Launch-blocking work

1. Provision an **isolated, least-privileged PostgreSQL staging role** without `BYPASSRLS` and a `cca_service_requests` table with tenant RLS. Verify grants with database-native tests, not just the query's WHERE clause.
2. Implement explicit opt-in local staging bootstrap for the PostgreSQL pool with encrypted, server-controlled connection parameters. Preserve the existing DPAPI vault, writer lock and checkpoint; no ordinary environment/HTTP parameter may enable privileged connections.
3. Run real MFA -> PostgreSQL query -> restore -> MFA query end-to-end with fictional data; verify state continuity, tenant A/B restrictions, stale-session denial and rollback.
4. Establish a production-grade server and backup location independent of the Windows staging computer. Security-review alerting and disaster recovery before client onboarding.
5. Keep the PR draft and disconnected from CHRiS production until fully validated.

**Scope boundaries:** No Zermatt production access, live client data, provisioned domains/VPS, certificate issuance, payments or actual CCA database cutover have occurred.
