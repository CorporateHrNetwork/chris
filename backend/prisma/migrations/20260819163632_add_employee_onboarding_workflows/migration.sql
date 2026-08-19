-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'AWAITING_EMPLOYEE', 'AWAITING_HR', 'READY_FOR_ACTIVATION', 'COMPLETED', 'BLOCKED');

-- CreateTable
CREATE TABLE "onboarding_workflow_templates" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "employmentType" TEXT,
    "sections" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_workflow_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_onboardings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "status" "OnboardingStatus" NOT NULL DEFAULT 'DRAFT',
    "completionPercent" INTEGER NOT NULL DEFAULT 0,
    "currentStage" TEXT,
    "sectionProgress" JSONB NOT NULL,
    "assignedToUserId" TEXT,
    "createdByUserId" TEXT,
    "completedByUserId" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_onboardings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "onboarding_workflow_templates_organizationId_idx" ON "onboarding_workflow_templates"("organizationId");

-- CreateIndex
CREATE INDEX "onboarding_workflow_templates_employmentType_idx" ON "onboarding_workflow_templates"("employmentType");

-- CreateIndex
CREATE INDEX "onboarding_workflow_templates_isActive_idx" ON "onboarding_workflow_templates"("isActive");

-- CreateIndex
CREATE INDEX "onboarding_workflow_templates_createdByUserId_idx" ON "onboarding_workflow_templates"("createdByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_workflow_templates_organizationId_name_key" ON "onboarding_workflow_templates"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_workflow_templates_organizationId_code_key" ON "onboarding_workflow_templates"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_workflow_templates_organizationId_id_key" ON "onboarding_workflow_templates"("organizationId", "id");

-- CreateIndex
CREATE INDEX "employee_onboardings_organizationId_idx" ON "employee_onboardings"("organizationId");

-- CreateIndex
CREATE INDEX "employee_onboardings_employeeId_idx" ON "employee_onboardings"("employeeId");

-- CreateIndex
CREATE INDEX "employee_onboardings_templateId_idx" ON "employee_onboardings"("templateId");

-- CreateIndex
CREATE INDEX "employee_onboardings_status_idx" ON "employee_onboardings"("status");

-- CreateIndex
CREATE INDEX "employee_onboardings_assignedToUserId_idx" ON "employee_onboardings"("assignedToUserId");

-- CreateIndex
CREATE INDEX "employee_onboardings_createdByUserId_idx" ON "employee_onboardings"("createdByUserId");

-- CreateIndex
CREATE INDEX "employee_onboardings_completedByUserId_idx" ON "employee_onboardings"("completedByUserId");

-- AddForeignKey
ALTER TABLE "onboarding_workflow_templates" ADD CONSTRAINT "onboarding_workflow_templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_workflow_templates" ADD CONSTRAINT "onboarding_workflow_templates_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_onboardings" ADD CONSTRAINT "employee_onboardings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_onboardings" ADD CONSTRAINT "employee_onboardings_organizationId_employeeId_fkey" FOREIGN KEY ("organizationId", "employeeId") REFERENCES "employees"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_onboardings" ADD CONSTRAINT "employee_onboardings_organizationId_templateId_fkey" FOREIGN KEY ("organizationId", "templateId") REFERENCES "onboarding_workflow_templates"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_onboardings" ADD CONSTRAINT "employee_onboardings_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_onboardings" ADD CONSTRAINT "employee_onboardings_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_onboardings" ADD CONSTRAINT "employee_onboardings_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
