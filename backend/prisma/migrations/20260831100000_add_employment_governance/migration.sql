CREATE TABLE "employment_contract_lifecycles" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT,
  "referenceCode" TEXT NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "email" TEXT,
  "currentState" TEXT NOT NULL DEFAULT 'APPLICANT',
  "effectiveEmploymentDate" TIMESTAMP(3),
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "employment_contract_lifecycles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "employment_contract_lifecycles_organizationId_referenceCode_key" ON "employment_contract_lifecycles"("organizationId", "referenceCode");
CREATE INDEX "employment_contract_lifecycles_organizationId_currentState_idx" ON "employment_contract_lifecycles"("organizationId", "currentState");
CREATE INDEX "employment_contract_lifecycles_organizationId_employeeId_idx" ON "employment_contract_lifecycles"("organizationId", "employeeId");
CREATE INDEX "employment_contract_lifecycles_organizationId_email_idx" ON "employment_contract_lifecycles"("organizationId", "email");

CREATE TABLE "employment_contract_transitions" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "lifecycleId" TEXT NOT NULL,
  "fromState" TEXT,
  "toState" TEXT NOT NULL,
  "effectiveDate" TIMESTAMP(3) NOT NULL,
  "actorUserId" TEXT,
  "authority" TEXT NOT NULL,
  "reason" TEXT,
  "documentReference" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "employment_contract_transitions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "employment_contract_transitions_organizationId_lifecycleId_effectiveDate_idx" ON "employment_contract_transitions"("organizationId", "lifecycleId", "effectiveDate");
CREATE INDEX "employment_contract_transitions_organizationId_toState_idx" ON "employment_contract_transitions"("organizationId", "toState");
ALTER TABLE "employment_contract_transitions" ADD CONSTRAINT "employment_contract_transitions_lifecycleId_fkey" FOREIGN KEY ("lifecycleId") REFERENCES "employment_contract_lifecycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "employment_contract_documents" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "lifecycleId" TEXT NOT NULL,
  "documentType" TEXT NOT NULL,
  "documentReference" TEXT NOT NULL,
  "templateName" TEXT,
  "templateVersion" TEXT,
  "contentHash" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "employment_contract_documents_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "employment_contract_documents_organizationId_lifecycleId_idx" ON "employment_contract_documents"("organizationId", "lifecycleId");
CREATE INDEX "employment_contract_documents_organizationId_documentType_idx" ON "employment_contract_documents"("organizationId", "documentType");
ALTER TABLE "employment_contract_documents" ADD CONSTRAINT "employment_contract_documents_lifecycleId_fkey" FOREIGN KEY ("lifecycleId") REFERENCES "employment_contract_lifecycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "employment_contract_document_events" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "eventAt" TIMESTAMP(3) NOT NULL,
  "actorUserId" TEXT,
  "authority" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "employment_contract_document_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "employment_contract_document_events_organizationId_documentId_eventAt_idx" ON "employment_contract_document_events"("organizationId", "documentId", "eventAt");
CREATE INDEX "employment_contract_document_events_organizationId_eventType_idx" ON "employment_contract_document_events"("organizationId", "eventType");
ALTER TABLE "employment_contract_document_events" ADD CONSTRAINT "employment_contract_document_events_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "employment_contract_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "disciplinary_cases" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "employeeNumber" TEXT NOT NULL,
  "caseNumber" TEXT NOT NULL,
  "incidentSummary" TEXT NOT NULL,
  "allegation" TEXT NOT NULL,
  "policyReference" TEXT,
  "policyVersion" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "outcome" TEXT,
  "openedAt" TIMESTAMP(3) NOT NULL,
  "decidedAt" TIMESTAMP(3),
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "disciplinary_cases_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "disciplinary_cases_organizationId_caseNumber_key" ON "disciplinary_cases"("organizationId", "caseNumber");
CREATE INDEX "disciplinary_cases_organizationId_employeeId_idx" ON "disciplinary_cases"("organizationId", "employeeId");
CREATE INDEX "disciplinary_cases_organizationId_employeeNumber_idx" ON "disciplinary_cases"("organizationId", "employeeNumber");
CREATE INDEX "disciplinary_cases_organizationId_status_idx" ON "disciplinary_cases"("organizationId", "status");

CREATE TABLE "disciplinary_evidence_versions" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "disciplinaryCaseId" TEXT NOT NULL,
  "logicalEvidenceKey" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "content" JSONB,
  "documentReference" TEXT,
  "contentHash" TEXT NOT NULL,
  "finalizedAt" TIMESTAMP(3),
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "disciplinary_evidence_versions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "disciplinary_evidence_versions_case_logical_version_key" ON "disciplinary_evidence_versions"("disciplinaryCaseId", "logicalEvidenceKey", "versionNumber");
CREATE INDEX "disciplinary_evidence_versions_organizationId_case_idx" ON "disciplinary_evidence_versions"("organizationId", "disciplinaryCaseId");
CREATE INDEX "disciplinary_evidence_versions_organizationId_category_idx" ON "disciplinary_evidence_versions"("organizationId", "category");
ALTER TABLE "disciplinary_evidence_versions" ADD CONSTRAINT "disciplinary_evidence_versions_caseId_fkey" FOREIGN KEY ("disciplinaryCaseId") REFERENCES "disciplinary_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "disciplinary_process_events" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "disciplinaryCaseId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "participant" TEXT,
  "actorUserId" TEXT,
  "notes" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "disciplinary_process_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "disciplinary_process_events_organizationId_case_occurred_idx" ON "disciplinary_process_events"("organizationId", "disciplinaryCaseId", "occurredAt");
CREATE INDEX "disciplinary_process_events_organizationId_eventType_idx" ON "disciplinary_process_events"("organizationId", "eventType");
ALTER TABLE "disciplinary_process_events" ADD CONSTRAINT "disciplinary_process_events_caseId_fkey" FOREIGN KEY ("disciplinaryCaseId") REFERENCES "disciplinary_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "disciplinary_external_proceedings" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "disciplinaryCaseId" TEXT NOT NULL,
  "proceedingType" TEXT NOT NULL,
  "authority" TEXT NOT NULL,
  "referenceNumber" TEXT,
  "status" TEXT NOT NULL,
  "outcome" TEXT,
  "openedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "disciplinary_external_proceedings_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "disciplinary_external_proceedings_organizationId_case_idx" ON "disciplinary_external_proceedings"("organizationId", "disciplinaryCaseId");
CREATE INDEX "disciplinary_external_proceedings_organizationId_status_idx" ON "disciplinary_external_proceedings"("organizationId", "status");
ALTER TABLE "disciplinary_external_proceedings" ADD CONSTRAINT "disciplinary_external_proceedings_caseId_fkey" FOREIGN KEY ("disciplinaryCaseId") REFERENCES "disciplinary_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "external_verification_records" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT,
  "subjectReference" TEXT,
  "identifierType" TEXT NOT NULL,
  "maskedIdentifier" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "attemptedAt" TIMESTAMP(3) NOT NULL,
  "verifiedAt" TIMESTAMP(3),
  "nextRetryAt" TIMESTAMP(3),
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "responseMetadata" JSONB,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "external_verification_records_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "external_verification_records_organizationId_employeeId_idx" ON "external_verification_records"("organizationId", "employeeId");
CREATE INDEX "external_verification_records_organizationId_identifierType_idx" ON "external_verification_records"("organizationId", "identifierType");
CREATE INDEX "external_verification_records_organizationId_status_idx" ON "external_verification_records"("organizationId", "status");
CREATE INDEX "external_verification_records_organizationId_nextRetryAt_idx" ON "external_verification_records"("organizationId", "nextRetryAt");
