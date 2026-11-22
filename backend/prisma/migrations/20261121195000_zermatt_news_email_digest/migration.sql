-- Daily employee engagement digest: opt-in by employee and opt-in per post, no default email sends.
CREATE TABLE IF NOT EXISTS "internal_news_email_preferences" (
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "optIn" BOOLEAN NOT NULL DEFAULT FALSE,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("organizationId","employeeId"),
  CONSTRAINT "news_email_preferences_employee_fk"
    FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE,
  CONSTRAINT "news_email_preferences_org_fk"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "internal_news_email_digest_ledger" (
  "id" UUID NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "digestDate" DATE NOT NULL,
  "quotaSlot" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'PROCESSING',
  "email" TEXT NOT NULL,
  "messageCount" INTEGER NOT NULL DEFAULT 0,
  "providerMessageId" TEXT,
  "error" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "news_email_digest_unique" UNIQUE ("organizationId","employeeId","digestDate"),
  CONSTRAINT "news_email_digest_quota_unique" UNIQUE ("digestDate","quotaSlot"),
  CONSTRAINT "news_email_digest_slot_range" CHECK ("quotaSlot" BETWEEN 1 AND 90),
  CONSTRAINT "news_email_digest_status_ck" CHECK ("status" IN ('PROCESSING','SENT','PENDING_CONFIGURATION','RECONCILE_REQUIRED','FAILED')),
  CONSTRAINT "news_digest_org_fk" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "news_digest_employee_fk" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "news_digest_date_status_idx" ON "internal_news_email_digest_ledger" ("digestDate","status");

-- Employee notification preferences and delivery ledger are server-managed only.
ALTER TABLE "internal_news_email_preferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "internal_news_email_digest_ledger" ENABLE ROW LEVEL SECURITY;
