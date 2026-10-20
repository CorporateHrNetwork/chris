# Zermatt quarterly performance evaluation — staging candidate

Status: draft implementation; not a live activation or confirmation that all Zermatt role targets are approved.

## Scope
- Shared published policy in the Performance workspace, manager interface, ESS and Zermatt SOP library.
- Role standards generated from active designations and job descriptions, with AI drafts when a provider is configured.
- 60% role results, 20% quality/service, 20% teamwork/conduct.
- Transparent, versioned goals, measurements, targets, evidence sources and five rating anchors per goal.
- Africa/Lagos calendar quarters; automatic opening and in-system notifications.
- Employee self-review, current line-manager assessment/discussion, independent HR validation, release, receipt acknowledgment, dispute and independent appeal.
- Prospective manager reassignment, development follow-up and auditable history.
- No automatic promotion pipeline, PIP, disciplinary action or payroll changes from this workflow.
- Existing legacy performance writes return 409 for enrolled tenants to prevent bypassing the new workflow.

## Storage and isolation
Uses the existing organization_audits table as an append-only event store with entityType ZermattPerformanceEvaluation. No schema migration or production data rewrite is included.
Per-organization PostgreSQL transaction advisory locks serialize writes and worker startup. Per-entity revisions determine latest state, independently of timestamp ties.
ESS identity comes from authenticated employee linkage. Managers require a current assignment, employee match and authorized branch scope. Organization-wide performance.manage is required for policy/standards/HR operations. Appeal decisions require the assigned independent reviewer.
Policy and role goal versions are copied into each employee scorecard. Published standards are immutable.

## Staging configuration
Only on a verified, isolated staging backend with synthetic employee/user/reporting-line data:
- CHRIS_PE_ENABLED=true
- CHRIS_PE_ORGANIZATION_IDS=<synthetic Zermatt organization UUID>
- CHRIS_PE_SCHEDULER_ENABLED=false initially
- The staged organization slug must be zermatt-liquor-limited, matching the dedicated rollout check.
- OPENAI_API_KEY may be configured through the existing secret mechanism; OPENAI_PERFORMANCE_MODEL selects the provider model.
Never copy production database credentials or personal employee data for this rehearsal.
No email or external messaging is sent. Notifications are scoped in-system inbox records.

Open /performance or /performance/management as organization-wide HR. Verify the draft policy, publish it, then generate missing role standards.
The generator reads active designation records, role descriptions and department names, not employee personal details.
No provider key or a provider failure produces clearly labelled ruleset drafts with placeholders. They cannot be published until targets, evidence and rating anchors are completed.
Missing job descriptions block publication; update the role register and create a draft revision to capture the new description.
Publishing validates all weights and required fields and rejects unfinished placeholders.

Open a prospective cycle only after the standards are validated. Mid-quarter opening explicitly starts from today and does not assess earlier work.
Exceptions identify employees without approved role standards or a unique available manager. Correct the mappings and use Open / reconcile prospective cycle; existing scorecards are preserved and new assignments start today.
Employees hired/transferred mid-quarter need HR review; role changes do not silently replace an existing scorecard.
Use the manager registry to update a reporting line, then Apply updated reporting line on an unreleased review with a reason. Existing self-review remains; any prior manager assessment is invalidated and audit history retained.
After the period ends, self-review is due day 7, manager review day 14, HR validation day 21.
Independent HR cannot validate their own or a review they assessed. Assign an independent authorized HR user for these cases.

## Scheduler
Enable CHRIS_PE_SCHEDULER_ENABLED=true only after verifying staging behavior.
The server starts an hourly runner; repeated ticks and multiple workers use the tenant advisory lock and deterministic cycle/notification IDs.
On the first local calendar day of each quarter it opens the cycle once. A missed first-day opening raises an HR exception instead of backdating goals; HR can open a partial-quarter cycle prospectively.
Task reminders and overdue HR escalations are recorded daily.
To disable new ticks, set CHRIS_PE_SCHEDULER_ENABLED=false and restart. To disable the complete feature, set CHRIS_PE_ENABLED=false; retained history is not deleted.

## Validation
Focused tests:
node --test backend/tests/performanceEvaluation.test.js

The existing test:compliance CI command includes the new tests. Existing PR CI also builds the frontend.
Pure JavaScript tests can be exercised in an isolated harness, but this is not a substitute for Node, PostgreSQL, HTTP authentication and browser acceptance in staging.

Before merge/activation:
1. Confirm the source branch and staging environment are current; inspect PR CI.
2. Run the focused Node tests, existing compliance checks and frontend production build.
3. Rehearse database-backed concurrency with two workers; verify exactly one cycle/card/notification per intended key.
4. Rehearse synthetic employee, assigned manager, unrelated manager, branch HR, organization HR and appeal-reviewer sessions.
5. Confirm standard publication, all-role coverage, missing mappings and prospective reconciliation.
6. Confirm 3.4 = Meets expectations; 3.5 = Exceeds expectations; all band boundaries and no rounding-based promotion.
7. Confirm feedback return/resubmission, independent HR release, employee acknowledgment and dispute, independent appeal with corrected ratings and follow-up.
8. Confirm in-system notification delivery, daily reminder deduplication, tenant isolation, retained history and scheduler disable controls.
9. Review Zermatt's final policy and role standards before any production enablement.

## Limits
No deployment, production scheduler setting, API secret setup, actual role-catalog validation, or management policy sign-off is performed by committing this code.
Disciplinary simplification remains a separate work item; this change does not alter sanctions or disciplinary approvals.


## Local rehearsal completed — 20 October 2026
A dedicated PostgreSQL 16 cluster on 127.0.0.1:55440 and database chris_pe_staging was created for synthetic tests on the connected Windows desktop. No live database connection or employee data was used.
- The full 65-migration chain applied successfully.
- Native frontend production build passed.
- All 15 focused native Node workflow tests passed.
- Nine PostgreSQL/HTTP/Chromium scenario checks passed: login and tenant isolation; role standard publication and missing-description denial; four concurrent opens; prospective exception reconciliation; complete HR review/return/release; independent corrected appeal; notification deduplication; real branch denial; desktop/mobile page rendering.
- Six additional browser interaction checks passed: HR policy visibility; employee ESS submission; manager ratings/evidence/discussion; independent HR release; employee acknowledgment with 3.4 Meets expectations; no JavaScript page errors.
- The browser rehearsal exposed a missing CHRiSAutomationCentre import in the existing route shell. This candidate supplies the lazy import and displays each card's cycle label.

Rehearsal scripts:
- backend/scripts/rehearse-performance-evaluation.cjs: fresh-database synthetic fixture and nine scenario checks.
- backend/scripts/serve-performance-rehearsal.cjs: local role chooser and review server.
- backend/scripts/rehearse-performance-browser.cjs: real form interactions; set CHRIS_PE_BROWSER_RESET_ONLY=true to reset only the designated interactive synthetic case.

All scripts that access the fixture require the dedicated loopback host, port and database. The review server additionally checks the tenant's synthetic legal-name marker and binds to 127.0.0.1 only. Its password-free synthetic role selector must never be exposed through a tunnel or deployed publicly.
The test server removes the API-only Content-Security-Policy from local non-API pages so it can serve the separately built frontend on the same loopback port. Production API security headers are unchanged.

For local review on that connected computer, open http://127.0.0.1:55441/rehearsal while the review server and dedicated database are running.
The quarterly scheduler stays disabled during this review. Actual live role targets, provider-backed AI generation and hosted CHRiS staging are not certified by these synthetic tests.
The connected Render workspace exposed only the portfolio service during discovery, so no hosted CHRiS deployment was attempted.

Stop the local review server when finished, and stop only the dedicated cluster with:
"C:\Program Files\PostgreSQL\16\bin\pg_ctl.exe" -D "C:\Users\developer\Documents\chris-pe-testdata-140\pgdata" -m fast -w stop
