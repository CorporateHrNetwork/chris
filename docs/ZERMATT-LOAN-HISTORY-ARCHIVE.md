# Zermatt loan history archive enhancement

## Scope
Read-only UI enhancement on the existing Loans page. No new database schema, loan deletion, repayment posting, balance adjustment, payroll change, status transition or migration.

- Loan register has All, Active/Paused and Completed/Historical filters.
- Searching by exact employee number shows a lifetime list of distinct loan records with status, principal, and profile links.
- Existing loan profile retains posted payroll recoveries, opening history, inferred/runtime-derived periods and recorded external settlements.
- Loan records continue to be protected by existing authenticated `/api/loans` route permissions and location scope.

## Before release
1. Confirm target Zermatt Supabase database backup/snapshot and rollback procedure.
2. QA with anonymised employees: one active loan, one completed loan, one repeat borrower with multiple loans, legacy opening periods and external settlements.
3. Verify completed loans are not counted as active and are still available via individual export.
4. Verify location-scoped HR users cannot read other branches' loans.
5. Confirm frontend build and smoke tests on isolated staging before merging/deploying.
6. Audit completion transitions for approved payroll final repayment separately. No state-write code was changed in this PR.
7. Clearly label runtime-derived historical installments; reconstructed schedule is not equivalent to independently stored posted payroll evidence.

Reference read-only Zermatt snapshot: 74 total loans, 59 active, 15 completed with zero outstanding, and 62 posted recoveries at inspection time. These are not fixtures or assumptions about later data.
