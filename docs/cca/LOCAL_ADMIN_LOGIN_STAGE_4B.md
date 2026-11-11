# Stage 4B — standalone CCA administrator sign-in preview

This is a **local, fictional identity demonstration**, separate from the
existing CCA Service Desk and CHRiS application. It is not a production IdP.

## Start on your Windows computer

```powershell
cd "$env:USERPROFILE\cca-local"
node tools/cca-local-demo/localAuthServer.js
```

Open **http://127.0.0.1:4182** on the same laptop.

The terminal displays a new, randomly generated DEMO password and a TOTP
enrollment secret. Enroll that secret in a trusted authenticator app using
six digits, SHA1, and a 30-second interval, then sign in as
`cca-demo-operator`. The secret and password are NOT written to source control
or to the local fictional case-data snapshots.

Restarting this login server invalidates every login session and creates new
demo credentials; no persistent real administrator account is created.

## Isolated features

- Password proof then separate time-based 6-digit code.
- One-use, short-lived MFA challenges and 15-minute sessions.
- Opaque, HttpOnly, SameSite=Strict cookie; logout invalidates the server-side
  in-memory session.
- Server-side demo role and tenant scope: one fictional Cedar support case;
  no access to Atlas cases, production customers, deployment, or billing.
- Cross-origin login POSTs and unauthorized case reads are denied.
- All routes bind only to 127.0.0.1. Never expose through public tunnel,
  reverse proxy, or cloud hosting.
- The separate server does NOT import or modify live CCA service-desk state.

## Critical limitations

- This is a **demonstration** with credentials and sessions in RAM, not a
  durable admin identity service or a completed MFA enrollment lifecycle.
- No secure password reset/recovery, passkey support, real administrator
  provisioning, production-grade rate limiting or independent security audit.
- The login is plain HTTP for local loopback development only. Public services
  would require HTTPS, secure cookies and phishing-resistant sign-in controls.
- Any local user who can inspect the running process or startup terminal
  should be considered able to obtain the fictional credentials.
- No API route in this demo can perform real customer, payroll, release,
  subscription or tenant-management actions.
- Do not merge or deploy this branch until staging review and isolation
  testing are complete.

## Regression test

```powershell
node --test backend/tests/cca*.test.js
```

No paid tools or additional npm dependencies are required.
