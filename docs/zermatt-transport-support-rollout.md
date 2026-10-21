# Zermatt Transport Support Pay: preparation and release status

This change supplies a Head HR-only preparation portal. It does not activate the two payroll runs or replace the current salary authority.

## Salary preparation endpoints after deployment

- Upload UI: `/payroll/full-salary-upload`; operating portal: `/payroll/transport-support`
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
- After explicit user approval on 21 October 2026, restored both staging loan functions to their exact recorded pre-experiment body hashes. The independent mid-month guard remains enabled. A staging approval test confirmed zero mid-month loan postings and rolled back all test changes. Staging and pilot employee/payroll totals and loan balances were unchanged; pilot function bodies were unchanged.
- The salary preparation table is provisioned in staging and pilot; no salary batch has been activated. Its Data API grants are explicit, RLS is enabled and anon/authenticated have no access. Server-only no-policy RLS is intentional.

The October 30 change is not a reason to grant browser access to payroll. Every future Data API table needs an explicit, reviewed grant and the appropriate row policies. The current Prisma connection-string path does not need browser table grants.

## Implemented operating flow

- `/payroll/full-salary-upload`: template generation, live employee validation, atomic full-salary import for review. Pending imports can be corrected; activated authorities cannot be overwritten.
- `/payroll/transport-support`: separate run register, activation month selection, generation/recalculation, auditor and GM decisions, approved payout export, actual-payment confirmation and audit history.
- The four responsibility assignments are read from the existing regular payroll assignment table. Head HR submits, Payroll Auditor reviews, General Manager approves, Chief Accountant confirms actual payments. No new assignee list is invented.
- Activation requires a complete salary batch for all current employees and cannot overlap approved payroll. It end-dates old rates, retains historical rows and creates new full-salary authorities with their end-month amount. The existing salary write trigger automatically provisions a new hire's full salary and both elements.
- Regular Nigeria payroll uses the end-month amount for allowances, overtime/public holidays, the 26-day cycle and employee statutory calculations. Non-full-time employees have no employee statutory deductions under the configured split policy. Existing legacy periods retain their original behavior. No annual-leave routine or reference is modified.
- Separate mid-month tables never invoke regular loan, salary-advance or statutory posting. The database loan guard remains as an additional boundary for any marked mid-month entries in regular tables.
- Actual payment is explicitly entered for every line, including zero. Unpaid/overpaid differences become balances due at the next month's 15th. Old balances are consumed exactly once; overpayment recovery is capped at available support and any remainder stays outstanding. No negative payment is generated.
- Runs must proceed month by month. An unreconciled preceding run blocks the next run, so missed payments cannot be silently omitted. Approved/paid runs are immutable, and duplicate confirmations cannot post duplicate balances.
- Source hashes include salary authorities, employment data, balances and bank details. Changed source data must be regenerated and reviewed. Nonzero bank payouts require complete bank data before GM approval.

## Release gates and validation

The preparation and operating schemas and salary-allocation trigger are provisioned in staging and pilot. Both have zero enabled split configurations and zero activated full-salary authorities. Financial record counts/totals and loan balances were verified unchanged. Production payroll remains on its existing authority until application deployment verification and the first complete full-salary batch.

Deployment prerequisites:
1. Identify and verify the actual live API service/source commit. Desktop Commander still reported the device offline during this implementation.
2. Run the dedicated PostgreSQL integration test and frontend build in `.github/workflows/zermatt-midmonth-payroll.yml`. The test refuses any database other than `chris_midmonth_test` and uses disposable fixtures only.
3. Database preparation is complete in the pilot. Verify schema presence during release; do not reapply CREATE statements or execute rollback files indiscriminately.
4. Enable `CHRIS_ZERMATT_SALARY_PREPARATION_ENABLED=true` for imports and `CHRIS_ZERMATT_SPLIT_PAYROLL_RELEASE_READY=true` only after application checks pass.
5. Import the fresh full-salary workbook, select its effective month, then activate it in the portal. No effective month or salary amounts are inferred.
6. Rehearse a fresh encrypted restore before production activation. The latest full restore evidence previously inspected was the 16 October backup restored on 17 October.

Validation completed: 17 local domain/validation tests and syntax checks; all 18 tests (including the full PostgreSQL lifecycle integration test) passed in CI, with zero skips. Both the new payroll workflow and the existing CHRiS Compliance PR Gate passed, including frontend production builds. CI evidence: https://github.com/CorporateHrNetwork/chris/actions/runs/39521649243 and https://github.com/CorporateHrNetwork/chris/actions/runs/39521649326. Application deployment and signed-in end-to-end checks remain blocked because Desktop Commander reports the computer offline and connected Render only lists the portfolio service.
