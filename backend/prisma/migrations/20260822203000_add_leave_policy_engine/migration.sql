-- CreateEnum
CREATE TYPE "LeavePolicyStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED', 'RETIRED');

-- CreateEnum
CREATE TYPE "LeavePolicyOrigin" AS ENUM ('ORGANIZATION', 'CHRIS_TEMPLATE', 'CLONED_TEMPLATE');

-- CreateEnum
CREATE TYPE "LeaveComplianceStatus" AS ENUM ('COMPLIANT', 'REVIEW_REQUIRED', 'BELOW_STATUTORY_FLOOR', 'CUSTOM_NOT_ASSESSED');

-- CreateEnum
CREATE TYPE "LeavePolicyAuditAction" AS ENUM ('CREATED', 'CLONED', 'CHANGED', 'ACTIVATED', 'SUSPENDED', 'RETIRED', 'ENTITLEMENT_CHANGED', 'ELIGIBILITY_CHANGED', 'APPROVAL_WORKFLOW_CHANGED', 'COMPLIANCE_OVERRIDE');

-- AlterTable
ALTER TABLE "leave_policies" ADD COLUMN     "approvalWorkflow" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedByUserId" TEXT,
ADD COLUMN     "attendanceRules" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "balanceRules" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "calendarRules" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "category" TEXT,
ADD COLUMN     "changeReason" TEXT,
ADD COLUMN     "code" TEXT,
ADD COLUMN     "complianceNotes" TEXT,
ADD COLUMN     "complianceStatus" "LeaveComplianceStatus" NOT NULL DEFAULT 'CUSTOM_NOT_ASSESSED',
ADD COLUMN     "coverageRules" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "createdByUserId" TEXT,
ADD COLUMN     "documentationRules" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "eligibilityRules" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "entitlementRules" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "jurisdiction" TEXT,
ADD COLUMN     "lifecycleRules" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "origin" "LeavePolicyOrigin" NOT NULL DEFAULT 'ORGANIZATION',
ADD COLUMN     "overlapRules" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "payrollRules" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "previewText" TEXT,
ADD COLUMN     "requestRules" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "serviceBands" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "sourceTemplateCode" TEXT,
ADD COLUMN     "status" "LeavePolicyStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "versionGroupId" TEXT,
ADD COLUMN     "versionNumber" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "leave_requests" ADD COLUMN     "leavePolicyId" TEXT,
ADD COLUMN     "returnDocumentationUrl" TEXT,
ADD COLUMN     "fitnessCertificateUrl" TEXT;

-- CreateTable
CREATE TABLE "leave_policy_templates" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "jurisdiction" TEXT,
    "configuration" JSONB NOT NULL,
    "previewText" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_policy_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_policy_audits" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leavePolicyId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" "LeavePolicyAuditAction" NOT NULL,
    "previousValue" JSONB,
    "newValue" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_policy_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_compliance_floors" (
    "id" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "ruleCategory" TEXT NOT NULL,
    "applicableEmployeeCategory" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "minimumEntitlement" DECIMAL(8,2),
    "entitlementUnit" TEXT,
    "payRequirement" TEXT,
    "documentationRule" TEXT,
    "legalSource" TEXT NOT NULL,
    "complianceNotes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_compliance_floors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "leave_policy_templates_code_key" ON "leave_policy_templates"("code");

-- CreateIndex
CREATE INDEX "leave_policy_templates_isActive_idx" ON "leave_policy_templates"("isActive");

-- CreateIndex
CREATE INDEX "leave_policy_audits_organizationId_idx" ON "leave_policy_audits"("organizationId");

-- CreateIndex
CREATE INDEX "leave_policy_audits_leavePolicyId_idx" ON "leave_policy_audits"("leavePolicyId");

-- CreateIndex
CREATE INDEX "leave_policy_audits_actorUserId_idx" ON "leave_policy_audits"("actorUserId");

-- CreateIndex
CREATE INDEX "leave_policy_audits_action_idx" ON "leave_policy_audits"("action");

-- CreateIndex
CREATE INDEX "leave_compliance_floors_jurisdiction_ruleCategory_effective_idx" ON "leave_compliance_floors"("jurisdiction", "ruleCategory", "effectiveFrom");

-- CreateIndex
CREATE INDEX "leave_compliance_floors_isActive_idx" ON "leave_compliance_floors"("isActive");

-- CreateIndex
CREATE INDEX "leave_policies_status_idx" ON "leave_policies"("status");

-- CreateIndex
CREATE INDEX "leave_policies_versionGroupId_idx" ON "leave_policies"("versionGroupId");

-- CreateIndex
CREATE INDEX "leave_policies_createdByUserId_idx" ON "leave_policies"("createdByUserId");

-- CreateIndex
CREATE INDEX "leave_policies_approvedByUserId_idx" ON "leave_policies"("approvedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "leave_policies_organizationId_code_versionNumber_key" ON "leave_policies"("organizationId", "code", "versionNumber");

-- CreateIndex
CREATE INDEX "leave_requests_leavePolicyId_idx" ON "leave_requests"("leavePolicyId");

-- RenameForeignKey

-- RenameForeignKey

-- AddForeignKey
ALTER TABLE "leave_policies" ADD CONSTRAINT "leave_policies_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_policies" ADD CONSTRAINT "leave_policies_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_policy_audits" ADD CONSTRAINT "leave_policy_audits_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_policy_audits" ADD CONSTRAINT "leave_policy_audits_leavePolicyId_fkey" FOREIGN KEY ("leavePolicyId") REFERENCES "leave_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_policy_audits" ADD CONSTRAINT "leave_policy_audits_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_leavePolicyId_fkey" FOREIGN KEY ("leavePolicyId") REFERENCES "leave_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex

-- RenameIndex


-- Seed immutable CHRIS recommended policy templates.
INSERT INTO "leave_policy_templates" ("id","code","name","description","category","jurisdiction","configuration","previewText","isActive","createdAt","updatedAt") VALUES ('00000000-0000-4000-8000-000000000001','ANNUAL','Annual Leave','CHRIS recommended starting policy. Clone or activate for tenant use; not legal advice.','RECOMMENDED_BENEFIT','NG','{"eligibilityRules":{"scope":"ALL_EMPLOYEES"},"entitlementRules":{"value":20,"unit":"WORKING_DAYS","frequency":"ANNUAL","accrual":"MONTHLY","proration":"BOTH"},"serviceBands":[],"balanceRules":{"carryoverAllowed":true,"negativeBalanceAllowed":false,"cashOutAllowed":false,"maximumCarryover":5,"carryoverExpiry":"03-31","automaticForfeiture":true},"requestRules":{"minimumDuration":0.5,"halfDayAllowed":true,"backdatedRequestsAllowed":false,"emergencyRequestsAllowed":false,"attachmentRequired":false,"reasonRequired":true,"minimumNotice":5},"approvalWorkflow":{"type":"MANAGER_HR","steps":["LINE_MANAGER","HR"]},"lifecycleRules":{"explicitCommencementRequired":true,"commencementActor":"HR","allowEarlyCommencement":false,"hrOverrideAllowed":false,"returnToWorkRequired":true,"returnConfirmedBy":"HR","allowEarlyReturn":true,"fitnessCertificateRequired":false,"returnDocumentationRequired":false},"payrollRules":{"treatment":"FULLY_PAID"},"attendanceRules":{"excusedAbsence":true,"suppressExpectedAttendance":true,"clockInRequired":false,"attendanceExceptionGenerated":false},"calendarRules":{"countWeekends":false,"countPublicHolidays":false,"useEmployeeWorkSchedule":true},"documentationRules":{},"overlapRules":{"action":"BLOCK"},"coverageRules":{}}'::jsonb,'Eligible employees receive 20 working days of fully paid annual leave per leave year. Entitlement accrues monthly. Up to 5 unused working days may carry over and expire on 31 March.',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
INSERT INTO "leave_policy_templates" ("id","code","name","description","category","jurisdiction","configuration","previewText","isActive","createdAt","updatedAt") VALUES ('00000000-0000-4000-8000-000000000002','SICK','Sick Leave','CHRIS recommended starting policy. Clone or activate for tenant use; not legal advice.','STATUTORY_AND_BENEFIT','NG','{"eligibilityRules":{"scope":"ALL_EMPLOYEES"},"entitlementRules":{"value":12,"unit":"WORKING_DAYS","frequency":"ANNUAL","accrual":"NONE","proration":"NONE"},"serviceBands":[],"balanceRules":{"carryoverAllowed":false,"negativeBalanceAllowed":false,"cashOutAllowed":false},"requestRules":{"minimumDuration":0.5,"halfDayAllowed":true,"backdatedRequestsAllowed":true,"emergencyRequestsAllowed":true,"attachmentRequired":false,"reasonRequired":true},"approvalWorkflow":{"type":"MANAGER_HR","steps":["LINE_MANAGER","HR"]},"lifecycleRules":{"explicitCommencementRequired":true,"commencementActor":"HR","allowEarlyCommencement":false,"hrOverrideAllowed":false,"returnToWorkRequired":true,"returnConfirmedBy":"HR","allowEarlyReturn":true,"fitnessCertificateRequired":false,"returnDocumentationRequired":false},"payrollRules":{"treatment":"FULLY_PAID"},"attendanceRules":{"excusedAbsence":true,"suppressExpectedAttendance":true,"clockInRequired":false,"attendanceExceptionGenerated":false},"calendarRules":{"countWeekends":false,"countPublicHolidays":false,"useEmployeeWorkSchedule":true},"documentationRules":{"medicalCertificate":{"requiredAfterConsecutiveWorkingDays":2}},"overlapRules":{"action":"BLOCK"},"coverageRules":{}}'::jsonb,'Eligible employees receive 12 working days of fully paid sick leave per calendar year. A medical certificate is required after 2 consecutive working days.',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
INSERT INTO "leave_policy_templates" ("id","code","name","description","category","jurisdiction","configuration","previewText","isActive","createdAt","updatedAt") VALUES ('00000000-0000-4000-8000-000000000003','MATERNITY','Maternity Leave','CHRIS recommended starting policy. Clone or activate for tenant use; not legal advice.','STATUTORY_AND_BENEFIT','NG','{"eligibilityRules":{"scope":"ALL_EMPLOYEES"},"entitlementRules":{"value":16,"unit":"WEEKS","frequency":"PER_EVENT","accrual":"NONE","proration":"NONE"},"serviceBands":[],"balanceRules":{"carryoverAllowed":false,"negativeBalanceAllowed":false,"cashOutAllowed":false},"requestRules":{"minimumDuration":0.5,"halfDayAllowed":true,"backdatedRequestsAllowed":false,"emergencyRequestsAllowed":false,"attachmentRequired":true,"reasonRequired":true},"approvalWorkflow":{"type":"MANAGER_HR","steps":["LINE_MANAGER","HR"]},"lifecycleRules":{"explicitCommencementRequired":true,"commencementActor":"HR","allowEarlyCommencement":false,"hrOverrideAllowed":false,"returnToWorkRequired":true,"returnConfirmedBy":"HR","allowEarlyReturn":true,"fitnessCertificateRequired":false,"returnDocumentationRequired":true},"payrollRules":{"treatment":"FULLY_PAID"},"attendanceRules":{"excusedAbsence":true,"suppressExpectedAttendance":true,"clockInRequired":false,"attendanceExceptionGenerated":false},"calendarRules":{"countWeekends":false,"countPublicHolidays":false,"useEmployeeWorkSchedule":true},"documentationRules":{"medicalCertification":{"required":true}},"overlapRules":{"action":"BLOCK"},"coverageRules":{}}'::jsonb,'Eligible employees receive 16 weeks of fully paid maternity leave with date-controlled commencement and confirmed return to work.',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
INSERT INTO "leave_policy_templates" ("id","code","name","description","category","jurisdiction","configuration","previewText","isActive","createdAt","updatedAt") VALUES ('00000000-0000-4000-8000-000000000004','PATERNITY','Paternity / Partner Leave','CHRIS recommended starting policy. Clone or activate for tenant use; not legal advice.','ORGANIZATION_BENEFIT',NULL,'{"eligibilityRules":{"scope":"ALL_EMPLOYEES"},"entitlementRules":{"value":5,"unit":"WORKING_DAYS","frequency":"PER_EVENT","accrual":"NONE","proration":"NONE"},"serviceBands":[],"balanceRules":{"carryoverAllowed":false,"negativeBalanceAllowed":false,"cashOutAllowed":false},"requestRules":{"minimumDuration":0.5,"halfDayAllowed":true,"backdatedRequestsAllowed":false,"emergencyRequestsAllowed":false,"attachmentRequired":false,"reasonRequired":true},"approvalWorkflow":{"type":"MANAGER_HR","steps":["LINE_MANAGER","HR"]},"lifecycleRules":{"explicitCommencementRequired":true,"commencementActor":"HR","allowEarlyCommencement":false,"hrOverrideAllowed":false,"returnToWorkRequired":true,"returnConfirmedBy":"HR","allowEarlyReturn":true,"fitnessCertificateRequired":false,"returnDocumentationRequired":false},"payrollRules":{"treatment":"FULLY_PAID"},"attendanceRules":{"excusedAbsence":true,"suppressExpectedAttendance":true,"clockInRequired":false,"attendanceExceptionGenerated":false},"calendarRules":{"countWeekends":false,"countPublicHolidays":false,"useEmployeeWorkSchedule":true},"documentationRules":{},"overlapRules":{"action":"BLOCK"},"coverageRules":{}}'::jsonb,'Eligible employees receive 5 working days of fully paid partner leave per qualifying event.',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
INSERT INTO "leave_policy_templates" ("id","code","name","description","category","jurisdiction","configuration","previewText","isActive","createdAt","updatedAt") VALUES ('00000000-0000-4000-8000-000000000005','COMPASSIONATE','Compassionate / Bereavement Leave','CHRIS recommended starting policy. Clone or activate for tenant use; not legal advice.','ORGANIZATION_BENEFIT',NULL,'{"eligibilityRules":{"scope":"ALL_EMPLOYEES","qualifyingRelationships":["SPOUSE","CHILD","PARENT","SIBLING","GUARDIAN","PARENT_IN_LAW","GRANDPARENT","OTHER_APPROVED"]},"entitlementRules":{"value":5,"unit":"WORKING_DAYS","frequency":"PER_EVENT","accrual":"NONE","proration":"NONE","relationshipEntitlements":{"immediateFamily":5,"extendedFamily":3}},"serviceBands":[],"balanceRules":{"carryoverAllowed":false,"negativeBalanceAllowed":false,"cashOutAllowed":false},"requestRules":{"minimumDuration":0.5,"halfDayAllowed":true,"backdatedRequestsAllowed":false,"emergencyRequestsAllowed":false,"attachmentRequired":false,"reasonRequired":true},"approvalWorkflow":{"type":"MANAGER_HR","steps":["LINE_MANAGER","HR"]},"lifecycleRules":{"explicitCommencementRequired":true,"commencementActor":"HR","allowEarlyCommencement":false,"hrOverrideAllowed":false,"returnToWorkRequired":true,"returnConfirmedBy":"HR","allowEarlyReturn":true,"fitnessCertificateRequired":false,"returnDocumentationRequired":false},"payrollRules":{"treatment":"FULLY_PAID"},"attendanceRules":{"excusedAbsence":true,"suppressExpectedAttendance":true,"clockInRequired":false,"attendanceExceptionGenerated":false},"calendarRules":{"countWeekends":false,"countPublicHolidays":false,"useEmployeeWorkSchedule":true},"documentationRules":{},"overlapRules":{"action":"BLOCK"},"coverageRules":{}}'::jsonb,'Eligible employees receive compassionate leave according to the configured qualifying relationship.',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
INSERT INTO "leave_policy_templates" ("id","code","name","description","category","jurisdiction","configuration","previewText","isActive","createdAt","updatedAt") VALUES ('00000000-0000-4000-8000-000000000006','MARRIAGE','Marriage Leave','CHRIS recommended starting policy. Clone or activate for tenant use; not legal advice.','ORGANIZATION_BENEFIT',NULL,'{"eligibilityRules":{"scope":"ALL_EMPLOYEES"},"entitlementRules":{"value":3,"unit":"WORKING_DAYS","frequency":"PER_EVENT","accrual":"NONE","proration":"NONE"},"serviceBands":[],"balanceRules":{"carryoverAllowed":false,"negativeBalanceAllowed":false,"cashOutAllowed":false},"requestRules":{"minimumDuration":0.5,"halfDayAllowed":true,"backdatedRequestsAllowed":false,"emergencyRequestsAllowed":false,"attachmentRequired":false,"reasonRequired":true},"approvalWorkflow":{"type":"MANAGER_HR","steps":["LINE_MANAGER","HR"]},"lifecycleRules":{"explicitCommencementRequired":true,"commencementActor":"HR","allowEarlyCommencement":false,"hrOverrideAllowed":false,"returnToWorkRequired":true,"returnConfirmedBy":"HR","allowEarlyReturn":true,"fitnessCertificateRequired":false,"returnDocumentationRequired":false},"payrollRules":{"treatment":"FULLY_PAID"},"attendanceRules":{"excusedAbsence":true,"suppressExpectedAttendance":true,"clockInRequired":false,"attendanceExceptionGenerated":false},"calendarRules":{"countWeekends":false,"countPublicHolidays":false,"useEmployeeWorkSchedule":true},"documentationRules":{},"overlapRules":{"action":"BLOCK"},"coverageRules":{}}'::jsonb,'Eligible employees receive 3 working days of fully paid marriage leave per qualifying event.',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
INSERT INTO "leave_policy_templates" ("id","code","name","description","category","jurisdiction","configuration","previewText","isActive","createdAt","updatedAt") VALUES ('00000000-0000-4000-8000-000000000007','STUDY','Study / Examination Leave','CHRIS recommended starting policy. Clone or activate for tenant use; not legal advice.','ORGANIZATION_BENEFIT',NULL,'{"eligibilityRules":{"education":"APPROVED_JOB_RELATED"},"entitlementRules":{"value":5,"unit":"WORKING_DAYS","frequency":"ANNUAL","accrual":"NONE","proration":"NONE"},"serviceBands":[],"balanceRules":{"carryoverAllowed":false,"negativeBalanceAllowed":false,"cashOutAllowed":false},"requestRules":{"minimumDuration":0.5,"halfDayAllowed":true,"backdatedRequestsAllowed":false,"emergencyRequestsAllowed":false,"attachmentRequired":false,"reasonRequired":true},"approvalWorkflow":{"type":"MANAGER_HR","steps":["LINE_MANAGER","HR"]},"lifecycleRules":{"explicitCommencementRequired":true,"commencementActor":"HR","allowEarlyCommencement":false,"hrOverrideAllowed":false,"returnToWorkRequired":true,"returnConfirmedBy":"HR","allowEarlyReturn":true,"fitnessCertificateRequired":false,"returnDocumentationRequired":false},"payrollRules":{"treatment":"FULLY_PAID"},"attendanceRules":{"excusedAbsence":true,"suppressExpectedAttendance":true,"clockInRequired":false,"attendanceExceptionGenerated":false},"calendarRules":{"countWeekends":false,"countPublicHolidays":false,"useEmployeeWorkSchedule":true},"documentationRules":{"examinationEvidence":{"required":true}},"overlapRules":{"action":"BLOCK"},"coverageRules":{}}'::jsonb,'Eligible employees in approved job-related education receive 5 working days of study leave annually.',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
INSERT INTO "leave_policy_templates" ("id","code","name","description","category","jurisdiction","configuration","previewText","isActive","createdAt","updatedAt") VALUES ('00000000-0000-4000-8000-000000000008','EMERGENCY','Emergency Leave','CHRIS recommended starting policy. Clone or activate for tenant use; not legal advice.','ORGANIZATION_BENEFIT',NULL,'{"eligibilityRules":{"scope":"ALL_EMPLOYEES"},"entitlementRules":{"value":3,"unit":"WORKING_DAYS","frequency":"ANNUAL","accrual":"NONE","proration":"NONE"},"serviceBands":[],"balanceRules":{"carryoverAllowed":false,"negativeBalanceAllowed":false,"cashOutAllowed":false},"requestRules":{"minimumDuration":0.5,"halfDayAllowed":true,"backdatedRequestsAllowed":true,"emergencyRequestsAllowed":true,"attachmentRequired":false,"reasonRequired":true,"minimumNotice":0},"approvalWorkflow":{"type":"MANAGER_HR","steps":["LINE_MANAGER","HR"]},"lifecycleRules":{"explicitCommencementRequired":true,"commencementActor":"HR","allowEarlyCommencement":false,"hrOverrideAllowed":false,"returnToWorkRequired":true,"returnConfirmedBy":"HR","allowEarlyReturn":true,"fitnessCertificateRequired":false,"returnDocumentationRequired":false},"payrollRules":{"treatment":"FULLY_PAID"},"attendanceRules":{"excusedAbsence":true,"suppressExpectedAttendance":true,"clockInRequired":false,"attendanceExceptionGenerated":false},"calendarRules":{"countWeekends":false,"countPublicHolidays":false,"useEmployeeWorkSchedule":true},"documentationRules":{},"overlapRules":{"action":"BLOCK"},"coverageRules":{}}'::jsonb,'Eligible employees receive up to 3 working days annually for genuine unforeseen personal emergencies.',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
INSERT INTO "leave_policy_templates" ("id","code","name","description","category","jurisdiction","configuration","previewText","isActive","createdAt","updatedAt") VALUES ('00000000-0000-4000-8000-000000000009','UNPAID','Unpaid Leave','CHRIS recommended starting policy. Clone or activate for tenant use; not legal advice.','DISCRETIONARY',NULL,'{"eligibilityRules":{"scope":"ALL_EMPLOYEES"},"entitlementRules":{"value":0,"unit":"WORKING_DAYS","frequency":"DISCRETIONARY","accrual":"NONE","proration":"NONE"},"serviceBands":[],"balanceRules":{"carryoverAllowed":false,"negativeBalanceAllowed":false,"cashOutAllowed":false},"requestRules":{"minimumDuration":0.5,"halfDayAllowed":true,"backdatedRequestsAllowed":false,"emergencyRequestsAllowed":false,"attachmentRequired":false,"reasonRequired":true},"approvalWorkflow":{"type":"HR_MANAGEMENT","steps":["HR","AUTHORIZED_MANAGEMENT"]},"lifecycleRules":{"explicitCommencementRequired":true,"commencementActor":"HR","allowEarlyCommencement":false,"hrOverrideAllowed":false,"returnToWorkRequired":true,"returnConfirmedBy":"HR","allowEarlyReturn":true,"fitnessCertificateRequired":false,"returnDocumentationRequired":false},"payrollRules":{"treatment":"UNPAID","showConsequenceBeforeApproval":true},"attendanceRules":{"excusedAbsence":true,"suppressExpectedAttendance":true,"clockInRequired":false,"attendanceExceptionGenerated":false},"calendarRules":{"countWeekends":false,"countPublicHolidays":false,"useEmployeeWorkSchedule":true},"documentationRules":{},"overlapRules":{"action":"BLOCK"},"coverageRules":{}}'::jsonb,'Unpaid leave has no automatic entitlement and requires HR and authorized management approval.',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
INSERT INTO "leave_policy_templates" ("id","code","name","description","category","jurisdiction","configuration","previewText","isActive","createdAt","updatedAt") VALUES ('00000000-0000-4000-8000-000000000010','ADOPTION_PARENTAL','Adoption / Parental Leave','CHRIS recommended starting policy. Clone or activate for tenant use; not legal advice.','CONFIGURABLE_BENEFIT',NULL,'{"eligibilityRules":{"scope":"ALL_EMPLOYEES"},"entitlementRules":{"value":0,"unit":"WORKING_DAYS","frequency":"PER_EVENT","accrual":"NONE","proration":"NONE"},"serviceBands":[],"balanceRules":{"carryoverAllowed":false,"negativeBalanceAllowed":false,"cashOutAllowed":false},"requestRules":{"minimumDuration":0.5,"halfDayAllowed":true,"backdatedRequestsAllowed":false,"emergencyRequestsAllowed":false,"attachmentRequired":true,"reasonRequired":true},"approvalWorkflow":{"type":"MANAGER_HR","steps":["LINE_MANAGER","HR"]},"lifecycleRules":{"explicitCommencementRequired":true,"commencementActor":"HR","allowEarlyCommencement":false,"hrOverrideAllowed":false,"returnToWorkRequired":true,"returnConfirmedBy":"HR","allowEarlyReturn":true,"fitnessCertificateRequired":false,"returnDocumentationRequired":false},"payrollRules":{"treatment":"CONFIGURABLE"},"attendanceRules":{"excusedAbsence":true,"suppressExpectedAttendance":true,"clockInRequired":false,"attendanceExceptionGenerated":false},"calendarRules":{"countWeekends":false,"countPublicHolidays":false,"useEmployeeWorkSchedule":true},"documentationRules":{},"overlapRules":{"action":"BLOCK"},"coverageRules":{}}'::jsonb,'A configurable adoption and parental leave template with documentation, commencement, and return-to-work support.',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

INSERT INTO "leave_compliance_floors" ("id","jurisdiction","ruleCategory","applicableEmployeeCategory","effectiveFrom","minimumEntitlement","entitlementUnit","payRequirement","documentationRule","legalSource","complianceNotes","isActive","createdAt","updatedAt") VALUES ('00000000-0000-4000-8000-100000000001','NG','SICK_LEAVE','WORKERS_WITHIN_LABOUR_ACT_SCOPE','1971-08-01',12,'WORKING_DAYS','PAID','Certification by a registered medical practitioner','Nigerian Labour Act, section 16','Compliance control only; applicability requires HR/legal review and is not legal advice.',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
