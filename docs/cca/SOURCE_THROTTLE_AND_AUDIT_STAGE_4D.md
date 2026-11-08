# CCA Stage 4D — Source Throttling and Independent Audit Research

This work remains on the isolated draft feature branch and has no production
or live CCA-login integration.

## Source throttling

`tools/cca-local-demo/sourceThrottle.js` is an isolated, in-memory prototype
that limits authentication failures by a **server-verified** peer identifier.
A browser-supplied `X-Forwarded-For` or arbitrary request body field must
never be accepted as the source identity. It fails closed on exhausted tracking
capacity. It currently **does not survive restart**, support distributed
processes, or integrate with the existing administrator login.

Before integration, identify the authoritative peer address from the direct
socket or a deliberately configured trusted reverse proxy. Add a persistent,
distributed throttle, request abuse controls and operational tests.

## HMAC-linked audit ledger

`tools/cca-local-demo/auditLedger.js` is a separate local-file, single-writer
audit prototype. Each event has a sequence, predecessor digest, and a SHA-256
HMAC with an independently supplied signing key. It detects modifications or
missing intermediate lines and fails closed if a signature is invalid.

**Important limitations:**
- Deleting a valid suffix, replacing the entire log or restoring a previously
  valid copy can evade chain verification without a separately retained,
  protected anchor/checkpoint.
- Filesystem concurrency and safe transactional coordination with identity
  changes are not implemented.
- The signing key must not be stored alongside the ledger or committed.
- This is not an immutable, externally anchored compliance audit record.
- The log has not been integrated with the identity vault or the running
  authentication server. Real production audit events are not recorded.

## Next activation gates

1. Choose a managed, secure identity service or an independently reviewed
   identity store and key-management design.
2. Add persistent rate limits validated against trusted source identity and
   account identifiers.
3. Add protected log anchoring plus a transactional outbox or equivalent so
   identity changes and audit events cannot silently diverge.
4. Complete secure enrollment, multi-party approval, recovery and mandatory
   revocation reconciliation before opening a real login API.
5. Test in isolated staging and complete an independent security review.

## Tests

From the feature-branch root:

```bash
node --test backend/tests/cca*.test.js
```

Only fictional tenant identities and synthetic temporary directories are used.
No new paid subscription or external dependency is required.
