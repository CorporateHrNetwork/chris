# Zermatt ESS Leave and Loan Requests — Approved Workflow Specification

**Status:** Implementation specification. The multi-stage workflows described here are **not implemented by the leave timing PR**. This document is the acceptance baseline for a separately reviewed change.

## Tenant boundary and scope
- Only Zermatt Liquor Limited; resolve tenant identity from the authenticated session and database, never from a client-supplied organization selector.
- Employees can originate their **own** leave and loan applications in ESS, view the stage, current action owner, history, and final outcome.
- Effective-dated, authoritative employee reporting-line assignments and active role assignments determine participants. Do not assume that every designation exists in every employee's chain.
- The **Head of Audit & Internal Controls is a read-only observer** of both workflows from submission to closure. Observation is never a blocking gate or an approval.
- The user with the current action alone can approve, reject, or return for correction. Observers can view only information authorized for their role.

## Leave workflow
1. **ESS submission — employee:** Select policy, dates, reason, relief/handover, and required evidence. Show balance and requested chargeable days. Reserve pending days; reject overlaps and insufficient balances.
2. **Eligibility verification — branch HR, or Head HR for HQ/authorized exception:** Verify policy, employment eligibility, leave balance, documentation, date conflicts, and handover. Return incomplete requests with a reason. This is not final approval.
3. **Operational approvals — actual reporting hierarchy, nearest responsible leader first:** Assigned team leader, supervisor, line manager, assistant manager, branch operations manager, or branch business manager, only when each is an actual distinct approved stage in the employee's reporting path. Remove duplicates. The designated final branch manager must be last in the operational chain.
4. **HR confirmation:** After all required operational approvals, branch HR or Head HR confirms the leave, issues confirmation to employee, and records expected return date. HR may not skip unresolved approvals.
5. **Commencement and resumption:** Track actual start, extension/cancellation, return-to-work, and attendance/leave-ledger updates with effective dates and authorization.

**Zermatt timing exception:** Backdated and same-day applications and applications with fewer than seven days' notice are permitted to enter verification and approval. They are **not automatically approved**. All other eligibility, balance, overlap, evidence, leave-year, and policy-calendar rules remain in force. Retrospective changes to approved payroll or paid leave allowance require a separate audited adjustment; never silently rewrite closed periods.

## Loan workflow
1. **ESS submission — employee:** Requested principal, purpose, preferred repayment duration, salary-deduction authorization, and policy-required documents or surety information.
2. **Branch operational approval — assigned Branch Business/Operations Manager:** Assess operational context and recommend/approve progression; cannot authorize disbursement.
3. **Eligibility verification — Head HR:** Validate employment status, applicable loan limits, outstanding loan exposure, affordability, repayment schedule, and policy-required documents. Return for correction or reject with reason. The GM stage opens only after verification.
4. **Final approval — General Manager:** Approve or reject the verified principal and repayment terms. Changes to amount, installments, duration, or conditions must return to Head HR for renewed verification.
5. **Disbursement — Chief Accountant:** Record actual payment date, amount, reference, and payment evidence after GM approval. A GM-approved loan remains **APPROVED_NOT_DISBURSED** until payment is confirmed. No employee can mark their own loan as paid.
6. **Payroll recovery:** Activate deductions only after recorded disbursement, on the approved schedule. Show installments, paid-to-date and outstanding balance in ESS; avoid double deductions and retroactive modification of closed payroll.

## Notifications and access
- At submission and every transition: notify the **current action owner** to act; notify employee, relevant branch leaders, branch HR, Head HR, and Head of Audit of progression as authorized.
- Distinguish **Action required** from **For information** in dashboard and email. Notifications must be idempotent and resilient to retries; failures must not silently advance an approval.
- Emails carry only a brief status, request reference, and secure authenticated CHRiS link; never include medical records, detailed loan evidence, bank data, or other restricted attachments.
- The Head of Audit may view the request timeline, approval decisions, authorized verification summary, loan disbursement/recovery status, and immutable audit events; **cannot edit, approve, reject, verify, disburse, delegate, or advance** either request.
- Restrict documents and notes by role and need-to-know; enforce permissions in the backend, not only in the UI. Audit view access where required.

## Routing and integrity
- Snapshot the assigned approvers and policy version at submission. Preserve a change history when reporting lines change. Resolve missing/duplicate/inactive approvers via HR exception queue; **never auto-skip**.
- An employee must not approve their own application. A person holding multiple adjacent approval roles acts once only where the approved hierarchy permits. A substitute requires explicit delegated authority, expiry and an audit record.
- Approval, rejection, return, resubmission, withdrawal, cancellation, and amendment are explicit states. Material edits invalidate affected downstream approvals; record old and new values.
- Concurrent actions must be serialized; transitions must check expected state and tenant, actor, role, request version, and scope. Ensure notification and payroll side effects are idempotent.
- Leave and loan applications must be independently traceable in ESS and management dashboards, with date/time, actor, action, reason and current owner.

## Acceptance tests before rollout
1. Employee can submit only their own ESS request; cross-tenant and cross-employee access rejected.
2. Backdated, same-day and short-notice Zermatt leave reaches HR review; non-Zermatt timing policies unchanged.
3. Insufficient balance, overlapping leave, missing evidence and inactive employment remain blocked.
4. Leave stages follow real effective-dated reporting hierarchy; branch manager last; no duplicates or self-approval; missing owner halts safely.
5. Loan progresses Branch Manager → Head HR → GM → Chief Accountant; recovery starts only after payment confirmation.
6. Head of Audit receives observer notifications, can read authorized history, cannot mutate or advance either request.
7. Notifications sent once per transition with no sensitive document exposure; failures retry safely.
8. Return/reject/withdraw/cancel/amendment and concurrency cases preserve history and prevent bypasses.
9. Existing approved requests, payroll, loan balances, and Zermatt customer records remain unchanged during migration.
10. All checks pass in an isolated staging environment before any Zermatt production deployment.
