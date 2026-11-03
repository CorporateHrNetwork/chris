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
- Final leave confirmation deliberately fails closed until it can post the leave balance in the same transaction as the approval transition. Loan completion requires evidence of a disbursement recorded by the existing loan service.

## Blockers before activation
1. Implement branch-manager loan submission and decision using the **existing** loan ledger; make the existing Head HR, GM and disbursement endpoints enforce the added branch approval without bypass. Avoid a second source of truth for financial state.
2. Implement atomic final leave confirmation: lock the request and balance, verify all stage approvals, post the existing leave ledger, mark approval completed and emit one audit event in one transaction. Retain the current leave eligibility and cancellation semantics.
3. Add server-authorised stage decision routes with expected-version checks and delegated approver handling; ensure Audit cannot mutate even if they hold other permissions.
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
