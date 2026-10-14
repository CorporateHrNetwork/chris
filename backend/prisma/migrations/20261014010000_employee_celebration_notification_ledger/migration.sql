CREATE TABLE IF NOT EXISTS "employee_celebration_notification_ledger" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "celebrationType" TEXT NOT NULL,
  "celebrationDate" DATE NOT NULL,
  "channel" TEXT NOT NULL,
  "messageHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PROCESSING',
  "providerMessageId" TEXT,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  CONSTRAINT "employee_celebration_ledger_org_fk"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "employee_celebration_ledger_employee_fk"
    FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE,
  CONSTRAINT "employee_celebration_ledger_channel_check"
    CHECK ("channel" IN ('ESS','EMAIL','PHONE')),
  CONSTRAINT "employee_celebration_ledger_status_check"
    CHECK ("status" IN ('PROCESSING','SENT','FAILED','PENDING_CONFIGURATION'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "employee_celebration_ledger_idempotency_key"
  ON "employee_celebration_notification_ledger"
    ("organizationId","employeeId","celebrationType","celebrationDate","channel");

CREATE INDEX IF NOT EXISTS "employee_celebration_ledger_status_idx"
  ON "employee_celebration_notification_ledger"("organizationId","celebrationDate","status");
