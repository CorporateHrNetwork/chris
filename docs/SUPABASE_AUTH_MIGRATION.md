# CHRIS Supabase Auth migration

This branch moves primary CHRIS web sign-in and password recovery to Supabase Auth while keeping the Express/Prisma backend as the source of truth for organization membership, roles, permissions, and location scope.

## Required environment

### Frontend environment
Configure these variables in the deployment environment used by Vite:

```env
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
VITE_API_BASE_URL=https://<your-chris-api-host>
```

The publishable key is intended for browser use. Never put a Supabase service-role/secret key in a `VITE_*` variable.

### Backend environment
Add these to `backend/.env` and the backend hosting environment:

```env
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
# Only needed for the one-time provisioning script; keep server-side only.
SUPABASE_SERVICE_ROLE_KEY=<server-side-service-role-key>
# Public app URL, including the reset-password path, e.g. https://chris.example.com/reset-password
SUPABASE_PASSWORD_RESET_REDIRECT_URL=https://<your-chris-app-host>/reset-password
```

The backend validates each bearer token with Supabase Auth's `/auth/v1/user` endpoint. It does not trust client-supplied role or permission claims. CHRIS membership is looked up by the authenticated email plus the organization ID selected at login; roles, permissions and location access continue to come from Prisma.

## Supabase dashboard setup

1. Open **Authentication → Providers → Email** and enable email/password sign-in.
2. Configure the email confirmation and password policy appropriate for production.
3. Under **Authentication → URL Configuration**, add the app origin to the allowed redirect URLs. Add the exact reset path used in `SUPABASE_PASSWORD_RESET_REDIRECT_URL` if your URL allowlist requires it.
4. Configure the password-recovery email template so the link redirects to the supplied redirect URL and preserves Supabase's recovery tokens in the URL fragment.
5. Ensure SMTP/email delivery is configured before sending real account-recovery emails.

## One-time existing-account provisioning

Existing CHRIS users have password hashes in the CHRIS database, not Supabase. This migration does not copy those hashes or attempt to reverse them. Instead, the provisioning script creates a Supabase Auth identity for each unique email used by an active user in an active organization, or reuses an identity that already exists, and requests a password recovery email.

From the backend directory, after environment variables and database connectivity are verified:

```bash
node scripts/provision-supabase-auth.cjs
```

Review the JSON report and any failures. The script never prints temporary passwords. Users set a new password from the Supabase recovery email. Emails shared by more than one CHRIS organization map to one Supabase identity; organization membership is still checked separately by CHRIS for every request.

**Run the provisioning script deliberately.** It sends real recovery emails. First confirm the Supabase email provider, redirect allowlist, app URL and recipient list. For a staging rehearsal, use a staging database and Supabase project.

## Behavior and safeguards

- The login URL continues to accept `/login?organization=<slug>`.
- Supabase access and refresh tokens are stored according to CHRIS's existing Remember Me choice.
- Express validates the Supabase access token, then resolves the user's active CHRIS membership within the selected organization.
- The `X-CHRIS-Organization-Id` header is a selector, not proof of access; the backend independently checks membership and organization status.
- Existing role/permission middleware and location-scope validation remain in place.
- Employee Self-Service (ESS) keeps its separate legacy token flow in this migration; do not use an ESS token for regular CHRIS application routes.
- This change does **not** enable RLS or create blanket RLS policies. The existing public-schema RLS findings require a separate table-by-table exposure/grants/access-policy review.
- Legacy custom-password reset endpoints are no longer used by the new browser login/recovery flow. Retire them in a separate change after confirming no other client depends on them.

## Verification checklist

1. Install dependencies in a clean checkout and run `npm run build` and `npm run lint` at the frontend root.
2. Run backend syntax checks for `src/routes/authRoutes.js`, `src/middleware/authMiddleware.js`, `src/services/supabaseAuth.js` and `scripts/provision-supabase-auth.cjs`.
3. With staging Supabase/Auth and database environment configured, test:
   - valid email/password sign-in for a linked active organization;
   - wrong password, unknown email, inactive user, inactive organization and unlinked Supabase identity;
   - the same email in multiple organizations, with authorization scoped to the selected organization;
   - expired access-token refresh and invalid refresh-token handling;
   - password recovery, recovery-link return to `/reset-password`, password update, and subsequent sign-in;
   - protected API access without a token, with a malformed token, and with a valid token but no/unauthorized organization context;
   - existing role, permission, branch/location and ESS tests.
4. Do not merge or deploy until the staging tests pass and the required environment variables/redirect URLs are configured.
