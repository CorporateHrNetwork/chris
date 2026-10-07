-- CHRiS Zermatt payroll/performance automation foundation
CREATE TABLE IF NOT EXISTS "chris_payroll_notes" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT,
  "branchId" TEXT,
  "payrollPeriodId" TEXT,
  "category" TEXT NOT NULL DEFAULT 'OTHER',
  "originalNote" TEXT NOT NULL,
  "reviewedNote" TEXT,
  "attachmentUrl" TEXT,
  "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
  "headHrUserId" TEXT,
  "auditUserId" TEXT,
  "aiAction" JSONB,
  "submittedByUserId" TEXT,
  "submittedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMPTZ,
  "implementedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "chris_payroll_notes_org_status_idx" ON "chris_payroll_notes" ("organizationId","status");
CREATE INDEX IF NOT EXISTS "chris_payroll_notes_org_period_idx" ON "chris_payroll_notes" ("organizationId","payrollPeriodId");

CREATE TABLE IF NOT EXISTS "chris_performance_cycles" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "year" INT NOT NULL,
  "quarter" INT NOT NULL,
  "startDate" DATE NOT NULL,
  "endDate" DATE NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("organizationId","year","quarter")
);

CREATE TABLE IF NOT EXISTS "chris_performance_kpis" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "objective" TEXT NOT NULL,
  "measurement" TEXT NOT NULL,
  "target" TEXT NOT NULL,
  "weight" NUMERIC(7,2) NOT NULL DEFAULT 0,
  "source" TEXT NOT NULL DEFAULT 'AI_AGENT',
  "version" INT NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "approvedByUserId" TEXT,
  "approvedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "chris_performance_kpis_org_employee_idx" ON "chris_performance_kpis" ("organizationId","employeeId");
CREATE INDEX IF NOT EXISTS "chris_performance_kpis_org_cycle_idx" ON "chris_performance_kpis" ("organizationId","cycleId");

CREATE TABLE IF NOT EXISTS "chris_performance_assessments" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL,
  "selfAssessment" JSONB,
  "managerAssessment" JSONB,
  "finalRating" TEXT,
  "improvementNotes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'SELF_ASSESSMENT_PENDING',
  "submittedAt" TIMESTAMPTZ,
  "managerReviewedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("organizationId","employeeId","cycleId")
);

CREATE TABLE IF NOT EXISTS "chris_pips" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "assessmentId" TEXT,
  "improvementAreas" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "assignedFacilitatorEmployeeId" TEXT,
  "startDate" DATE,
  "targetDate" DATE,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "chris_promotion_pipeline" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "assessmentId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'LEADERSHIP_REVIEW',
  "lrtStatus" TEXT NOT NULL DEFAULT 'NOT_STARTED',
  "hrRecommendation" TEXT,
  "leadershipRecommendation" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "chris_celebration_events" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "eventDate" DATE NOT NULL,
  "message" TEXT NOT NULL,
  "senderName" TEXT NOT NULL DEFAULT 'Zermatt Liquor Limited',
  "footerText" TEXT NOT NULL DEFAULT 'Powered by CHRiS',
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "sentAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("organizationId","employeeId","eventType","eventDate")
);

CREATE TABLE IF NOT EXISTS "chris_automation_settings" (
  "organizationId" TEXT PRIMARY KEY,
  "essUrl" TEXT,
  "birthdayMessagesEnabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "anniversaryMessagesEnabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "autoOpenPayrollEnabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "quarterlyPerformanceEnabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
