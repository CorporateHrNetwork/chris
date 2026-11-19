-- Permission is opt-in; no users or roles are automatically granted access.
INSERT INTO "permissions" ("id", "key", "name", "description", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'benefits.gratuity.view', 'View Gratuity',
  'View EoSB / Gratuity accounts and exports only within assigned CHRiS location scope.',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
