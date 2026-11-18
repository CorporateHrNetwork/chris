# Zermatt Live — controlled release gate (18 November 2026)

Status: **HOLD — preparation only**. This file is a runbook, **not permission to deploy or execute SQL**.

## 1. Recovery evidence and limits

- Encrypted PostgreSQL 17 archive: `zermatt-production-20261118-122143.backup.enc`.
- SHA256: `8F60484ADF4CC840F37CF9D8A2637D3E5E34839849592F5EDE244E268D5A6182`.
- Encrypted off-site copy in access-controlled Zermatt Google Drive backup folder was independently downloaded and checksum verified.
- Isolated PostgreSQL 17, UTF-8 restore of **122 public-schema tables** passed. Restore data directory was securely removed. This validates **application public-schema recovery only**, **not complete Supabase auth/storage/vault recovery**, file storage or application-level sign-in.
- Recheck encrypted archive availability, its digest, credential/passphrase custody, and obtain a **fresh recoverable checkpoint immediately before production database writes**. Never transfer employee plaintext into GitHub, a PR attachment or local working tree.

## 2. Release scope — exactly as HR approved

- `ZLL000046`: Full-Time effective **2026-11-17**; designation-default L2 (V3 internal 202); **16 calendar days** 2026 annual leave, no proration.
- `ZLL000053`: Full-Time effective **2026-11-17**; **individual** L1 (V3 internal 201), not a designation-wide change; **14 calendar days** 2026 annual leave, no proration.
- Named employees: PAYE, **employee** pension and NHF exemption for **all of November 2026**, but employer pension and other employer liabilities independently assessed. Do not conflate classification effective date with full-November pay/attendance.
- Historical EoSB for `ZLL000057` and `ZLL000178` follows the approved closed historic Full-Time service and salary snapshots; current Part-time status stays unchanged.
- **Every Zermatt leave type uses CALENDAR_DAYS**: count weekends and rostered off-days; **exclude approved public holidays**. Do not retrospectively rewrite existing approved leave or ledgers.

## 3. Read-only preflight (verified 18 Nov)

- PR #308 targets `sprint/leave-attendance-management`, the branch used by both Zermatt Live API and Web Render services. Both services currently have **autoDeploy=yes**, so merging can trigger live deployment; never merge merely to test.
- Commit `ed8978ee1bd4e8a9be86d9b469959c60c610563b`: three required GitHub workflows passed.
- Five active Zermatt leave policies have old unit `WORKING_DAYS`, weekend=true, publicHoliday=false; **35** active matrix rows still use old unit. Two target employees are still Part-time. These counts are prerequisites, not consent to mutate.
- October `2026-10` payroll APPROVED. November `2026-11` payroll DRAFT/`RECALCULATION_REQUIRED`. Existing zero employee deductions for the two Part-time employees **do not prove** the new Full-Time exception.

## 4. Release sequencing — execute only during an approved window

1. Confirm Head HR access, named release operator, change window, communications and ability to inspect signed-in ESS. Verify live customer route and tenant slug. Record current Render deploy IDs and Git SHAs for **both** API and Web; verify no unexpected upstream changes.
2. Obtain the immediately pre-write encrypted/off-site recovery checkpoint, verify local + off-site digests and passphrase recovery, and capture limited **tenant-scoped** rollback snapshots of exactly affected employee classifications, individual level assignments, 2026 leave policy metadata, 2026 leave ledger, November DRAFT payroll/TSP and audit references. Do not export sensitive snapshots into PR discussion.
3. Verify CI **at the exact head SHA being released**. Prepare both API and Web release and rollback plans, avoiding unplanned release via auto-deploy.
4. Deploy code **first**, observe Render health and access controls, verify signed-in Head HR and ESS **read-only** rendering, then verify the new `CALENDAR_DAYS` calculator with a test interval including a weekend plus approved public holiday. If any checks fail, halt before SQL.
5. With appropriate change approval, evaluate/execute **held and guarded** SQL `backend/scripts/zermatt-leave-calendar-unit-20261118-HELD-AFTER-DEPLOY.sql` and `backend/scripts/zermatt-employee-entitlement-20261117-APPLY-AFTER-DEPLOY.sql`. Both must run only after rechecking counts/identities and the live release. Require auditable operator identity and before/after row evidence; don't run a script merely because it is present in the repo. No general employee-grade or historic-payroll update.
6. Execute approved targeted 2026 leave provisioning **for exactly these two employees only** through the validated, audited service. Verify no conflicting existing balance or allocation and no duplicate allocations; expected 16/14 calendar days, correct effective date/level, and unchanged unrelated employees.
7. Draft-only November payroll preview/reconciliation: PAYE=0, employee pension=0, NHF=0 for the two; independently verify employer pension and other statutory costs, net pay, special allowance, salary split, attendance, recoveries, TSP and report/export outputs. **Do not recalculate October APPROVED payroll, approve, mark paid or transmit payments.**
8. Revisit signed-in Head HR/ESS: individual levels, historical EoSB, leave ledger/balances, leave request dates, holiday counting, printed/exported results. Record pass/fail and masked evidence. If any gate fails, halt and use the separately approved rollback process.

## 5. Rollback rules

- A GitHub revert / Render rollback may restore **application code** but will **not automatically reverse SQL or restore changed leave balances**.
- For post-write rollback, stop writes, identify exactly which transactions committed, preserve audit trail, and reconcile targeted before/after snapshots. Restore only the affected tenant-scoped rows under operator review; avoid blanket production database replacement or deletion.
- Never reverse settled payrolls, payment statuses, approved leave or unrelated employee entitlements. Full recovery from encrypted archive is a separate exceptional operation, and the current archive was verified for public-schema restoration only.

## 6. No-go conditions

- Missing signed-in Head HR/ESS testing, absence of current verified backup and rollback evidence, changes to source data since preflight, missing or failing CI, uncontrolled automatic deployment, payroll employer-obligation discrepancy, public holiday mismatch, incorrect individual grade, or insufficient SQL/operator audit controls.
- **No production deployment, database writes, recalculation, payment or payroll authorization has been executed by this runbook.**
