# CCA directory & scoped access — isolated implementation

Added `platformDirectoryPolicy.js` to turn an independently authenticated
CCA session, an active CCA principal, and trusted server-side role/tenant
assignment records into a constrained authorization context.

- Platform grants only arise from known, active, **platform-scoped** role rows.
- A tenant action requires the permission in both the platform grants and
  the role grants for that tenant. Tenant assignments cannot add platform
  permissions or supply access for an unrelated role.
- Forged or inactive identities, unknown roles, unassigned tenant cases and
  unauthorized approval rights must be denied.
- No implicit privilege for `corporatehr-network`, superuser wildcards, or
  a CHRiS tenant session.

This file is NOT a database directory, authentication endpoint, CCA
administrator account provisioning system, or route middleware. Production
integration needs a durable independent identity/session store, MFA, audit,
tenant assignment management, scoped billing and support tests, and a reviewed
operational separation of duties. It must never trust assignment records from
HTTP inputs or user-controlled JWT claims.

Risk to address before integration: avoid automatically allowing platform
operators to see *all* tenant case information. Authorization must also
filter query results on the server, not merely hide dashboard menu links.

Do not merge or deploy this branch until staging and production isolation
checks are complete. No schema or live system modifications are included.
