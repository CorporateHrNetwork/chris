-- ZERMATT branch HR financial-input authority.
-- This does NOT grant payroll.manage, payroll.process, loan approval or disbursement.
-- It only enables the existing branch-scoped loan employee selector and data-entry/edit path.

WITH zermatt AS (
  SELECT "id" FROM "organizations" WHERE "slug"='zermatt-liquor-limited'
), branch_roles(role_name) AS (
  VALUES
    ('HR & Admin Officer - Branch'),
    ('Branch HR & Admin Officer'),
    ('HR & Admin Officer'),
    ('HR and Admin Officer')
)
INSERT INTO "role_permissions" ("id","roleId","permissionId","createdAt")
SELECT md5(r."id" || '|' || p."id"), r."id", p."id", CURRENT_TIMESTAMP
FROM zermatt z
JOIN "roles" r ON r."organizationId"=z."id"
JOIN branch_roles br ON LOWER(br.role_name)=LOWER(r."name")
JOIN "permissions" p ON p."key"='loans.apply'
ON CONFLICT ("roleId","permissionId") DO NOTHING;
