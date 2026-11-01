# Northstar shared architecture upgrade candidate

Target: Northstar Demo Industries, tenant `chris-demo-company`, 48 existing fictional employees, on the sales-demo deployment. CHRiS DEMO LTD (`chris-client-demo-10`) is a separate tenant on the same deployment.

This candidate is based on the current sales-demo branch, not a replacement with the production tree. It ports shared employee-edit change sets, safe catalogue rendering, selection/navigation fixes, employee lifecycle styling, approved-only statutory query presentation and the shared authenticated screen palette.

No customer database, rows, documents, credentials, branding assets, tenant configuration, policy configuration, financial calculation changes, data repair scripts or production migrations are copied. Production services and branches are unchanged.

Validation performed: two delayed-catalogue employee-edit regression cases; approved-only ESS statutory query with tenant/employee isolation and audit-history preservation; production frontend build; whitespace checks.

## Release gates still open

- Authenticate to Northstar using the demo account and verify the existing baseline before a live upgrade. The attempted secure sign-in returned Invalid login credentials.
- Finish a separate review of remaining legacy customer-specific modules/content in the existing demo branch. This candidate must not be described as full feature parity or as proof that the entire existing demo contains no customer-specific wording/rules.
- Verify own-tenant API isolation, download samples, displayed text, permissions/read-only fields, and no outbound live email/payment automations in the candidate.
- Record the current sales-demo deployment IDs and source commit for rollback; confirm existing fictional tenant data remains unchanged after deployment.

Keep this PR in draft and do not merge into the auto-deployed sales-demo branch until these gates pass. This is an engineering release condition, not a request for further approval of already-authorized work.
