# Zermatt employee entitlements — 17 November 2026

## FINAL HR INSTRUCTION — 17 November 2026 (supersedes earlier prorated leave preview)
- ZLL000046 Kpokou Michael: Full-Time from 17 Nov 2026, remains L2 (V3 internal 202), **full 16 calendar days annual leave for 2026**.
- ZLL000053 Uchenna Michael Ubagwu (Michael Uchenna): Full-Time from 17 Nov 2026, employee-specific assignment to **L1 (V3 internal 201)** effective 17 Nov, **full 14 calendar days annual leave for 2026**.
- NO proration of the two employees' 2026 annual leave. The earlier 1.9726-day proportional illustration is explicitly rejected and superseded; the prior conversion preview helper/tests are removed from this PR.
- Preserve the Facilities Maintenance Officer designation and its L2 default for unrelated employees; use an audited individual override for Uchenna.
- Existing 2026 leave balances/allocations/requests for these two were confirmed absent. After the controlled classification and individual L1 override, targeted Zermatt provisioning may create **full** 16/14-day annual balance and effective-dated 2026 allocation. It must not overwrite any existing leave balances or approved requests.
- November 2026 PAYE, employee pension and NHF exemption remains separately approved for the full month for both employees. No approvals or payments are created by this change.
## Authorized requested outcomes
- ZLL000046 — Kpokou Michael: Full-Time from 2026-11-17, employee deductions exempt; all applicable full-time leave, allowance, payroll, TSP and EoSB entitlements.
- ZLL000053 — Uchenna Michael Ubagwu: same treatment.
- ZLL000057 — Abang Gift: historical Full-Time service 2021-04-22 through 2026-06-30, snapshot monthly gross NGN 81,956; service days 1,896; gross EoSB NGN 388,471.44 under existing 7.5% / 30-day rule.
- ZLL000178 — Emmanuel Sunday Joseph: historical Full-Time service 2025-01-22 through 2026-05-14, snapshot monthly gross NGN 70,560; service days 478; gross EoSB NGN 84,319.20.
- No historical salary rate or settled payroll should be rewritten.
- Current part-time status of ZLL000057 and ZLL000178 remains unchanged.

## Implementation in isolated branch
- Employee-specific statutory exemption policy guards by organization, employee number, Full-Time status and effective date.
- Payroll computes zero PAYE, employee pension and NHF for the two specified employees, retaining employer-only statutory treatment as independent.
- Historical EoSB uses the approved closed service period and salary snapshot even if the current employment type is Part-time.
- Historical EoSB cannot be pledged as current loan collateral.
- Controlled SQL classification script is intentionally **not** an automatic migration.

## Mandatory pre-production checks
1. Confirm the approved statutory-exemption basis with Zermatt payroll/compliance.
2. Verify a current recoverable off-site backup; production DR workspace remains read-only.
3. Run full backend acceptance/regression suite after installing dependencies in an isolated environment.
4. Verify current/full-time classification and statutory zero deductions in a draft November payroll without affecting approved runs.
5. Verify employer obligations, bespoke deductions, loan recoveries and TSP remain correct.
6. Confirm leave entitlement, annual leave allowance, benefits, and EoSB in both Head HR and ESS views.
7. Confirm full-time conversion effective date is visible in employment history and employee profile; avoid altering original hire dates.
8. Verify historical EoSB service start/end, salary basis and amounts display in employee, EoSB, reports and permitted ESS views.
9. Confirm draft/approved exit settlements and final payroll remain unchanged before and after.
10. Apply the held classification SQL only after code is deployed/verified and an authorized release window is agreed; verify exactly two rows and the resulting audit trail.

## Verification completed (isolated)
- Source syntax checks passed.
- Six focused tests passed.
- Git diff whitespace check passed.

## Outstanding
- No full-suite integration run.
- No Zermatt Live signed-in verification.
- No database write, payroll recalculation, migration, merge or deployment.
- Current implementation uses named employee numbers in a dedicated Zermatt exception module; future configuration should move this to tenant-scoped, audited effective-dated records.
- Supabase project reported multiple tables with RLS disabled; resolve separately with an access-policy plan, not by blindly enabling RLS.

## Additional release-gate verification (17 November)
- 12 selected exemption/EoSB/exit-notice tests passed after installing locked backend dependencies and generating Prisma client in the isolated branch.
- Frontend production build passed (Vite: 774 modules).
- Head HR Gratuity Accounts source now labels historical full-time service and salary basis in the register, printable statement and CSV export. Signed-in verification remains pending.
- Read-only Zermatt database check: ZLL000046 and ZLL000053 have zero 2026 leave allocations and zero 2026 leave balances. A current employment-type change alone cannot provision the ledger for ESS.
- Existing targeted Zermatt leave provisioning service exists, but its execution after classification update must verify employment level, applicable leave policy and the 17 November effective date. It must not overwrite approved leave.
- The live payroll line trigger currently checks employment-type-based exemptions; additional draft payroll-line and obligation reconciliation must verify the employee-specific rule for full-time records.
- Some unrelated legacy leave acceptance assertions expect older literal source text and fail in this branch. These are not evidence of passed leave integration and need independent baseline triage.
- November payroll timing: exemption decision based on period-end date means an effective date of 17 November could zero employee deductions for the entire November payroll period. Confirm partial-month treatment before release.
- No production database writes, migrations, historical payroll recalculations, deployment or payment approvals occurred during these checks.
## HR decision recorded 17 November 2026
- Zermatt confirms its review and approval of the named employee statutory deductions exemption.
- Exemption applies to the ENTIRE November 2026 payroll period (from 1 November); Full-Time employment classification begins 17 November 2026.
- Preserve scheduled salary amounts and approved payroll runs. Do not infer that a full-November statutory exemption also authorizes changing attendance, pay proration or full-month salary treatment.
- HR has not authorized a new payment, payroll approval, release of funds, or rewriting any approved payroll.
- Previous blocker asking which November exemption treatment applies is resolved. Remaining release checks include recoverable backup, live draft-calculation and trigger reconciliation, targeted 2026 leave provisioning, ESS confirmation, and pre-deploy regression.
## Verified active leave policy and provisioning caution
- Live read-only check identified Zermatt v3 active leave policies (from 2026-09-23): standard annual leave, compassionate leave, sick leave, unpaid/casual leave and gender-restricted maternity leave; annual base policy row lists 30 days, but employee-level entitlement overrides may differ.
- Existing targeted Zermatt leave provisioning writes openingBalance directly to annual leave. A 17 November conversion requires an explicit effective-dated entitlement calculation and preservation of prior leave decisions rather than blindly issuing the full-year opening balance.
- Do not present these workers as having leave balances in ESS until an approved conversion proration/entitlement treatment is calculated and persisted in the main ledger.
## Production release branch reconciliation (17 Nov 2026)
- Verified via Render: both Zermatt Live API and web services track `sprint/leave-attendance-management`, NOT GitHub `main`.
- The previous draft PR #307 targets `main` and is not a Zermatt Live release vehicle. This branch starts at deployed-branch Git SHA 5870f60 and selectively integrates employee-specific rules, preserving its later salary splitting, loan and print controls.
- Distinct Zermatt Live EoSB general rule is elapsed days (end minus start), not inclusive. Historical qualifying service dates in the HR instruction are inclusive: only the two historical employees receive +1 qualifying day; other employees retain their existing calculation basis.
- 12 production-targeted focused tests passed, including preservation of salary-split precedence, controlled employer pension handling, and historical EoSB. Production-branch frontend build passed.
- Read-only Zermatt database: November draft payroll contains both affected employees with zero PAYE, employee pension and NHF; run flagged RECALCULATION_REQUIRED. October principal run is APPROVED. No recalculation executed.
- CCA staging backup task failed on 17 November with pg_dump exit code 1; staging health audit flagged attention. A staging restore succeeded on 15 November. This is not evidence of a current successful Zermatt Live production backup.
- Render workspace lists no Render Postgres; Zermatt's connected Supabase production-pilot database must have a separately verified restore-capable backup before any write.
- Full-year leave provisioning is not automatic: both Michael records currently have zero 2026 leave balances and allocations. Targeted leave entitlement must honor full-time effective date 17 November and current Zermatt policy, without overwriting settled leave or assuming an unapproved proration rule.
- Production SQL update stays held until backup, draft payroll, trigger, HR Head and ESS verification and leave-effective-date safeguards pass. No production records were changed.
## Release gate follow-up: effective-dated leave provisioning safeguard
- 17 Nov 2026: added a tenant/employee/year-scoped guard to Zermatt leave provisioning: ZLL000046 and ZLL000053, when Full-Time in leave year 2026, produce EFFECTIVE_DATED_CONVERSION_REVIEW_REQUIRED before any balance upsert.
- The guard is not a substitute for conversion entitlement calculation. An authorized, audited conversion method must determine eligible leave for 17 Nov–31 Dec 2026 and preserve used/pending/approved leave before creating records. The 2027 ordinary full-time path remains intact.
- Added direct cases and source-order verification: 13 selected production-branch tests passed, JS syntax check passed.
- Fictional local CCA staging PostgreSQL responds on 127.0.0.1:55434. This does not resolve the 17 Nov staging pg_dump exit 1. A separate production recovery checkpoint is still required.
- Explicitly avoid using CCA fictional staging backup success as evidence that Zermatt Supabase production data is backed up.
## Follow-up diagnostic and read-only leave conversion assessment (17 Nov 2026)
- Verified ZLL000046 (Kitchen Team Leader / Head Chef) and ZLL000053 (Facilities Maintenance Officer) map to active V3 L2 employment level (internal level 202), carrying 16 calendar days annual leave per V3 configuration.
- Neither employee has any 2026 leave requests, leave allocations or leave balance entries. Active leave policy version 3 remains in force.
- Inclusive period 17 Nov–31 Dec 2026 is 45 calendar days in a 365-day year; straight-line proportional illustration: 16 x 45/365 = 1.9726 leave days, nearest 0.5 = 2 days, floor = 1 day. These are NOT authorized allocations, and the existing tenant leave policy must govern proration/rounding. The new pure helper returns PREVIEW_ONLY_POLICY_DECISION_REQUIRED without writing data.
- Added two preview tests. Combined selected test run: 15/15 passed.
- Diagnostic schema-only pg_dump against the fictional staging database passed. A full custom-format dump to a random temporary file passed; pg_restore list check passed; the diagnostic dump was deleted.
- A manual run of the existing encrypted off-site fictional staging backup script succeeded and published marker cca-staging-backup-success-2026-11-17-165040-495e02e6.json; process exited 0. Earlier scheduled task result remains an unresolved unattended-run check until its next scheduled execution.
- Fictional staging backup success is not evidence of a tested, recoverable Zermatt production Supabase backup. Keep that release blocker open.
## Simulated full-leave provisioning runtime validation (17 Nov 2026)
- Tested real `provisionZermattEmployeeLeaveProfile` with injected nonproduction transaction fixtures for ZLL000046/L2/16 days and ZLL000053/L1/14 days.
- Tests confirm 2026 opening balance and effective-dated allocation, no proration, idempotent repeat calls without duplicate allocation or audit, and fail-closed behavior for Uchenna missing L1 override.
- New guard rejects conflicting preexisting opening balances rather than overwriting them; existing used/pending ledger fields remain unchanged.
- Conversion allocation now writes a targeted `organization_audits` event with leave policy, employee number, effective date, level, full entitlement, and reason.
- 19 selected backend tests passed after these refinements. This is simulated runtime verification, not authenticated ESS or live production verification.
## Backend compliance CI gate correction
- PR #308 compliance workflow initial run failed at payroll upload templates, caused by two VM-based isolated test fixtures (`newHirePayrollProration.test.js` and `loanSuretyShortfall.test.js`) not resolving the newly imported employee-policy module. Frontend CI build passed.
- Fixed the VM harness dependency maps only; no payroll or loan calculation rule was weakened or modified.
- Re-ran the exact payroll employee upload templates / worked days / reports / workflow / new hire / loan / deactivation / final payroll / branch accountant selection from `.github/workflows/compliance-pr.yml`: **60/60 passed** locally.
- Additional broader leave selection **22/22 passed**, and payroll/statutory/TSP/EoSB selection **22/22 passed**, in addition to dedicated full-leave conversion and EoSB-focused tests.
- Full GitHub PR compliance job and production backup/Head HR/ESS checks must pass independently before release.