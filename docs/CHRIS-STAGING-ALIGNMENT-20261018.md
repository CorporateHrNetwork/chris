# CHRiS staging alignment — verified release candidate

## Verified hosting baseline

Observed in the authenticated Render dashboard on 18 October 2026:

- Workspace: Corporate Resources Network; signed-in account info.crnetwork@gmail.com.
- Project: prj-dai6cf4s728c73a9tfeg.
- Production API srv-dai875uk1f9s73co1rk0 and frontend srv-dai8fpek1f9s73cp6g3g both run ee0bd557070bb615708c8824bbbb519c8c8757a5 on sprint/leave-attendance-management.
- Staging API srv-dam8ht142hec738mtov0 and frontend srv-damlbr4ri2ms73dqjjd0 both run 317a215e096f2aa587e886b36c480ed0d2e94df5 on fix/zermatt-release-gap-closure.
- Production API: https://chris-zermatt-api.onrender.com. Production frontend: https://chris.crnetwork.com.ng.
- Staging API: https://chris-compliance-staging-api.onrender.com. Staging frontend: https://chris-compliance-staging-web.onrender.com.
- Runtime DATABASE_URL identities were inspected without returning passwords. Production targets project ldmwsptljgnspwtwcdtm; staging targets amnbmmewmvbtiylhquin. Both use PostgreSQL 17 through the session pooler on port 5432.
- The old Render PostgreSQL service is suspended. No attempt to reactivate it was made.

The previously connected Render MCP account exposed an empty different workspace; this does not mean the CHRiS services were missing.

## Database audit

Read-only Supabase checks found production has 81 completed migrations and 113 public base tables. Staging has 64 completed migrations and 95 public base tables. Each contains CorporateHr Network and a Zermatt organization; staging's Zermatt record is labelled Synthetic Staging. Organization presence alone is not proof of application deployment parity.

The 17 migrations missing in staging span loan legacy reactivation, leave allowance reference/net-pay policies, department/designation reconciliation, rent relief, ESS roles/news, performance automation, sequential payroll approvals, celebration ledger and payroll notes.

Two old recorded production migration checksums differed from repository bytes, beyond CRLF/LF conversion: 20260821130000_add_employee_exit_cancellation_audit and 20260821170000_add_employee_line_manager_assignments. No migration-history values were altered. Compare actual columns, indexes, foreign keys and historical SQL before any reconciliation.

## Candidate scope

This branch starts from the exact deployed production commit ee0bd55, preserving its login compatibility, ESS routing and business features. It adds only an optional login-entry gate, focused tests and this document. Main is not a production baseline.

VITE_CHRIS_WELCOME_GATE=true enables WELCOME TO CHRiS with CHRiS Standard Configuration and Custom Standards. Default is off. VITE_CHRIS_STANDARD_ORGANIZATION_SLUG must identify a separately provisioned, tested standard organization; absent a valid value, Standard stays unavailable.

Custom accepts an administrator-provided workspace slug. Organization query links prefill the input. zermatt-liquor-limited displays Welcome to Zermatt Liquor Limited on its sign-in form. This label is not authenticated identity; the server checks organization membership. Both paths retain the existing login and recovery mechanisms. Path selection never edits an organization's policies or data.

This is a navigation increment. It does not yet provide multi-client Standard onboarding, configuration profile provisioning, organization-specific custom branding beyond Zermatt, or an interstitial for already authenticated sessions. Staging is a test environment; Standard is an organization configuration intended for deployment to clients.

## Validation

- Frontend production build passed against the verified production baseline.
- Targeted ESLint passed for Login and ConfigurationWelcome.
- Three mocked organization-login boundary tests passed against the production auth route.
- Existing complete migration-chain rehearsal passed in disposable PGlite, checking preservation of synthetic HR/payroll totals and rejection of cross-tenant obligations/settlements.
- These are local tests, not a restore of the current staging database, production recovery, browser acceptance or full milestone parity.

## Required controlled rollout

1. Preserve an encrypted current staging backup and validate restoration into an isolated environment before applying database changes. Keep recovery keys separate.
2. Compare actual staging schema and migration history with the verified production source; reconcile the two old checksums without bypassing validation or marking unapplied SQL as applied.
3. Rehearse the 17 pending migrations against the preserved staging copy. Review tenant-specific DML separately from generic platform schema. Do not import live credentials or unmasked payroll/employee documents.
4. Review staging start/build commands, synthetic fixture flag, V3 startup behavior and background workers. Prevent real email, payroll, payment and production webhooks; use test destinations.
5. Provision explicit Standard and synthetic custom organizations. Test tenant isolation, roles, onboarding, payroll, leave, loan history, approvals, ESS, reports, billing, documents and recovery for both.
6. Deploy the pinned candidate to staging only, after database rehearsal and rollback preparation. Test welcome choices, Zermatt links, generic custom links, invalid codes, forgotten password, ESS, mobile and existing authenticated sessions.
7. Promote to production only after staging acceptance, a fresh verified production backup and rollback preparation. No production change is part of this candidate publication.

Rollback for the navigation gate: disable VITE_CHRIS_WELCOME_GATE and rebuild the frontend. Database migration rollback requires the separate tested recovery procedure; a frontend flag cannot reverse database changes.

No production or staging database writes, environment edits, deployment, password changes, project creation or backup deletion were performed during this investigation.

## Additional pre-upgrade checks

PR #121 workflow 39118840207 passed. The complete local migration rehearsal applied 81 migrations.

For the two old checksum differences, staging and production have identical inspected columns (37 in total across employee_exit_processes and employee_line_manager_assignments), constraints and indexes. This narrows the discrepancy but does not recover or authorize rewriting historical migration checksums. Staging has no unfinished, non-rolled-back migrations.

The complete visible staging environment key list contains no SMTP_PASSWORD, RESEND_API_KEY, PAYSTACK_SECRET_KEY or OPENAI_API_KEY, and no linked environment groups. This checks credential configuration, not all application-side outbound behavior. Render startup is npx prisma migrate deploy && node src/server.js, with backend root and npm install && npx prisma generate build command.

Automatic approval review rejected Download .env because it would export multiple credentials/signing keys beyond backup needs without explicit authorization. No export completed and no alternative secret extraction was attempted. Backup/restore validation is still blocked on an approved, narrowly scoped staging connection handling method. No upgrade or deployment has been attempted.
