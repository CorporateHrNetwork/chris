# Zermatt probation assessment — ZLL-PROB-1.0

This module is scoped to `zermatt-liquor-limited` only. No existing employee is confirmed, terminated or placed on probation by installing it. The migration is additive and contains no employee-data updates.

## Workflow

- Current employees with `PROBATION` status and an open employment episode receive a review. Initial end date is the employment episode start plus three calendar months, clamped to the last valid target-month day. This handles genuine rehires without using an old original hire date.
- Durable in-app notices are available seven calendar days before the end date. The startup/hourly scheduler catches up after downtime. Notice uniqueness prevents duplicate alerts across restarts and API replicas. It targets the current assigned manager, explicitly assigned Branch HR, and Head HR. Notices appear in the probation workspace and an unread-count link in the signed-in shell. This release does not send email or WhatsApp.
- Assigned Line Manager submits performance, conduct, attendance, evidence references/employee comments, reason and one recommendation: Confirm Employment, Terminate Employment or Extend Probation.
- Branch HR may record evidence verification. Head HR may return for clarification or record the final outcome. Branch HR verification does not replace the manager assessment or give decision authority.
- Confirmation records Active status and confirmation date. Termination records Terminated status and exit date, closes the open employment episode, disables linked user access and writes the lifecycle event. Normal clearance and final-pay work remains in the existing exit process.
- Extension keeps Probation status, retains the original decision and opens a new cycle with revised end date, improvement goals and its own seven-day reminder. Short extensions already within the reminder window notify immediately.
- All decisions require a reason and effective date. Future effective dates are rejected rather than applied prematurely. Overdue reviews remain visibly pending. No automatic confirmation or termination.

## Security and integrity

- API authorization checks tenant and fresh employee/manager/branch relationships on every request. No broad settings or payroll permission substitutes for Head HR authority.
- A review-row lock and optimistic version prevent stale/duplicate decisions; employee lock and open-episode checks prevent deciding an obsolete review.
- State changes, employee lifecycle updates, audit records and notices commit in one transaction. All SQL values are parameters.
- New tables have RLS enabled with no Data API policies/grants; use only the existing authenticated Express connection. Verify the deployment DB role can access them before activation. No new public/anon API access is introduced.
- Existing audit events and payroll values are untouched. Deployment itself makes no individual assessment or employment decision.

## Validation and rollout

`node --test backend/tests/zermattProbationWorkflow.test.js` exercises real PostgreSQL-compatible migration SQL, date boundaries, reminder deduplication, role routing, tenant denial, stale manager assignments, returns/resubmission, confirmation, extension, termination and audit-failure rollback. The frontend build and targeted ESLint checks must also pass.

Before release: confirm the actual Zermatt Render workspace, services and deployed branch; compare the production commit with the PR base to avoid losing runtime patches. Deploy/test an isolated staging database first. Verify migration access under the runtime DB role; verify actual Head HR role names, manager-linked accounts and Branch HR user-location assignments. No recipient should be guessed; missing manager accounts or branch assignments must be corrected through normal authorized access management. Do not import production employee data into a demo.

After deployment: visit `/employees/probation-reviews` as Head HR, review the generated register against probation employee records, verify notices using the intended recipients' accounts, and exercise the three decisions only on isolated synthetic staging records. The server scheduler runs at startup and hourly; monitor its error logs. No browser visit or ChatGPT scheduled task is needed to run it.

Rollback: revert application commits while preserving the additive tables and audit history. Never delete review/notice tables as a routine rollback.
