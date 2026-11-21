-- Phase 1 of #338. Review and exercise on staging before merging to the Zermatt production branch.
-- Additive tables only: existing internal_news_posts and employee records remain unchanged.
CREATE TABLE IF NOT EXISTS "internal_news_engagement_settings" (
  "organizationId" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "recognizedEmployeeId" TEXT,
  "notifyByEmail" BOOLEAN NOT NULL DEFAULT FALSE,
  "updatedByUserId" TEXT,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "news_engagement_settings_org_fk" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "news_engagement_settings_post_fk" FOREIGN KEY ("postId") REFERENCES "internal_news_posts"("id") ON DELETE CASCADE,
  CONSTRAINT "news_engagement_settings_recipient_fk" FOREIGN KEY ("recognizedEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL,
  CONSTRAINT "internal_news_engagement_settings_pkey" PRIMARY KEY ("organizationId", "postId")
);
CREATE TABLE IF NOT EXISTS "internal_news_reactions" (
  "id" UUID NOT NULL,
  "organizationId" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "reaction" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "news_reactions_org_fk" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "news_reactions_post_fk" FOREIGN KEY ("postId") REFERENCES "internal_news_posts"("id") ON DELETE CASCADE,
  CONSTRAINT "news_reactions_employee_fk" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE,
  CONSTRAINT "internal_news_reactions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "internal_news_reactions_unique_employee" UNIQUE ("organizationId", "postId", "employeeId"),
  CONSTRAINT "internal_news_reactions_allowed" CHECK ("reaction" IN ('LIKE','CELEBRATE','SUPPORT','APPRECIATE'))
);
CREATE INDEX IF NOT EXISTS "internal_news_reactions_feed_idx" ON "internal_news_reactions" ("organizationId","postId");
CREATE TABLE IF NOT EXISTS "internal_news_comments" (
  "id" UUID NOT NULL,
  "organizationId" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "parentId" UUID,
  "body" TEXT NOT NULL,
  "isHidden" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "news_comments_org_fk" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "news_comments_post_fk" FOREIGN KEY ("postId") REFERENCES "internal_news_posts"("id") ON DELETE CASCADE,
  CONSTRAINT "news_comments_employee_fk" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE,
  CONSTRAINT "news_comment_parent_fk" FOREIGN KEY ("parentId") REFERENCES "internal_news_comments"("id") ON DELETE SET NULL,
  CONSTRAINT "internal_news_comments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "internal_news_comments_length" CHECK (char_length("body") BETWEEN 1 AND 1000)
);
CREATE INDEX IF NOT EXISTS "internal_news_comments_feed_idx" ON "internal_news_comments" ("organizationId","postId","createdAt");
-- Engagement is deliberately opt-in on a per-post basis. Do not auto-email or charge WhatsApp.
