# Hartland (NIG) Ltd — CHRIS staging preparation

## Safety boundary
- Zermatt production/live milestone is out of scope and must remain unchanged.
- `chris-zermatt-pilot-db` (`ldmwsptljgnspwtwcdtm`) must remain untouched.
- This work targets only the existing shared staging project `chris-compliance-staging-db` (`amnbmmewmvbtiylhquin`).
- No production deployment, account provisioning, password-recovery emails, or secret-key commits are authorized by this preparation.
- Do not enable RLS broadly. Review grants, views, functions, and per-table access policies before any security-policy changes.

## Staging environment
Use `deployment/hartland-staging.env.example` as a template. Replace the API host and reset redirect placeholders with verified staging URLs before testing. The publishable key is browser-safe; the service-role key must be configured only in the backend's secret environment.

## Tenant setup and test gates
1. Create/verify the Hartland organization record in staging only; do not modify the Zermatt organization.
2. Confirm the exact legal name, tenant slug, timezone/currency, and the authorized Hartland test administrator before provisioning any account.
3. Add only synthetic/test employee records unless Hartland has explicitly approved use of real employee data.
4. Test organization-boundary enforcement, roles/permissions, location scope, login/logout, refresh, and password recovery using staging-only accounts.
5. Run the application's build/lint and backend tests; record the results.
6. Keep the separate Hartland pilot project as a pending cost/organization approval item. Do not create it until the user confirms the Supabase organization and understands the quoted cost.

## Known blockers
- The staging API host and staging app URL are not yet verified.
- Supabase Auth provider, redirect allowlist, and email delivery settings have not been verified/configured.
- Existing staging security advisor findings require a table-by-table access-policy review.
