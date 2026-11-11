# Project CCA: zero-cost development architecture decision

Date: 2026-11-07
Status: Approved direction for **development prototype only**, not production.

## Verified available resources (read-only)
- Connected Supabase projects: `chris-zermatt-pilot-db` and
  `chris-compliance-staging-db`; both reported ACTIVE_HEALTHY.
- No CCA Supabase database has been created or modified.
- Supabase Free plan currently limits accounts to two active Free projects;
  account plan and billing were not verified. Therefore do NOT provision an
  additional paid project or assume any free slot is available.
- Render service enumeration required an explicitly selected workspace.
  No Render service or billing setting was changed.
- CHRiS production, its authentication, tenant subscriptions and support
  webhook remain untouched.

## Zero-cost development strategy
1. GitHub feature branch + existing Actions CI for purely offline tests.
2. Existing Node.js test runner and no added runtime packages for policy code.
3. Local-only, synthetic-data CCA proof-of-concept; ephemeral local datastore
   (PGlite is already in backend development dependencies) may be used by
   separately tested tooling if a laptop or isolated runner is available.
4. No dependency on live Supabase tenant databases or secrets for prototypes.
5. Preview UI stays disconnected from production routes until independent
   platform IAM and staging safety tests pass.
6. Keep WhatsApp/email inbound in mock mode until identity verification,
   message replay protection and channel approval are implemented.
7. Free cloud previews can spin down or expire; do not rely on them for
   persistent, always-on CCA operations or guaranteed data backups.

## Costs and operational cautions
- Supabase Free can pause inactive projects and carries active-project limits.
- Render Free web services spin down after inactivity; free Postgres expires
  after 30 days and is unsuitable as CCA production system of record.
- GitHub Actions free entitlements and usage vary by account and repository;
  monitor included minutes and avoid unnecessary recurring CI runs.
- WhatsApp Business messaging can carry provider fees; production messaging
  must not be presumed free.
- No payment or plan upgrade is authorized by this decision.

## Future deployment decision
Before a real tenant-facing CCA production rollout, validate a dedicated
project/DB hosting plan, separation of secrets and identities, tested recovery,
service availability, cost ceiling, and human approval. A no-cost development
prototype does NOT establish no-cost production service reliability.
