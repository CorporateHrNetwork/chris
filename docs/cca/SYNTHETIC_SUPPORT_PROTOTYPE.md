# CCA zero-cost synthetic support workflow

Component: `backend/src/cca/syntheticSupportWorkflow.js` (Node.js standard
library, no additional packages).

This is an isolated **memory-only proof of concept**; it has no live agents,
webhook, email, network calls, storage, payment, production database,
tenant-control actions, or user-interface route. It does not create real cases.

## Simulated case workflow
Verified identity + intake policy → NEW → TRIAGED → ASSIGNED →
AWAITING_APPROVAL → APPROVED → AWAITING_CLIENT_VALIDATION → CLOSED.

- Agent recommendation is simulated text, **not an AI model call**.
- A different platform approver must have explicit approval permission and
  an assignment to the originating tenant.
- A client only closes their own tenant-scoped case.
- Duplicate messages are keyed by tenant + channel + source idempotency key.
- The event log is in memory; production requires durable append-only events,
  transactional idempotency constraints, verified channel identity and audit.
- All tenant checks are on the server-side prototype, not mere UI filters.

## Run
`node --test backend/tests/cca*.test.js` (no Supabase or Render credentials).

## Out of scope
No running login, paid tools, operating database, WhatsApp routing, production
service desk integration, employee records, releases or subscriptions.

Integration must be separately reviewed with a real CCA identity store and a
staging database. No production route imports this prototype.
