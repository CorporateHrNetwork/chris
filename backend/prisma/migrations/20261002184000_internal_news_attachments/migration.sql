ALTER TABLE "internal_news_posts"
  ADD COLUMN IF NOT EXISTS "attachmentFileName" TEXT,
  ADD COLUMN IF NOT EXISTS "attachmentMimeType" TEXT,
  ADD COLUMN IF NOT EXISTS "attachmentSize" INTEGER,
  ADD COLUMN IF NOT EXISTS "attachmentData" BYTEA;

ALTER TABLE "internal_news_posts"
  DROP CONSTRAINT IF EXISTS "internal_news_posts_attachment_type_check";

ALTER TABLE "internal_news_posts"
  ADD CONSTRAINT "internal_news_posts_attachment_type_check"
  CHECK (
    "attachmentMimeType" IS NULL OR
    "attachmentMimeType" IN ('application/pdf','image/jpeg','image/png','image/webp')
  );
