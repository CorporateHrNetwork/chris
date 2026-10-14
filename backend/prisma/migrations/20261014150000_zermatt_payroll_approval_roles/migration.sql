-- CHRiS tenant role catalog for Zermatt payroll approval and finance access.
-- These are tenant-scoped roles so they appear in Settings -> Users & Roles
-- and can be assigned during CHRiS user creation.
--
-- We deliberately do not alter existing roles or user assignments.
-- ON CONFLICT is not required because we guard each role by organization/name.

INSERT INTO "roles" ("id", "organizationId", "name", "description", "isSystemRole", "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  o."id",
  r."name",
  r."description",
  false,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "organizations" o
CROSS JOIN (
  VALUES
    ('General Manager', 'Zermatt General Manager; responsible for final payroll approval before payout.'),
    ('Chief Accountant', 'Zermatt Chief Accountant; responsible for approved payroll payout export and payout lock.'),
    ('Branch Accountant', 'Zermatt Branch Accountant; branch-level finance and payroll support access.'),
    ('Head of Audit & Internal Controls', 'Zermatt Head of Audit & Internal Controls; responsible for payroll audit review and decision.')
) AS r("name", "description")
WHERE o."slug" = 'zermatt-liquor-limited'
  AND NOT EXISTS (
    SELECT 1
    FROM "roles" existing
    WHERE existing."organizationId" = o."id"
      AND UPPER(TRIM(existing."name")) = UPPER(TRIM(r."name"))
  );
