# CCA Stage 4D — Independent Identity Vault: Security Evaluation

**Implementation status: isolated backend laboratory only, not activated in
the CCA browser login or CHRiS production.**

## What is implemented

- Separate `tools/cca-local-demo/identityVault.js` encrypted local vault,
  created with a caller-provided 256-bit encryption key (AES-256-GCM).
- Scrypt password hashing with per-user random salts.
- Persistent MFA enrollment secret and one-time-code replay counter.
- Support for the seven explicitly defined CCA platform role names and
  assigned **fictional** tenant IDs.
- Separate platform approver requirement for further account creation and
  role changes; no role changes through browser API.
- Invalidation of active in-memory sessions after a role change; sessions
  are deliberately not restored after a process restart.
- Encrypted prior-snapshot recovery checks. Restoration is explicit,
  offline-only and archives the displaced encrypted file.
- Append-only **within each saved vault state** audit events for enrollment,
  MFA success and role changes. This is not an immutable audit system.
- No customer records or connection to CHRiS login/Supabase/production.

## Hard security limitations — do NOT deploy

The following are **not complete** and must be resolved before persistent
administrator enrollment can be enabled through any browser or API:

1. The first vault account can currently be bootstrapped by a local code
   caller. There is no audited human-verified ownership or recovery process.
2. The vault is an illustrative, **single-process local file**, not a durable
   identity database with transactional concurrency or centralized access
   control. The encryption key must be protected through a dedicated
   secrets-management solution, not saved in Git, screenshots, logs or prompts.
3. Password-attempt rate limits, persistent lockouts, MFA challenge rate
   limits, phishing-resistant factors, passkeys, and safe reset/recovery
   policies must be completed and security reviewed.
4. Role-change requester authorization still requires formal workflow
   design and assessment. Separate approver checks alone are not sufficient
   for enterprise administrator provisioning.
5. Encrypted backup restoration can reintroduce previously revoked roles or
   accepted TOTP counters. Restores must enter a manual security review and
   revalidation mode before any user may authenticate.
6. Audit history remains in the same vault snapshot and can be rolled back.
   An independent append-only signed/event log is necessary.
7. Secure HTTPS session cookies, account suspension, consented enrollment,
   secure recovery, and role-specific workflow tests are still required.
8. Never expose a local demonstration service through a public URL or tunnel.
9. Do not connect this vault to the running local login on 4182/4183 until
   the controls above are addressed. The current login demo still issues
   temporary accounts/MFA secrets on each server startup.

## Automated checks

From the CCA feature branch:

```bash
node --test backend/tests/cca*.test.js
```

The suite covers encrypted persistence, MFA after restart, bad-key and
tampering failures, role-change approval, session revocation, encrypted
backup inspection and explicit restoration. Tests operate only on
temporary directories with synthetic credentials and fictional tenants.

This is entirely within **draft PR #237**, unmerged and undeployed.
