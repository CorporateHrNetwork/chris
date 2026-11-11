# CCA dashboard preview: disconnected, safe by design

Component: `src/pages/cca/CcaDashboardPreview.jsx`.

This component is **not imported, routed or deployed** in CHRiS. It has no
fetch calls, tenant data, actions, payment methods, login, or subscription
activation. It only shows the proposed six workspaces and an explicit
'Unconnected development preview' notice.

The appearance can be reviewed in an isolated frontend test harness after
platform identity and visual review plans are approved. Do NOT add a general
`/cca` route under `ProtectedLayout`: the current tenant session
is insufficient to authorize platform-level operations.

## Required next integration gates

1. Independent CCA authentication backed by verified platform identities.
2. Server-side authorization at every CCA endpoint, scoped to service and
   assigned tenants; fail closed for current CHRiS tenant JWTs.
3. Platform support registry with privacy-safe ticket and customer linkage.
4. Explicit human approval, independently verified entitlements, idempotency
   keys and complete audit trails before subscription/tenant operations.
5. Verified release deployment pipeline and rollback mechanisms.
6. Staging-only end-to-end testing and documented approval for a production
   rollout. Preserve the existing CorporateHr fictional tenant until its
   dependencies and backups have been verified.

Current feature branch contains *only* isolated policy modules, tests, design
notes, and this disconnected preview. It performs no tenant mutation.
