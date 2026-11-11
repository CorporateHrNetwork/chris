# CCA token cryptographic verifier — isolated prototype

`backend/src/cca/verifyPlatformToken.js` verifies **RS256** JWS
signatures using a CCA-owned trusted public key and exact trusted key id.
It rejects algorithm confusion, dynamic key URLs, malformed tokens, wrong
signatures and oversized input. The verified claims then require separate
`validatePlatformSession` verification against the active CCA principal,
server-side session, MFA state, revocation and expiry.

**Never** pass raw request data or an ordinary CHRiS JWT into
`validatePlatformSession` as a pre-verified token.
The `signatureVerified` property must only be constructed server-side by the
trusted verifier. No CCA public HTTP route is added by this increment.

## Remaining security blockers before integration
- Independently managed signing private key, key rotation, key ID registry
  and emergency revocation (no keys committed to source).
- Independently provisioned platform principals, MFA enrollment/recovery,
  session persistence and abuse prevention/rate limits.
- Server-side role and scoped tenant-assignment queries; no JWT role trust.
- Gateway middleware consuming bearer token, verifying it, then looking up
  active principal/session and attaching the server-built CCA context.
- Review of JWT parser limits and policy (e.g., claim type checks, issuer/aud)
  and independent security assessment.
- Staging tests for support-ticket isolation, replay/revocation, CORS and
  compatibility with all CHRiS login flows.

This commit has no impact on existing tenant sessions or production services.
