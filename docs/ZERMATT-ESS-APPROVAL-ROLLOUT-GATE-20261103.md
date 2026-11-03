# Zermatt ESS approval rollout gate — 2026-11-03

**NOT READY FOR PRODUCTION MERGE OR ACTIVATION.** Keep `ZERMATT_ESS_APPROVALS_ENABLED` unset/false.

## Implemented
- Tenant-scoped, versioned approval snapshots and effective-dated reporting chains. Audit is a read-only observer.
- Atomic ESS leave submission and final HR confirmation using existing leave reservations/balance posting. Rejection releases pending reservations; legacy review cannot bypass routed stages.
- New ESS loans opt in through a default-false `essApprovalRequired` marker. Historical loans and manual external-payment recording retain their accepted behavior. The new migration adds the marker and pending-branch status without rewriting records.
- ESS creates collateral-validated drafts and supporting forms. Submission verifies employee ownership, collateral, form and reporting chain in one transaction before entering branch-manager approval.
- Branch Manager → Head HR → GM → Chief Accountant. The existing HR, GM and disbursement services enforce assigned actors and expected versions for marked loans. Direct ledger-only advancement is blocked.
- Real payment confirmation requires a payment date/reference and recovery month, then reuses existing loan activation/payroll-freshness controls. No new payroll recovery writer is introduced.
- Returned loan applications can be edited by their employee owner and resubmitted on the same account. Resubmission retains decision history, increments the version, clears prior approvals and restarts every stage.
- Server-owned approval identities, entire current loan approver-chain revalidation, frozen submitted terms and immutable borrower identity.
- Participant-scoped approval inbox in ESS and management Loans, showing current owner, stage history, request terms and supporting-form download. Audit receives no confidential financial terms or supporting form access.
- Loan stage notifications enter the existing durable outbox in the approval transaction. Keys include tenant, request, version and recipient. Delivery runs after commit with tenant scoping, row locks, capped retries/backoff and inactive/changed-recipient suppression. The existing retry route is tenant-scoped. A bounded dispatch script can drain queued retries.
- New UI screens load on demand to protect the existing initial bundle budget.

## Validation
Focused local tests cover transaction rollback, role isolation, stale versions, duplicate payment activation, returned-loan resubmission, supporting-document access and notification retry controls. Infrastructure fixtures execute the real financial/approval services; these are not substitutes for PostgreSQL concurrency or authenticated browser tests.

On initial loan integration commit f6e5f670, backend CI passed compliance, full migration rehearsal and payroll/exit regression checks. Frontend compiled, but failed the 500 KB initial bundle gate at 507.22 KB. The next commit switches the new screens to lazy loading; verify the new head before accepting the fix.

## Remaining activation blockers
1. Leave return/correction/resubmission, cancellation-ledger synchronization and current-role/delegation reconciliation.
2. Leave workflow notifications: only loan notifications are connected to the durable outbox in this increment.
3. Validate the complete desired visibility list, including branch supervisory participants, against real Zermatt assignments.
4. Apply migrations only to isolated staging and test real database concurrency and all authenticated roles: employee, branch manager, HR, GM, Chief Accountant and Audit.
5. Verify UI layout, file uploads/downloads, email delivery/retry recovery and approval screens in staging. Configure recurring retry execution in the accepted hosting setup if required; no new paid service is provisioned.
6. SMTP delivery is at-least-once across an ambiguous crash after sending but before recording SENT. Do not claim exactly-once email delivery.
7. Confirm latest-head CI, rollback plan and release sign-off before merge/activation. No production migration or deployment has been performed.

## Protected behavior
Payroll and leave-allowance calculation rules remain unchanged. Existing backdated/zero-notice Zermatt leave rules remain unchanged. No production data or email delivery was used for local validation.
