# Northstar Demo Industries — staged architecture upgrade

## Scope and non-negotiable boundaries
- Demo tenant: `chris-demo-company`; staging database only, never the real production tenant.
- Preserve `chris-client-demo-10` and the present Northstar demo user and 48 fictional employee records.
- Source of architectural reference: production application **module structure**, not customer-specific data, branding, personnel, policies, legal records, permissions, payroll results, deductions, or financial formulas.
- Never merge the highly divergent production and demo branches wholesale.
- Keep existing demo API middleware enforcing demo-only authenticated reads, fictional tenant identity, non-mutating operation and blocked payments/email/integrations.
- Keep existing demo bundle exclusion/audit for production customer markers.
- No real payroll calculation, approvals, correspondence, employee writes, or banking activity in a client-facing demo.

## Initial inspection
- Production app and demo app are separate Git branches and Render web/API pairs.
- Comparison indicates approximately 166 changed files across the branches, including Zermatt-specific workflows and schema migrations.
- Northstar is an active staging tenant with 48 records and one admin user.
- Sales-demo branch includes its own pricing, employee ESS and performance examples and build-time isolation. These must be retained.

## Increment A — safe structural foundation (this PR)
- Add a tenant-independent architecture manifest for ten shared CHRiS module families.
- Enrich the existing `DemoPolicyWorkspace` with an architecture navigator, fictional example steps, scenario metrics and static demonstration records.
- Preserve tenant-scoped loan register read from the existing demo API.
- Keep all screens strictly read-only; no new API routes, passwords, database writes, migrations, or changes to production.
- Add regression test ensuring fictional identifiers, absence of production customer language, module mapping and active demo-boundary enforcement.
- CI must pass demo frontend build and bundle audit, plus demo API isolation tests.

## Increment B — genuine demo completeness (future separate review)
- Define generic tenant-owned policy configuration schemas and migration strategy, strictly isolated from production customer policy settings.
- Provision fictional, internally consistent records across departments, designations, shifts, attendance, leave, employee loans, benefits, compensation, recruitment and performance.
- Implement useful read-only walkthroughs or explicitly simulated actions that never persist or trigger actual payments or notification systems.
- Validate employee count, tenant scoping, record consistency, no cross-tenant identifiers in responses, and synthetic profile privacy.
- Never use a real employee export as a seed.

## Acceptance and release gates
1. Compare changed files with the **demo** branch; no production policy or migration file changes.
2. CI: code tests, fictional dataset validation, isolation tests, frontend build and bundle audit.
3. Authenticated Northstar walkthrough: navigation, selected modules, 48 existing employees, ESS and role-based access.
4. Cross-tenant negative tests and no-write assertions.
5. Capture latest demo web and API commit SHA, backout path and read-only baseline before deployment.
6. Only then merge into `feature/chris-sales-demo-environment` and verify **both** demo Render deployments report live.
7. Do not touch `sprint/leave-attendance-management` or any production service.

## Limitation
Increment A enhances the module's structural **presentation** and fictional demonstrations. It does not claim that all production module business functions have been ported to the demo. Increment B is required for complete workflow parity.
