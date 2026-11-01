# Simplified CHRiS disciplinary workflow

The Disciplinary Procedures page replaces the old three-form discipline interface. Report an Issue, My Pending Tasks and Track Cases are the primary actions. The existing governance URL also embeds this workspace. ESS adds My Disciplinary Cases for the subject employee's issued queries, responses and appeals.

HR screens a report, returns it for clarification or closes it with no case/informal counselling. Formal cases proceed through a query, employee response (or a documented overdue non-response), review/hearing findings, an assigned human decision, an independent appeal and HR closure. No automated finding of guilt, employee-status change, salary deduction or payroll update is performed.

Each case explicitly assigns its HR coordinator, investigator, decision authority and appeal reviewer. The subject cannot own the case; reporter, investigator and decision owner must differ, and the appeal reviewer must be independent of all three. Authenticated line managers may report only their current reports; HR is branch-scoped. Assigned owners have case-specific access. Employee ESS views omit private screening notes, findings, witness evidence and owner details.

Service targets default to 2 working days for screening, 3 for employee response, 5 for review and 5 for appeal. Head HR can configure organization targets; cases retain their initial target snapshot. Working days exclude weekends. HR must account for public holidays and organization policy using a reasoned deadline extension. Warnings require review/expiry dates. Closure requires a recorded follow-up and an ended/resolved appeal period.

Task notices and delivery attempts use the existing disciplinary process-event table. The worker verifies active tenant accounts and current access before emailing a case reference and organization-qualified secure sign-in link. Allegations, evidence, employee identity and decisions are excluded from email. Overdue task notices go to the current owner, HR coordinator and active Head HR accounts. Delivery status is visible within the case; provider acceptance is distinct from inbox delivery. Demo mode suppresses delivery. No retrospective emails are generated for legacy cases.

No schema migration or automatic case conversion is needed. Workflow snapshots, process history, audit events and evidence versions are appended. Cases serialize actions with a row lock and reject stale versions. The old status API cannot advance a managed case and the old process-event API cannot forge new workflow snapshots.

Existing cases and evidence remain intact. An authorized HR officer may explicitly move an open legacy case into screening, assigning independent owners and preserving its old status/outcome as an immutable snapshot. Closed legacy cases remain closed. Existing contract and external verification workflows remain available. External legal/regulatory proceedings never automatically decide an internal employment case.

Validation includes a full response/decision/appeal cycle, tenant and employee isolation, conflicting owner rejection, stale-version rejection, deadline behavior, scoped notifications and real React HR/ESS workflows. No live employee case is created or decided during deployment verification.
