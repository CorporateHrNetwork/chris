CREATE TYPE "EmployeeOnboardingTaskStatus" AS ENUM (
  'NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'NOT_APPLICABLE'
);

CREATE TABLE "employee_onboarding_tasks" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "onboardingId" TEXT NOT NULL,
  "itemKey" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "isRequired" BOOLEAN NOT NULL DEFAULT true,
  "status" "EmployeeOnboardingTaskStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "ownerUserId" TEXT,
  "dueDate" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "completedByUserId" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "employee_onboarding_tasks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "employee_onboarding_tasks_onboardingId_itemKey_key" ON "employee_onboarding_tasks"("onboardingId", "itemKey");
CREATE INDEX "employee_onboarding_tasks_organizationId_onboardingId_idx" ON "employee_onboarding_tasks"("organizationId", "onboardingId");
CREATE INDEX "employee_onboarding_tasks_organizationId_ownerUserId_idx" ON "employee_onboarding_tasks"("organizationId", "ownerUserId");
CREATE INDEX "employee_onboarding_tasks_organizationId_status_idx" ON "employee_onboarding_tasks"("organizationId", "status");
CREATE INDEX "employee_onboarding_tasks_dueDate_idx" ON "employee_onboarding_tasks"("dueDate");
CREATE UNIQUE INDEX "employee_onboardings_organizationId_id_key" ON "employee_onboardings"("organizationId", "id");

ALTER TABLE "employee_onboarding_tasks" ADD CONSTRAINT "employee_onboarding_tasks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employee_onboarding_tasks" ADD CONSTRAINT "employee_onboarding_tasks_organizationId_onboardingId_fkey" FOREIGN KEY ("organizationId", "onboardingId") REFERENCES "employee_onboardings"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employee_onboarding_tasks" ADD CONSTRAINT "employee_onboarding_tasks_organizationId_ownerUserId_fkey" FOREIGN KEY ("organizationId", "ownerUserId") REFERENCES "users"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employee_onboarding_tasks" ADD CONSTRAINT "employee_onboarding_tasks_organizationId_completedByUserId_fkey" FOREIGN KEY ("organizationId", "completedByUserId") REFERENCES "users"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Deterministic template evidence creates NOT_STARTED tasks only. It never
-- fabricates completion for existing active onboarding records.
INSERT INTO "employee_onboarding_tasks" (
  "id", "organizationId", "onboardingId", "itemKey", "title", "category",
  "isRequired", "status", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  onboarding."organizationId",
  onboarding."id",
  COALESCE(section.value->>'key', 'section-' || section.ordinality::text) || ':' || item.ordinality::text,
  item.value,
  COALESCE(section.value->>'label', section.value->>'key', 'Onboarding'),
  COALESCE((section.value->>'required')::boolean, true),
  'NOT_STARTED'::"EmployeeOnboardingTaskStatus",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "employee_onboardings" onboarding
JOIN "onboarding_workflow_templates" template ON template."id" = onboarding."templateId" AND template."organizationId" = onboarding."organizationId"
CROSS JOIN LATERAL jsonb_array_elements(template."sections"::jsonb) WITH ORDINALITY AS section(value, ordinality)
CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(section.value->'items', '[]'::jsonb)) WITH ORDINALITY AS item(value, ordinality)
WHERE onboarding."status" <> 'COMPLETED'
ON CONFLICT ("onboardingId", "itemKey") DO NOTHING;
