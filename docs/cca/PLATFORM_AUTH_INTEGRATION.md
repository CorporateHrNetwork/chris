# CCA independent authentication — implementation boundary

**This is a contract and test suite, not a working CCA login.** No runtime
routes import the CCA session policy. CHRiS `/api/auth/login`, JWT secret,
tenant roles and support URLs remain unchanged.

## Existing CHRiS boundary verified
- `backend/src/routes/authRoutes.js` signs a tenant session containing
  `userId` and `organizationId` with `JWT_SECRET`.
- `backend/src/middleware/authMiddleware.js` resolves a tenant-bound user,
  organization, location and permissions. It cannot be used directly for CCA
  privileged actions.
- The existing `corporatehr-network` slug check is a compatibility bridge,
  not suitable as a general CCA super-administrator identity.

## Requirements for a future separately reviewed integration
1. Provision a **dedicated platform-principal store** (not a tenant employee
   or a promoted tenant user) and granular role/tenant assignments.
2. Use **separate signer and verifying key material**, fixed issuer,
   fixed audience, narrow token purpose, short expiry, key rotation and
   session/JTI revocation. Enforce crypto validation before passing verified
   claims to `validatePlatformSession`. No `none` algorithm or algorithm
   confusion.
3. Use strong MFA with enrollment/recovery audit, independent active principal
   lookup, verified server-side MFA session state and a separate login endpoint.
4. Do not trust a `signatureVerified` field from an HTTP request. It is an
   **internal only** input from a reviewed verifier and must not be serialised
   or deserialised from client input.
5. Apply `canAccessPlatform` and `canAccessTenantCase` on every platform
   endpoint, with grants from the server-side platform directory only.
6. Log sensitive actions with actor, tenant scope, reason, approval reference
   and trace ID. Encrypt/minimise sensitive records and prevent support agents
   from browsing unassigned tenant information.
7. All subscription renewals, lifecycle changes and deployments must use
   separately verified authorisation plus a persisted idempotency key.
8. Integration testing must demonstrate rejected CHRiS / ESS JWTs,
   token replay and revocation handling, tenant-crossing denial, and no
   changes to existing live login behavior.

## Pure module
`backend/src/cca/platformSessionPolicy.js` tests these invariants with
fabricated trusted inputs; it is not a JWT verification implementation and it
does not accept requests, execute SQL, login users, or issue tokens.

Test with:
`node --test backend/tests/cca*.test.js`

## Release restrictions
The connected branch is draft-only. No production merge or deployment,
migration, tenant deactivation or login cutover from this change.
