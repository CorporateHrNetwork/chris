# Independent CCA cryptographic boundary (isolated prototype)

`backend/src/cca/platformTokenVerifier.js` provides pure RS256 JWT verification
and an injectable, independent CCA principal/session lookup contract.

- It uses a caller-supplied **pinned platform public key** and rejects any JWT
  with incorrect CCA issuer, audience, purpose, scope, expiry, or signing key.
- It permits only RS256 and the `CCA+JWT` protected header; embedded `jku`,
  `jwk`, `kid` and algorithm selectors are ignored/rejected, not fetched.
- It limits CCA token lifetime to 15 minutes.
- It never reads the CHRiS `JWT_SECRET`, `organizationId`, employee records,
  tenant permissions, or any HTTP request.
- A valid signature is insufficient: active platform principal, MFA session,
  revocation state and session-version checks are required.
- Public-key rotation, key provisioning, session storage, credential enrollment,
  MFA challenges, login endpoints, monitoring and rate limiting remain **not
  implemented**. Do not expose this module as a CCA login endpoint.
- `loadPrincipal` is a **trusted backend function**, never user-supplied code
  or JSON. Trusted platform grants must later be separately retrieved and
  scoped using `controlPlanePolicy.js`.

Run standalone tests with Node.js:
`node --test backend/tests/cca*.test.js`

**No existing CHRiS tenant route, deployment, login or subscription code is
modified by these files.**
