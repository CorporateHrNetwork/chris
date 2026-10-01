CREATE TABLE IF NOT EXISTS "internal_news_posts" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "body" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "isPinned" BOOLEAN NOT NULL DEFAULT FALSE,
  "publishAt" TIMESTAMP(3),
  "expireAt" TIMESTAMP(3),
  "createdByUserId" TEXT,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "internal_news_posts_organization_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "internal_news_posts_created_by_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "internal_news_posts_updated_by_fkey"
    FOREIGN KEY ("updatedByUserId") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "internal_news_posts_status_check"
    CHECK ("status" IN ('DRAFT','PUBLISHED','ARCHIVED')),
  CONSTRAINT "internal_news_posts_category_check"
    CHECK ("category" IN ('ANNOUNCEMENT','PROMOTION','INTERNAL_CAREER','TRANSFER','RETIREMENT','TERMINATION','EVENT','POLICY_HR_UPDATE'))
);

CREATE INDEX IF NOT EXISTS "internal_news_posts_org_status_publish_idx"
  ON "internal_news_posts"("organizationId","status","publishAt" DESC);
CREATE INDEX IF NOT EXISTS "internal_news_posts_org_category_idx"
  ON "internal_news_posts"("organizationId","category");

DO $$
DECLARE
  v_org TEXT;
BEGIN
  SELECT id INTO v_org FROM organizations WHERE slug='zermatt-liquor-limited' LIMIT 1;
  IF v_org IS NULL THEN RETURN; END IF;

  INSERT INTO organization_audits (
    id,"organizationId","actorUserId","entityType","entityId",action,
    "previousValue","newValue",reason,"createdAt"
  ) VALUES (
    gen_random_uuid()::text,v_org,NULL,'InternalNewsPortal','ZLL-ESS-NEWS',
    'EMPLOYEE_NEWS_PORTAL_ENABLED',NULL,
    jsonb_build_object(
      'categories',jsonb_build_array('ANNOUNCEMENT','PROMOTION','INTERNAL_CAREER','TRANSFER','RETIREMENT','TERMINATION','EVENT','POLICY_HR_UPDATE'),
      'employeeSurface','ESS',
      'publicationStates',jsonb_build_array('DRAFT','PUBLISHED','ARCHIVED')
    ),
    'Enabled governed Zermatt internal news publishing for Employee Self Service.',
    CURRENT_TIMESTAMP
  );
END $$;
