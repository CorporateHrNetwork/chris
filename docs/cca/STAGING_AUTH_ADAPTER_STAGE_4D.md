# CCA Stage 4D — Isolated Persistent-Identity Staging Adapter

This is a tested **in-process staging adapter**, not a deployed server.

## Integration

- `tools/cca-local-demo/stagingAuthAdapter.js` injects the encrypted
  `identityVault` into the already-isolated `localAuthServer`.
- It maps trusted vault sessions and tenant assignments into server-side CCA
  permissions, without accepting client-supplied role grants.
- The existing sign-in page, MFA screen, protected dashboard and role-based
  workspace denial can run against the persistent vault when a dedicated
  staging harness supplies the vault and audit ledger.
- Failed password requests from a trusted direct socket IP are limited by
  `sourceThrottle` in this prototype.
- MFA successes are appended to an independent HMAC-chained audit ledger;
  if the ledger is damaged, the staging adapter refuses startup.
- Existing demo login ports 4182 and 4183 remain unchanged.
- All tests use fictional accounts and throwaway temporary directories.

## Important limits

The tested adapter does **not** yet provide a safe persistent browser service
on a new port. In particular, the vault and audit signing keys are currently
injected by tests, not provided by an approved secure host key-management
system. The source throttle is still in-memory and is not sufficient against
distributed abuse or server restarts. The local audit ledger does not have
an independently anchored checkpoint, strong rollback protection or
transactional coordination with changes to the identity vault. MFA failures
are protected by the vault's per-account persistent lockout, but source
limiting of all authentication paths remains future work.

The local-only server has no public TLS deployment and must never be exposed
over the Internet. The initial platform approver's enrollment and account
recovery are still operator-only lab functions, not a verified enterprise
workflow.

Do not turn on real administrator onboarding, connect CHRiS tenant records,
or claim enterprise production-readiness based on these tests.

## Regression check

```bash
node --test backend/tests/cca*.test.js
```

Draft PR #237 is unmerged and undeployed.
