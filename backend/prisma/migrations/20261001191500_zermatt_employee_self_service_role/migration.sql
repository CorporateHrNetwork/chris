DO $$
DECLARE
  v_org TEXT;
BEGIN
  SELECT id INTO v_org FROM organizations WHERE slug='zermatt-liquor-limited' LIMIT 1;
  IF v_org IS NULL THEN RETURN; END IF;

  INSERT INTO roles (id,"organizationId",name,description,"isSystemRole","createdAt","updatedAt")
  VALUES (
    gen_random_uuid()::text,
    v_org,
    'Employee Self Service',
    'Read-only employee self-service access restricted to the authenticated user''s linked employee record.',
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT ("organizationId",name) DO UPDATE
    SET description=EXCLUDED.description,
        "isSystemRole"=TRUE,
        "updatedAt"=CURRENT_TIMESTAMP;
END $$;
