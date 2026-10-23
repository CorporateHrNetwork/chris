# Fictional sales demo onboarding

Run `seed-sales-demo-onboarding.sql` only against the confirmed compliance staging database, never the Zermatt pilot database. This is a manual data seed, not an application startup hook or schema migration.

The script requires organization ID `chris-demo-org-20261022` and slug `chris-demo-company`, exactly 48 employees, NSD employee numbers, and reserved `northstar-demo.example` email addresses. It creates one fictional workflow and missing onboarding records with 40 tasks each. Existing onboarding records are skipped; template collisions abort. All writes are atomic and serialized by a transaction advisory lock. It does not update employees, users, credentials, documents, permissions, or any other tenant.

The four cohorts contain 12 employees each at 0%, 14%, 43%, and 71%. Personal/contact/payment values are deliberately fictional placeholders. Legal completion represents a fictional demonstration, not actual consent or contract execution. Statutory and document requirements remain incomplete. No document files or claims of completed onboarding are fabricated.

Validation on 23 October 2026: rollback trial created 48 records; applied seed created 48 records and 1,920 tasks; demo-scoped relationship checks found zero invalid links and zero inconsistent progress values. A second run preserved the exact record fingerprint and counts. Live demo login and tracker displayed 48 records. Non-demo login slug was rejected with DEMO_ORGANIZATION_REQUIRED (403).

This data correction needs no production merge or runtime code changes. Keep PR #147 draft and unmerged.
