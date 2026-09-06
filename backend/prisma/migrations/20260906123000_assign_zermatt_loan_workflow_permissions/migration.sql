-- ZERMATT loan workflow permission grants.
-- Role names remain tenant-owned; aliases cover the approved operating titles without hard-coding users.

INSERT INTO "permissions" ("id","key","name","description","createdAt","updatedAt") VALUES
  (md5('loans.view'), 'loans.view', 'View Loans', 'View employee loan applications, registers, profiles and workflow history.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

WITH zermatt AS (
  SELECT "id" FROM "organizations" WHERE "slug"='zermatt-liquor-limited'
), grants(role_name, permission_key) AS (
  VALUES
    ('HR & Admin Officer','loans.view'),
    ('HR & Admin Officer','loans.apply'),
    ('HR and Admin Officer','loans.view'),
    ('HR and Admin Officer','loans.apply'),
    ('Head of Human Resources','loans.view'),
    ('Head of Human Resources','loans.verify'),
    ('Head of HR & Admin','loans.view'),
    ('Head of HR & Admin','loans.verify'),
    ('Head of Human Resources & Administration','loans.view'),
    ('Head of Human Resources & Administration','loans.verify'),
    ('General Manager','loans.view'),
    ('General Manager','loans.approve'),
    ('GM','loans.view'),
    ('GM','loans.approve'),
    ('Chief Accountant','loans.view'),
    ('Chief Accountant','loans.disburse'),
    ('Internal Auditor','loans.view'),
    ('Beer Barn Branch Operations Manager','loans.view'),
    ('Branch Operations Manager','loans.view'),
    ('Operations Manager','loans.view'),
    ('Branch Accountant','loans.view'),
    ('Accounts Officer','loans.view'),
    ('Account Officer','loans.view')
)
INSERT INTO "role_permissions" ("id","roleId","permissionId","createdAt")
SELECT md5(r."id" || '|' || p."id"), r."id", p."id", CURRENT_TIMESTAMP
FROM zermatt z
JOIN "roles" r ON r."organizationId"=z."id"
JOIN grants g ON LOWER(g.role_name)=LOWER(r."name")
JOIN "permissions" p ON p."key"=g.permission_key
ON CONFLICT ("roleId","permissionId") DO NOTHING;
