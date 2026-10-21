# Zermatt Transport Support Pay: preparation and release status

This change supplies a Head HR-only preparation portal. It does not activate the two payroll runs or replace the current salary authority.

## Paths after this branch is deployed

- UI: `/payroll/transport-support`
- Navigation: Payroll → Salary Rates → Full Salary Template & Transport Support Preparation.
- Excel template: `GET /api/payroll/full-salary-preparation/template`
- Preview: `POST /api/payroll/full-salary-preparation/preview` (multipart `file`).
- Import for review: `POST /api/payroll/full-salary-preparation/import` (same `file` and returned `previewToken`).
- List prepared records: `GET /api/payroll/full-salary-preparation`.

The Full Salaries sheet requires Employee No, Full Monthly Gross Salary, Currency (NGN), Effective From (YYYY-MM-01), and Reason. Employee employment type and hire date come from the authenticated organization. Preview includes both normal salary allocations and the eligible new-hire mid-month amount. Do not enter reduced end-month salaries in this template.

Import is all-or-nothing, checks the latest locked employee records against the preview, refuses duplicates, and writes only `PENDING_ACTIVATION` preparation records plus an audit event. No existing salary rate, loan, regular payroll, tax relief or approved history is changed. The import switch `CHRIS_ZERMATT_SALARY_PREPARATION_ENABLED=true` must remain unset until deployment/schema verification; the template and preview need no schema changes.

## Database safeguards applied on 21 October 2026

Pilot project: `ldmwsptljgnspwtwcdtm`. Staging: `amnbmmewmvbtiylhquin`.

- Hardened six pilot/five staging trigger functions with `search_path=pg_catalog,public,pg_temp` and removed browser RPC execute privileges. Function bodies and financial totals were checked unchanged for this hardening.
- Staging's 95 application tables previously granted access to anon/authenticated. Removed those privileges while retaining the PostgreSQL backend and service-role path. Saved the exact prior grants for rollback. Production already denied browser table access.
- Added the isolated `zzzz_block_midmonth_loan_recovery` trigger in both environments. Existing pilot loan-recovery functions were preserved. Entries with `details.payrollElement=MID_MONTH_TRANSPORT_SUPPORT` have zero loan recovery and no loan-recovery posting items; the guard restores only the loan amount recorded as actually deducted. Ordinary end-month entries are unchanged.
- Tested the isolated guard using temporary records, including preservation of a leave amount and the unchanged end-month result. Temporary fixtures are removed at commit.
- After explicit user approval on 21 October 2026, restored both staging loan functions to their exact recorded pre-experiment body hashes, with precondition checks. The independent mid-month guard remains enabled. A staging approval test confirmed zero mid-month loan postings and rolled back all test changes; employee/payroll totals and loan balances were unchanged in staging and pilot, and pilot function bodies were unchanged.
- The new salary preparation table is provisioned ONLY in staging. Its Data API grants are explicit, RLS is enabled and anon/authenticated have no access. Server-only no-policy RLS is intentional.

The October 30 change is not a reason to grant browser access to payroll. Every future Data API table needs an explicit, reviewed grant and the appropriate row policies. The current Prisma connection-string path does not need browser table grants.

## Remaining release work

1. Identify the live API service, source branch and commit. The connected Render workspace lists only the portfolio; the Desktop Commander device was offline during this work. No payroll application deployment was attempted.
2. Reconcile the existing deployed approval implementation with this branch. This branch adds no new approval or payout route and cannot bypass the regular workflow.
3. Supply the first payroll month and fresh salary workbook. Provision the reviewed preparation schema in production only as part of the verified release.
4. Connect reviewed full salaries to effective-dated end-month salary authority, with approved-period locks and rollback. Existing allowance/OT/public-holiday routines must receive the end-month gross; the leave calculation must retain its existing reference.
5. Complete the separate mid-month run/approval/payout/reconciliation ledger using the regular Zermatt approval workflow. Every persisted mid-month line must carry the canonical payrollElement marker. Salary advance/loan recovery routines must not be invoked by this process.
6. Previous unpaid is paid on the following month's 15th; previous overpaid is deducted in a separate column. Reconcile against confirmed actual payment, carry each outstanding balance once, and retain source-period/payment references. Pre-employment days are not arrears.
7. Add new-hire salary-allocation provisioning once salary, employment type and resumption date are complete. Employee creation without a salary must remain incomplete, not infer a salary.
8. Rehearse a fresh isolated restore and compare payroll before enabling any payroll activation. The latest verified full restore evidence in this session was the 16 October backup, restored on 17 October.

Validation: `node --test backend/tests/zermattSalarySplit.test.js`; backend JavaScript syntax checks. A full frontend build and HTTP end-to-end test were not run because project dependencies were unavailable in this environment. This is a draft release, not client-ready payroll activation.
