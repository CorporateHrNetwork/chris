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

## Connected verification follow-up — 18 October 2026

Desktop Commander reconnected. Read-only checks confirmed:
- Supabase project chris-zermatt-pilot-db (ldmwsptljgnspwtwcdtm), PostgreSQL 17, ACTIVE_HEALTHY: 81 completed migrations and 113 public base tables.
- Separate project chris-compliance-staging-db (amnbmmewmvbtiylhquin), PostgreSQL 17, ACTIVE_HEALTHY: 64 completed migrations and 95 public base tables.
- Each contains corporatehr-network and zermatt-liquor-limited organizations. The staging Zermatt record is named Synthetic Staging.
- The desktop backup connection targets the Zermatt project. Its local status marker records 17 October 2026 14:48 UTC. This is distinct from the cloud backup verified earlier.
- Public frontend at https://chris.crnetwork.com.ng/login references https://chris-zermatt-api.onrender.com. Its deployed JavaScript bundle is index-CRIfBfWc.js. This does not verify the API's runtime database or deployed source SHA.
- /api/health request timed out after 20 seconds; that alone does not establish an outage.
- PR #120 compliance workflow 39115308473 passed.
- Desktop checkout is on feature/billing-catalog-zermatt-contract-20261017 at 04efd3e and contains untracked work; it was not changed.

### Verified database gap

Staging lacks these 17 completed production migrations:
- 20260927231500_allow_loan_legacy_reactivation
- 20260929183500_zermatt_leave_allowance_reference_policy
- 20260930173000_zermatt_department_cost_centre_reconciliation
- 20260930182000_shared_takeaway_designations
- 20261001184500_backfill_zermatt_housing_derived_rent_relief
- 20261001191500_zermatt_employee_self_service_role
- 20261001193000_zermatt_rent_relief_gross_11pct_x56
- 20261001201500_zermatt_employee_news_portal
- 20261002184000_internal_news_attachments
- 20261007190000_chris_payroll_performance_automation
- 20261008203000_ess_communications_categories
- 20261013233000_payroll_sequential_approval_workflow
- 20261014003000_payroll_approval_assignments
- 20261014010000_employee_celebration_notification_ledger
- 20261014150000_zermatt_payroll_approval_roles
- 20261016110722_zermatt_leave_allowance_net_pay
- 20261017002000_zermatt_payroll_notes_agent

Staging lacks 18 production table names, including payroll approval workflows/events/assignments, internal news, employee celebration ledger, payroll notes/inboxes/events/overrides, performance/automation tables, designation department eligibility and leave allowance references. No staging-only public base table names were found. Table counts/names are not a full column, index, policy or data parity check.

### Source reconciliation

Candidate branch feat/zermatt-payroll-notes-agent-20261017 contains source for all 81 production migration names. Of their recorded checksums, 59 match file bytes exactly, 20 match after newline conversion, and 2 remain unexplained:
- 20260821130000_add_employee_exit_cancellation_audit
- 20260821170000_add_employee_line_manager_assignments

All 17 migrations missing in staging are exact checksum matches in that candidate. This establishes migration-source availability, not a verified deployed application version. Candidate and main diverge (451 candidate-only commits and 38 main-only commits); do not merge wholesale.

### Remaining execution prerequisites

Preserve and restore-test the current staging database before an upgrade. Reconcile migration drift and inspect tenant-specific DML. Rehearse the candidate schema upgrade on an isolated copy; compare generic Standard and synthetic custom behavior. Resolve actual staging frontend/API host, deployed commits and runtime database mappings through the hosting account. Render connector still exposes a workspace with no service listing; the remembered service is not available there.

No staging refresh, production writes, credential changes, project creation, migration-history alteration or deployment was performed. Do not mark old migrations as applied merely to bypass validation.
