# Zermatt employee entitlements — 17 November 2026

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