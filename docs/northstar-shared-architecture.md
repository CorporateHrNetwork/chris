# Northstar shared architecture and isolation

Target: Northstar Demo Industries (`chris-demo-company`, 48 fictional employees). CHRiS DEMO LTD (`chris-client-demo-10`, 10 fictional employees) is a separate preserved tenant on the same sales-demo deployment.

This change selectively ports shared employee edit change sets, catalogue rendering and navigation fixes, lifecycle styling, approved-only statutory views and ESS PDF payslips. It does not merge production into the demo.

Customer-specific benefit, leave, performance, employment resource and payroll supplement modules are replaced in the deployed bundle by clearly labelled independent read-only workspaces. This release provides shared structural improvements, not full business-feature parity for excluded modules. Branch context uses the tenant-scoped locations endpoint.

The demo API permits sign-in only for its two fictional tenants, cryptographically verifies their tokens before reads and rejects record mutations, email/payment requests and customer-specific/internal endpoints. Background payroll, performance, snapshot and customer activation jobs are disabled. ESS uses the demo API and PDF renderer excludes production branding. No database migrations, tenant policies, production credentials, documents or employee records are copied.

A build-time boundary excludes legacy customer modules, removes the customer logo and fails the release if customer markers or production URLs remain in built JavaScript, CSS, HTML or JSON. Babel is explicitly pinned.

Validation: authenticated Northstar baseline verified; isolation tests cover tenant restrictions and prohibited writes; shared employee regression and ESS approval/isolation tests; PDF download/renderer tests; production build and bundle audit. Pre/post deployment fictional employee and payroll digests are compared independently.

Rollback: restore sales-demo branch commit `5ebdcbec7740eeb450cfb03aa9e487197a38a00a` on demo API `srv-dbd4ckui0phs73emtrdg` and web `srv-dbd3svbl550s73aht530`. Production branch and services are outside this release.
