-- Existing ESS authentication uses a separate password hash when configured.
-- Preserve deployed values; make fresh installs/restores match the Prisma schema.
ALTER TABLE public."users" ADD COLUMN IF NOT EXISTS "essPasswordHash" TEXT;
