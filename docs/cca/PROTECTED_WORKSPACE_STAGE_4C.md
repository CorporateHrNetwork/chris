# Stage 4C — Protected CCA Workspaces (Local Preview)

This is an isolated prototype, **not** a production-ready administrator system.
It is disconnected from CHRiS, Supabase, billing and deployment endpoints.

## Design

- The standalone CCA login server serves `/protected-centre` and
  `/protected-centre.js` only to an MFA-authenticated local CCA session.
- The server derives available modules from independently verified CCA grants.
  The UI does not decide a user's permissions.
- Every `/api/workspace?module=...` request checks the current session and its
  required permission again; unauthorized modules respond with 403.
- This initial fictional service-agent identity is restricted to support cases
  for `demo-cedar`. It cannot read billing, release or agent-management modules.
- Unauthenticated HTML, JavaScript, and JSON access is denied with 401.
- Login and denial activity in this preview is only an ephemeral in-memory
  illustration, not a durable compliance audit trail.
- Server-side sign-out revokes the local session. Static data is fictional.

## Try locally

From the feature-branch checkout with Node.js 22+:

```powershell
$env:CCA_AUTH_PORT='4183'
node tools/cca-local-demo/localAuthServer.js
```

Open `http://127.0.0.1:4183`, use the temporary startup password and enroll
the newly generated TOTP key in an authenticator application, then select
**Open protected CCA Control Centre** after verification. The existing local
login instance on port 4182 and fictional service-desk instances do not need
to be stopped.

**Every new login process creates different ephemeral credentials**. This
preview does not yet implement persistent account enrollment. Do not rely on
an earlier key or enter real organization credentials.

## Before any real administrator onboarding

A secure identity store, account and MFA lifecycle management, account recovery,
persistent audit logs, secure backup/restore, tested multi-role administration,
phishing-resistant authentication, independent approval for sensitive actions,
and external security assessment are still required. No privileged mutation
routes have been enabled.

## Tests

```powershell
node --test backend/tests/cca*.test.js
```

Draft PR #237 is intentionally unmerged and undeployed.
