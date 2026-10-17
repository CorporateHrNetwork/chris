# CHRiS Billing — Staging release gate

**No production rollout or Zermatt subscription activation is authorized by this document.**

## Deployment hazard
The existing `backend/package.json` start script runs `prisma migrate deploy` before starting the application. Do not deploy the billing feature branch to the existing production service: the billing migration would be applied automatically.

## Before staging
1. Create a **separate** staging PostgreSQL database and a separate staging service. Never point staging at the live Zermatt Supabase URL or reuse production credentials.
2. Independently verify the staging database identity and network endpoint. Record an operator-confirmed fingerprint without exposing credentials.
3. Confirm a staging restore/rollback procedure, and capture a baseline of representative **synthetic or anonymized** employee, payroll and organization records.
4. Set `CHRIS_ENVIRONMENT=staging`, `CHRIS_BILLING_STAGING_APPROVED=true`, `CHRIS_BILLING_STAGING_DB_FINGERPRINT` to the verified identifier, `CHRIS_BILLING_STAGING_BACKUP_VERIFIED=true`, and the isolated `DATABASE_URL`. These are operator attestations, **not automated proof**.
5. Run `node scripts/billing-staging-preflight.cjs` from `backend`. It performs no network calls or writes and must return `ready: true`.
6. Only after independent review, execute the 76 historical migrations on a fresh staging database, or the additive billing migration on a populated staging clone. Verify existing data counts, organization isolation, and Prisma Client generation.
7. Run `node --test tests/billing*.test.js`, exercise real login/API requests, and validate all seven billing pages.
8. Require a separate production change approval and a verified production backup before any merge/deploy to production.

**Note:** The preflight is an advisory command and is not wired into the existing automatic startup. Passing it alone does not authorize a migration.
