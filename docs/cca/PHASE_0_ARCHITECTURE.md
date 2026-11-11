# Project CCA — Phase 0 / Control Plane Architecture

**Status:** design and isolated policy prototype only. **Not integrated, tested in deployed CHRiS, or released.**
Tracks [#236](https://github.com/CorporateHrNetwork/chris/issues/236).

## Scope

CCA = **CRNetwork Central Agency**, serving multiple CRNetwork products.
CorporateHr Network's existing organisation is a *fictional seed tenant* with
18 stated test employees. It is a candidate for a controlled **platform workspace
conversion**, not a tenant to promote to unrestricted superuser.

### What already exists on main (read-only repository inspection)

- `src/pages/SupportDesk.jsx`: internal ticket queue, responses and resolution.
- `src/pages/MySupportRequests.jsx`: tenant request submission and updates.
- `backend/src/routes/supportDeskRoutes.js`: client/internal support routes and
  WhatsApp webhook.
- `backend/src/services/supportDeskService.js` and
  `backend/src/services/supportDeskAgents.js`: support workflow and agent logic.
- `backend/src/routes/supportDeskClientLifecycleGuardRoutes.js`:
  CorporateHr Network treated as support operator rather than client requester.
- `backend/src/middleware/authMiddleware.js`: tenant-bound JWT -> User with
  `organizationId`, plus a hard-coded `corporatehr-network` exception for
  support permissions.
- `backend/prisma/schema.prisma`: users, permissions, employees and audits
  linked to `Organization`.
- `src/pages/CommercialOperations.jsx`: commercial lead/agent workflow.
- `backend/src/routes/operationalControlRoutes.js`: organization-level billing
  workspace entries, **not** verified platform-wide subscription lifecycle.

### Critical issues requiring separation before CCA goes live

1. **Auth boundary:** tenant-scoped `req.auth.organizationId` and
   `corporatehr-network` slug-based elevated permissions are NOT acceptable as
   final CCA platform authentication. Establish distinct platform principals,
   CCA role assignments, MFA, session revocation, and audit trail. No changes
   to existing `requireAuth` until dual-path compatibility tests pass.
2. **WhatsApp identity:** current webhook selects a pilot organisation using
   `SUPPORT_PILOT_ORGANIZATION_SLUG` with fallback to
   `zermatt-liquor-limited`. Never infer a cross-tenant case owner merely from
   an incoming phone number. Use a verified tenant mapping / secure challenge,
   replay protection and message deduplication before enabling multi-tenancy.
3. **Ticket persistence:** support events are stored in
   `organization_audits`; do not assume unrestricted event enumeration is
   appropriate for a multi-product service control plane. Build a CCA case
   index and tenant-scoped references with access constraints.
4. **Subscriptions:** inspect the actual billing service, payment gateway,
   and product registry before designing idempotent renewal / activation
   commands. Entitlement state must not follow a client-visible status toggle.
5. **Releases:** publishing code is not the same as changing tenant settings.
   Design an approval-gated deployment registry with verified CI and rollback.
6. **Data lifecycle:** archival of fictional employees only after referential
   dependency and backup verification; never run a bulk delete on live data.

### Suggested platform data model (not yet migrated)

- `CcaPrincipal`, `CcaRoleAssignment`, `CcaTenantAssignment`
- `CcaCase`, `CcaCaseMessage`, `CcaCaseEvent`, `CcaAgentTask`
- `CcaApproval`, `CcaActionExecution`, `CcaAuditEvent`
- `ProductRegistry`, `SubscriptionEntitlement`, `RenewalTransaction`
- `TenantLifecycleEvent`, `ProductRelease`, `DeploymentApproval`
- `ChannelIdentity` with scoped and verified tenant linkage

All mutations need reason, actor, tenant/product scope, timestamp and
idempotency key as applicable; retain appropriate data minimisation.

### Prototype introduced in this branch

`backend/src/cca/controlPlanePolicy.js` defines **non-connected** CCA roles,
grants, tenant-case boundaries and mandatory human approval classes.
It deliberately rejects all existing tenant sessions until independent
platform identity verification is implemented. No production route imports it
and it cannot activate a tenant, renew a subscription, run an agent or deploy
software.

Run `node --test backend/tests/ccaControlPlanePolicy.test.js` locally.

### Exit gates for Phase 0

- [ ] Verify existing CorporateHr seed organisation and all dependent rows.
- [ ] Review live/staging deployment and branch controls; ensure no auto-deploy
      of this feature branch.
- [ ] Inspect real subscription, payment and client lifecycle code paths.
- [ ] Confirm platform authentication architecture and least privilege.
- [ ] Confirm database migration / rollback and backup restore readiness.
- [ ] Design cross-tenant support flows and verified WhatsApp onboarding.
- [ ] Test non-regression and isolation before production conversion.

**No production database operation, tenant lifecycle change, rollout or archival
is authorised by this document.**
