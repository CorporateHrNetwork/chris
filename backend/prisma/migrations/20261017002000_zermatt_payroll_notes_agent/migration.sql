ALTER TABLE "chris_payroll_notes"
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "agentPlan" JSONB,
  ADD COLUMN "preview" JSONB,
  ADD COLUMN "implementation" JSONB;

CREATE TABLE "chris_payroll_note_events" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "noteId" TEXT NOT NULL REFERENCES "chris_payroll_notes"("id"),
  "actorUserId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "data" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ON "chris_payroll_note_events" ("organizationId","noteId","createdAt");

CREATE TABLE "chris_payroll_note_inbox" (
  "organizationId" TEXT NOT NULL,
  "noteId" TEXT NOT NULL REFERENCES "chris_payroll_notes"("id"),
  "recipientUserId" TEXT NOT NULL,
  "responsibility" TEXT NOT NULL,
  "unread" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("noteId","recipientUserId")
);
CREATE INDEX ON "chris_payroll_note_inbox" ("organizationId","recipientUserId","unread");

-- A reviewed salary instruction changes this month only; master salary history
-- and next month's contractual salary remain under employment change controls.
CREATE TABLE "chris_payroll_note_salary_overrides" (
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "periodId" TEXT NOT NULL,
  "noteId" TEXT NOT NULL REFERENCES "chris_payroll_notes"("id"),
  "monthlyGross" NUMERIC(18,2) NOT NULL CHECK ("monthlyGross">0),
  PRIMARY KEY ("organizationId","employeeId","periodId")
);

-- These tables are backend-only. No direct client policies or public grants.
ALTER TABLE "chris_payroll_note_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chris_payroll_note_inbox" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chris_payroll_note_salary_overrides" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "chris_payroll_note_events", "chris_payroll_note_inbox", "chris_payroll_note_salary_overrides" FROM anon, authenticated;
