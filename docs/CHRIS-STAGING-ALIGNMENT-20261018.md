# CHRiS staging alignment and configuration entry gate

## Verified source baseline, 18 October 2026

Reference main commit: 7bdb59bf6f6b620602bcf3c5e1c03f6a44fadfc4.
This is a repository baseline, not a verified deployed production commit.

| Candidate branch | Commits unique to candidate | Commits unique to main |
| --- | ---: | ---: |
| feature/hartland-staging-prep | 24 | 2 |
| fix/zermatt-staging-headhr-module-parity | 0 | 387 |
| audit/zermatt-live-baseline-20261013 | 301 | 38 |

These counts are ancestry comparisons, not counts of missing features. The Hartland branch contains unmerged Supabase Auth work. Do not replace main with it or merge these branches wholesale. Deployed staging and production identities remain unconfirmed.

Read-only access limitations: confirmed Render workspace returned null for list_services. Desktop Commander DESKTOP-IQEJRMU was offline. No live environment variables or database identities were read. No production or staging deployment or database operation was performed.

## First implementation: navigation gate only

VITE_CHRIS_WELCOME_GATE=true enables the gate on /login at build time. It defaults off. VITE_CHRIS_STANDARD_ORGANIZATION_SLUG must identify a separately provisioned and verified standard organization. Without it, Standard is disabled. No default organization is invented for the Standard choice.

Custom Standards accepts an administrator-provided organization slug. Existing /login?organization=... links prefill the custom input. zermatt-liquor-limited displays Welcome to Zermatt Liquor Limited before sign-in. This is a sign-in label, not proof of authenticated access.

Both paths use the existing login endpoint and organization membership checks. Neither provisions tenants nor switches their business rules. Forgotten-password requests continue to use the selected organization. Changing paths clears entered credentials. Existing authenticated sessions, role checks, deep-link return handling, invitations and password-reset routes are unchanged.

The gate is currently a login-entry flow, not an enforced interstitial for existing sessions. Organization branding for additional clients and server-authoritative configuration-profile eligibility are subsequent work. The Standard slug setting supplies a single entry organization; this first increment is not a complete multi-client Standard onboarding system.

## Required work before staging alignment or live enablement

1. Verify production and staging service IDs, frontend/API URLs, deployed commit SHAs, build settings and PostgreSQL project/database identities without exposing passwords. Establish whether databases are separate. Stop if staging points to production.
2. Inventory direct production changes: schema migrations, configuration, scheduled jobs, file storage, feature flags and integrations. Identify which are reusable core features and which are tenant-specific. Preserve a recovery copy and prove restoration before any database changes.
3. Select a baseline containing verified live milestones. Reconcile divergent branches individually, particularly Supabase Auth migration. Do not assume main equals live.
4. Create a separate staging database and storage destination, with Standard and anonymized custom organizations. Preserve relationships and historical payroll/loan calculations. Do not copy real credentials, refresh tokens or unmasked employee documents.
5. Disable real email, payment, payroll and production webhook actions. Use test credentials and a mail sink. Verify callback URLs and network boundaries.
6. Define server-authoritative configuration profiles and client onboarding. Standard and Custom are organization configurations, not security roles. An ordinary user's path choice must never alter policies, modules or tenant membership.
7. Test organization isolation, login/recovery, permissions, payroll calculations/approvals, loans/history, leave rules, employee workflows, reports, billing and documents for both profiles. Compare Zermatt milestone outputs against the captured baseline.
8. Enable the gate on staging only. Test the UI on desktop/mobile, credential clearing, custom deep links, invalid workspace codes, unavailable Standard configuration and password recovery. Existing authenticated users and ESS entry routes need explicit acceptance.
9. After staging passes, prepare a production release against the verified live commit with backup, rollback and health checks. Disable the gate flag and redeploy the prior frontend for navigation rollback. No database migration is needed by this first increment.

## Local validation

- npm run build: passed with gate default off.
- Targeted ESLint for Login and ConfigurationWelcome: passed.
- node --test tests/organization-login-boundary.test.mjs: 3 passed (mocked API route tests, not live tenant end-to-end tests).
- Gate-enabled build: recorded in PR validation.

No claim of complete staging parity, a completed security audit, production activation or complete application recovery is made.
