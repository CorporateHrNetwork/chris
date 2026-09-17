-- CHRiS Platform Support Desk authorization
--
-- Platform Support permissions are global catalogue entries, but they are
-- deliberately attached only to roles owned by the CorporateHr Network
-- platform organization. Tenant role administration separately blocks
-- support.internal.* and support.engineering.* from client assignment.

INSERT INTO "permissions" ("id", "key", "name", "description", "createdAt", "updatedAt")
VALUES
  (md5('permission:support.internal.view'), 'support.internal.view', 'View Internal Support Desk', 'View the Corporate Resources Network cross-client CHRiS Support Desk.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (md5('permission:support.internal.manage'), 'support.internal.manage', 'Manage Internal Support Desk', 'Manage Corporate Resources Network Support Desk cases, messages and operational status.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (md5('permission:support.engineering.escalate'), 'support.engineering.escalate', 'Escalate Support Cases to Engineering', 'Escalate validated CHRiS Support Desk cases to engineering.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE
SET "name" = EXCLUDED."name",
    "description" = EXCLUDED."description",
    "updatedAt" = CURRENT_TIMESTAMP;

-- Create the dedicated platform Support role only inside CorporateHr Network.
INSERT INTO "roles" ("id", "organizationId", "name", "description", "isSystemRole", "createdAt", "updatedAt")
SELECT
  md5('role:chris-platform-support:' || o."id"),
  o."id",
  'CHRiS Platform Support',
  'Corporate Resources Network platform-only Support Desk operations across CHRiS client tenants.',
  TRUE,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "organizations" o
WHERE o."slug" = 'corporatehr-network'
ON CONFLICT ("organizationId", "name") DO UPDATE
SET "description" = EXCLUDED."description",
    "isSystemRole" = TRUE,
    "updatedAt" = CURRENT_TIMESTAMP;

-- Grant all three Support Desk permissions to the dedicated platform role.
INSERT INTO "role_permissions" ("id", "roleId", "permissionId", "createdAt")
SELECT
  md5('role-permission:' || r."id" || ':' || p."id"),
  r."id",
  p."id",
  CURRENT_TIMESTAMP
FROM "roles" r
JOIN "organizations" o ON o."id" = r."organizationId"
JOIN "permissions" p ON p."key" IN (
  'support.internal.view',
  'support.internal.manage',
  'support.engineering.escalate'
)
WHERE o."slug" = 'corporatehr-network'
  AND r."name" = 'CHRiS Platform Support'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- CorporateHr Network Administrators are platform administrators; ensure an
-- existing Administrator can immediately enter the internal Support Desk even
-- in databases where the role was configured before these permissions existed.
INSERT INTO "role_permissions" ("id", "roleId", "permissionId", "createdAt")
SELECT
  md5('role-permission:' || r."id" || ':' || p."id"),
  r."id",
  p."id",
  CURRENT_TIMESTAMP
FROM "roles" r
JOIN "organizations" o ON o."id" = r."organizationId"
JOIN "permissions" p ON p."key" IN (
  'support.internal.view',
  'support.internal.manage',
  'support.engineering.escalate'
)
WHERE o."slug" = 'corporatehr-network'
  AND r."name" = 'Administrator'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- Give current CorporateHr Network Administrators the dedicated platform role.
-- No client-tenant user is selected by this query.
INSERT INTO "user_roles" ("id", "userId", "roleId", "createdAt")
SELECT DISTINCT
  md5('user-role:' || u."id" || ':' || support_role."id"),
  u."id",
  support_role."id",
  CURRENT_TIMESTAMP
FROM "users" u
JOIN "organizations" o ON o."id" = u."organizationId"
JOIN "user_roles" existing_ur ON existing_ur."userId" = u."id"
JOIN "roles" existing_role ON existing_role."id" = existing_ur."roleId"
JOIN "roles" support_role
  ON support_role."organizationId" = o."id"
 AND support_role."name" = 'CHRiS Platform Support'
WHERE o."slug" = 'corporatehr-network'
  AND existing_role."organizationId" = o."id"
  AND existing_role."name" = 'Administrator'
ON CONFLICT ("userId", "roleId") DO NOTHING;
