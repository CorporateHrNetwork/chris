# CCA safe rollout checklist — no changes to CHRiS tenants

This branch implements *pure, disconnected* policy prototypes only. It is
not an installed CCA portal, administrator login, payment workflow or a deployed
tenant lifecycle manager.

## Existing capabilities to reuse
- Support Desk is already present; do not duplicate its ticketing logic.
- WhatsApp inbound webhook currently assigns messages to an environment-selected
  pilot organization, defaulting to Zermatt. That logic must **not** be enabled
  for broad cross-tenant routing until verified tenant identification exists.
- Current internal support permissions are tied to a `corporatehr-network`
  organization slug; replace with independently authenticated CCA platform
  principals as a separately reviewed migration.
- Billing workspaces exist; verify the real subscription state store and payment
  callbacks before granting CCA lifecycle commands.

## Non-production acceptance gates
1. Verify branch auto-deploy is disabled in Render or other deployment services.
2. Run `node --test backend/tests/ccaControlPlanePolicy.test.js backend/tests/ccaLifecyclePolicy.test.js`.
3. Run existing authentication, cross-tenant authorization, support case,
   WhatsApp signature/replay and billing regression tests.
4. Test a synthetic CCA platform identity cannot gain access from a CHRiS
   tenant JWT or from a spoofed organization slug.
5. Confirm a case assigned to tenant A cannot reveal tenant B's content.
6. Reject subscription activation without verified entitlement/payment evidence,
   authorized human decision and a unique idempotency key.
7. Reject suspension without authorized notice review; prohibit automatic
   employee, payroll or client record deletion.
8. Test staging migration down/recovery and a successfully validated backup.
9. Review manual and automatic deploy rules; production merge/release only after
   approval and post-release smoke-test plan.

## Immediate non-destructive additions
- `backend/src/cca/controlPlanePolicy.js`: fail-closed role/permission policy.
- `backend/src/cca/lifecyclePolicy.js`: pure state-transition validation.
- Isolated unit tests; no import into runtime routes, no database migration,
  no UI routing, no webhook changes.

## Explicitly out of scope in this increment
- Conversion of fictional CorporateHr Network records.
- Changing tenant names/slugs, login routes, roles or billing statuses.
- Connecting WhatsApp/email accounts or auto-running AI agents.
- Executing production deployments, releases or renewals.
