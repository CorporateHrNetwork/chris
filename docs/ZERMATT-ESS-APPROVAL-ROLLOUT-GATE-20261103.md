# Zermatt ESS approval rollout gate — 2026-11-03

**Status: NOT READY / DEFAULT OFF.** This branch must not be merged or deployed as a complete ESS approval workflow.

## Implemented in PR #214
- Zermatt-only stage plans for leave and loans, effective-dated reporting-line lookup, explicit HR and operational approvers, and Head of Audit as a non-blocking read-only observer.
- Database migration for a tenant-keyed approval ledger, with unique request identity, versioning, row locks and organisation audit events.
- ESS leave submission can atomically create its workflow ledger when the feature flag is enabled. Missing approvers abort the whole transaction. Pending days remain reserved through existing leave logic.
- Existing single-step leave review is blocked for routed requests, preventing premature balance posting through the legacy route.
- Employee-owned loan drafts and application-form upload are available only when gated on; no automatic loan submission, disbursement or payroll recovery is introduced.
- Read-only approval timeline routes check active tenant identity, employee ownership or explicit assigned participation.
- Notification plans use idempotency keys and privacy-minimal messages, but are not yet delivered.
- Final leave confirmation now calls the existing leave posting service inside the same transaction as the versioned approval transition and audit event. The employee lock precedes the workflow lock to match cancellation/review ordering. Loan completion still requires evidence of a disbursement recorded by the existing loan service.
- Authenticated management leave decision route binds identity to the session and enforces current stage owner and expected version. Rejection releases pending reservations. Leave RETURN remains explicitly blocked until correction/resubmission semantics are implemented.
- Loan branch approvers now come from the effective-dated reporting chain rather than an arbitrary branch-role match. Both routes reject duplicate manager logins, inactive managers, cross-branch links, missing location authority and branch-manager designation without the assigned role.

## Blockers before activation
1. Implement branch-manager loan submission and decision using the **existing** loan ledger; make the existing Head HR, GM and disbursement endpoints enforce the added branch approval without bypass. Avoid a second source of truth for financial state.
2. Validate atomic final leave confirmation against an isolated staging database. Service tests exercise posting once, rollback on audit failure, insufficient balance, cancelled requests, stale versions and legacy bypass prevention. Real database concurrency, cancellation ledger synchronization and return/correction/resubmission remain blockers.
3. Complete loan stage decision routes, delegated approver handling and manager UI. The leave decision route is implemented; validate active role reassignment/revocation after snapshot creation. Audit remains read-only.
4. Integrate the notification plan with the durable email outbox and retry logic; test email to next owner and visibility-only participants.
5. Add employee loan application form, request history and manager approval inbox in ESS and management UI. Show current owner and completed/pending stages.
6. Verify real Zermatt role mapping, branch location scopes and dated reporting-line assignments in staging; unresolved or duplicate approvers must halt safely.
7. Apply migration to **isolated staging only**, run authenticated end-to-end tests for employee, branch manager, HR, GM, Chief Accountant and Audit. Verify no double payroll deductions and no historical leave-allowance changes.
8. Keep `ZERMATT_ESS_APPROVALS_ENABLED` **unset/false** until all above pass, release sign-off is recorded, and the deployment rollback plan is reviewed.

## Protected behaviour
- No production employee, leave, loan or payroll data migration in this PR.
- No change to leave allowance calculation or payment rules.
- No Zermatt customer data in the Northstar public demo.
- Existing Zermatt leave application backdating and zero-notice exception remains unchanged.


## Validation of this increment
26 focused service tests pass locally. Transaction rollback tests use an in-memory infrastructure fixture and the real leave/approval services; they do not substitute for PostgreSQL migration, concurrency or authenticated browser acceptance. Full repository CI must pass on the new head. No merge, activation, production migration or deployment performed.

## Loan integration increment
- New ESS loans are explicitly marked `essApprovalRequired`; historical and manually recorded loans keep their existing behavior. Migration adds only a default-false marker and the pending-branch status.
- Employee-owned submission now atomically validates collateral and the form, resolves the actual branch manager, creates the approval snapshot and moves the existing loan to PENDING_BRANCH_MANAGER_APPROVAL.
- Existing HR verification, GM decision and disbursement services enforce assigned stages and expected versions for marked loans. Existing financial activation and draft-payroll freshness logic is reused. Direct ledger-only loan advancement is prohibited.
- Payment confirmation requires a payment reference/date; repeated activation is rejected. Stage and outbox writes roll back with the financial transaction.
- Notification rows are queued in the existing loan outbox with deterministic organization/request/version/recipient keys and privacy-minimal content. No production emails were sent during implementation. Delivery worker/retry acceptance remains outstanding.
- Added ESS loan drafts/form upload/submission and a shared participant-scoped approvals inbox in ESS and management Loans. Screen behavior still requires staging browser acceptance.
- 36 focused local tests pass, including seven financial integration tests using real services and synthetic infrastructure. Full CI is required on the new head.
- Still blocked: real PostgreSQL concurrency/migration acceptance, leave correction/cancellation synchronization, loan correction/resubmission, notification dispatch/retry acceptance and authenticated role/browser acceptance. The feature stays OFF and PR remains unmerged.
