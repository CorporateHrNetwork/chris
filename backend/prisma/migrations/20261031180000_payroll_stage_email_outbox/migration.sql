-- Backend-only notification outbox. No payroll/employee records are modified.
CREATE TABLE "payroll_stage_email_outbox" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "runId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL REFERENCES "payroll_approval_events"("id") ON DELETE RESTRICT,
  "recipientUserId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "responsibility" TEXT NOT NULL,
  "stage" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED' CHECK ("status" IN ('QUEUED','SENT','FAILED','CANCELLED')),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "lastError" TEXT,
  "sentAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("eventId","responsibility")
);
CREATE INDEX ON "payroll_stage_email_outbox" ("status","nextAttemptAt");
ALTER TABLE "payroll_stage_email_outbox" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "payroll_stage_email_outbox" FROM PUBLIC, anon, authenticated;
