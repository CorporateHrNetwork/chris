-- Keep password reset tokens scoped to the authentication portal (admin vs ESS).
ALTER TABLE public."password_reset_tokens"
  ADD COLUMN IF NOT EXISTS "portal" TEXT NOT NULL DEFAULT 'admin';
