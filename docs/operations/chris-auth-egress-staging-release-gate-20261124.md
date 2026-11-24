# CHRiS HRIS/ESS Query Projection — Controlled Staging & Rollback Gate

Date: 24 November 2026. Draft PR #344. Owner: CHRiS Engineering.
Source issue: #341 (Supabase Shared Pooler Egress).

## Verified
- The billing breakdown reported `Shared Pooler Egress = 100%` of egress measured for individual days 17–24 November. Total 5.64 GB against the 5 GB included allowance; already incurred egress is not reversed by this code change.
- Baseline read-only `pg_stat_statements` displayed repeated broad `users`, `permissions`, `role_permissions`, `organization_locations` queries. Statistics are cumulative query counts, NOT billed bytes.
- Proposed `requireAuth` and `requireEssAuth` query projections exclude unnecessary scalar fields, notably password hash columns and permission descriptions. No authorization caching.
- CI run https://github.com/CorporateHrNetwork/chris/actions/runs/45391791370 PASSED all three jobs: backend compliance; frontend build; generated Prisma 7.9.1 integration using disposable PostgreSQL 17 and fictional user/employee/tenant data. Integration checks include protected HTTP routes and tenant / branch / permission / ESS denials.

## Current release decision
**HOLD.** PR #344 remains DRAFT. GitHub CI is not the same as a deployed CHRiS staging UI session. The existing Render compliance staging API and UI deploy from `fix/zermatt-release-gap-closure`, not this PR branch, so retargeting without dedicated isolation could unintentionally alter shared staging.

## Required staging verification — non-production only
1. Identify a dedicated, fictional tenant staging service with a compatible codebase and a **separate staging database**. Do not point it to the live Zermatt Supabase database or the short-lived production cutover rehearsal target.
2. Deploy the PR SHA from GitHub to that isolated service; record artifact SHA and rollback SHA. Do not enable automatic deployment from `main` while exercising this PR.
3. Sign in using fictional HRIS accounts; check permitted and forbidden branch routes, consolidated Head HR views, revoked role permission on next request and inactive account denial.
4. Sign in using fictional ESS user; check profile, employee association, termination/inactivation denial, and prohibition on using ESS token for HRIS endpoints.
5. Check payroll/TSP read/write endpoint permissions and approval separation using **fictional data only**; do not submit real payroll, pay an employee or alter real benefits.
6. Compare app health, HTTP 401/403/5xx rates, SQL calls/request, response-size metrics and p95 latency against the matching baseline. For real bandwidth verification, read Supabase Shared Pooler usage during equal windows and comparable traffic (allow for its hourly refresh). Changes in billed egress cannot be estimated from query counts alone.

## Rollback gate
- Before switch, record deployed source SHA, previous successful release SHA and current API health. Have an authorized environment operator confirm a reversible release mechanism and deployment permissions.
- If login/ESS, tenant isolation, permission revocation, payroll/TSP access or availability regresses, **roll back to the previous release SHA immediately**. Do not change credentials, relax RLS or move the production database.
- Confirm API health, HRIS/ESS sign-in and payroll/TSP read-only acceptance again after rollback. Record incident and comparison metrics; do not mark complete based on HTTP 200 alone.
- Keep all encrypted scheduled production backup and independent Google Drive mirror tasks operational.

## Deployment / continuity controls
- The changes in this PR are application read-query projections and do not modify the Supabase database schema or hosting.
- No production rollout, PR merge, Render branch switch, subscription purchase, production payroll mutation or database cutover has been authorized by these tests.
- Supabase's organization warning states projects may be restricted from 11 December 2026 if still over quota. A safe backup cannot guarantee live API continuity. Coordinate an authorized paid bridge if needed before the restriction date, while continuing durable PostgreSQL migration independently.

## Existing Render staging service check (24 November)
- `chris-compliance-staging-web.onrender.com` returned HTTP 200.
- `chris-compliance-staging-api.onrender.com/health` initially timed out within 25 seconds, then returned HTTP **200** on a retry. This is compatible with free-service cold start but is not sufficient to prove the cause of the initial timeout.
- Render service `srv-dam8ht142hec738mtov0` is **not suspended**. Latest live deploy is `317a215e096f2aa587e886b36c480ed0d2e94df5` from 11 October on branch `fix/zermatt-release-gap-closure`, **not** PR #344.
- These HTTP probes do NOT constitute authenticated HRIS/ESS acceptance for the optimized PR. Do not retarget the shared service automatically.
