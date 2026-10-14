CREATE TABLE IF NOT EXISTS "payroll_approval_workflows" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "stage" TEXT NOT NULL DEFAULT 'DRAFT',
  "version" INTEGER NOT NULL DEFAULT 1,
  "auditObservations" TEXT,
  "auditDecision" TEXT,
  "auditActorUserId" TEXT,
  "auditOpenedAt" TIMESTAMP(3),
  "auditDecidedAt" TIMESTAMP(3),
  "gmDecision" TEXT,
  "gmActorUserId" TEXT,
  "gmOpenedAt" TIMESTAMP(3),
  "gmDecidedAt" TIMESTAMP(3),
  "payoutActorUserId" TEXT,
  "payoutExportedAt" TIMESTAMP(3),
  "lockedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_approval_workflows_run_fk" FOREIGN KEY ("runId") REFERENCES "payroll_runs"("id") ON DELETE RESTRICT,
  CONSTRAINT "payroll_approval_workflows_org_fk" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS "payroll_approval_workflows_org_run_key" ON "payroll_approval_workflows"("organizationId","runId");
CREATE INDEX IF NOT EXISTS "payroll_approval_workflows_stage_idx" ON "payroll_approval_workflows"("organizationId","stage");

CREATE TABLE IF NOT EXISTS "payroll_approval_events" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "workflowId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "action" TEXT NOT NULL,
  "fromStage" TEXT,
  "toStage" TEXT NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_approval_events_workflow_fk" FOREIGN KEY ("workflowId") REFERENCES "payroll_approval_workflows"("id") ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS "payroll_approval_events_run_idx" ON "payroll_approval_events"("organizationId","runId","createdAt");
