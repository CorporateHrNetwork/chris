-- Isolated Zermatt ESS approval ledger; no existing payroll or leave records modified.
CREATE TABLE IF NOT EXISTS "ess_approval_workflows" (
"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
"organizationId" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
"requestType" text NOT NULL CHECK ("requestType" IN ('LEAVE','LOAN')),
"requestId" text NOT NULL,
"employeeId" text NOT NULL,
"requesterUserId" text NOT NULL,
"status" text NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING','COMPLETED','REJECTED','RETURNED','CANCELLED')),
"version" integer NOT NULL DEFAULT 1 CHECK ("version">0),
"currentIndex" integer,
"stages" jsonb NOT NULL CHECK (jsonb_typeof("stages")='array'),
"observers" jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof("observers")='array'),
"history" jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof("history")='array'),
"createdAt" timestamptz NOT NULL DEFAULT now(),
"updatedAt" timestamptz NOT NULL DEFAULT now(),
UNIQUE ("organizationId","requestType","requestId")
);
CREATE INDEX IF NOT EXISTS "ess_approval_workflows_employee_lookup" ON "ess_approval_workflows" ("organizationId","employeeId","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "ess_approval_workflows_status_lookup" ON "ess_approval_workflows" ("organizationId","status","updatedAt" DESC);

-- This table is internal to CHRiS. No anonymous/authenticated PostgREST access.
ALTER TABLE "ess_approval_workflows" ENABLE ROW LEVEL SECURITY;
