ALTER TABLE "internal_news_posts"
  DROP CONSTRAINT IF EXISTS "internal_news_posts_category_check";

ALTER TABLE "internal_news_posts"
  ADD CONSTRAINT "internal_news_posts_category_check"
  CHECK ("category" IN ('ANNOUNCEMENT','MEMO','PROMOTION','INTERNAL_CAREER','TRANSFER','RETIREMENT','RESIGNATION','TERMINATION','EVENT','POLICY_HR_UPDATE'));
