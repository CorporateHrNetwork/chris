# Stage 4A — independent CCA administrator authentication laboratory

**Status:** Isolated local security component and automated tests. It is NOT a
production login, a browser login page, or a deployed identity provider.

## Components

- `tools/cca-local-demo/localIdentityLab.js` — standalone Node.js
  standard-library identity prototype; it is not imported by the existing
  CCA local dashboard server or by production CHRiS.
- `backend/tests/ccaLocalIdentityLab.test.js` — exercises MFA, tenant
  assignment, lockouts, session validation, revocation and expiry.

The lab uses unique CCA-only synthetic identities, scrypt password derivation,
six-digit RFC 6238-compatible TOTP, one-time short-lived challenges,
15-minute opaque sessions, hashed in-memory session lookup keys, and
server-derived grants/tenant assignments.

## Separation from CHRiS

- No connection to `JWT_SECRET`, CHRiS tenant login, tenant database or Supabase.
- No default CCA administrator accounts, passwords or TOTP keys are committed.
- No HTTP login route exists: callers must enroll demo credentials in-memory.
- Nothing authorizes software deployment, billing transactions, tenant
  deactivation, payroll edits or real-world actions.
- No paid products or external npm dependencies were introduced.

## Tests

From the repo root (Node.js 22+):

```bash
node --test backend/tests/cca*.test.js
```

## Before enabling a real login

1. Select and review an established identity provider with MFA and secure
   enrollment/recovery; use a dedicated CCA identity store.
2. Replace in-memory accounts with a protected, audited, persistent identity
   store; do not put password hashes or TOTP secrets into fictional case data.
3. Implement phishing-resistant passkeys/security keys where supported;
   TOTP alone is vulnerable to phishing and social engineering.
4. Add robust credential and MFA rate limits by principal and source,
   anti-enumeration protection, reset/recovery policy and secure session
   cookies/CSRF protection; enforce HTTPS for any non-loopback deployment.
5. Require separate authenticated approver decisions, not a hardcoded
   simulated person from the demo server.
6. Perform penetration/security review and staging tenant-isolation tests
   before connecting the login to the support-desk API.
7. Keep the current CCA local dashboard labelled as a fictional preview and
   bound to 127.0.0.1. Never expose it via tunnel or public hosting.

**No existing running CCA server was reconfigured during Stage 4A.**
