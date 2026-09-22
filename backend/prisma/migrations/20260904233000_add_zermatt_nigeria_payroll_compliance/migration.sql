-- CHRiS Nigeria Payroll Compliance — ZERMATT Release-1
-- Adds effective-dated payroll policy and documented tax-relief records.
-- Employee, Leave and Attendance source tables are not rewritten.

CREATE TABLE "payroll_policy_versions" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL DEFAULT 1,
  "jurisdiction" TEXT NOT NULL DEFAULT 'NG',
  "effectiveFrom" DATE NOT NULL,
  "effectiveTo" DATE,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "salaryStructure" JSONB NOT NULL,
  "standardDays" JSONB NOT NULL,
  "pensionEmployeeRate" DECIMAL(8,4) NOT NULL DEFAULT 8,
  "pensionEmployerRate" DECIMAL(8,4) NOT NULL DEFAULT 10,
  "pensionableComponents" JSONB NOT NULL,
  "payeRules" JSONB NOT NULL,
  "employerStatutoryRules" JSONB NOT NULL,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_policy_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payroll_policy_versions_dates_check" CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom"),
  CONSTRAINT "payroll_policy_versions_status_check" CHECK ("status" IN ('DRAFT','ACTIVE','RETIRED')),
  CONSTRAINT "payroll_policy_versions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payroll_policy_versions_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "payroll_policy_versions_org_code_version_key" ON "payroll_policy_versions"("organizationId","code","versionNumber");
CREATE INDEX "payroll_policy_versions_org_status_effective_idx" ON "payroll_policy_versions"("organizationId","status","effectiveFrom","effectiveTo");

CREATE TABLE "payroll_tax_reliefs" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "taxYear" INTEGER NOT NULL,
  "reliefType" TEXT NOT NULL DEFAULT 'RENT',
  "annualDeclaredAmount" DECIMAL(18,2) NOT NULL,
  "eligibleReliefAmount" DECIMAL(18,2) NOT NULL,
  "evidenceReference" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION',
  "declaredByUserId" TEXT,
  "verifiedByUserId" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_tax_reliefs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payroll_tax_reliefs_year_check" CHECK ("taxYear" >= 2026),
  CONSTRAINT "payroll_tax_reliefs_amount_check" CHECK ("annualDeclaredAmount" >= 0 AND "eligibleReliefAmount" >= 0),
  CONSTRAINT "payroll_tax_reliefs_type_check" CHECK ("reliefType" IN ('RENT')),
  CONSTRAINT "payroll_tax_reliefs_status_check" CHECK ("status" IN ('PENDING_VERIFICATION','VERIFIED','REJECTED')),
  CONSTRAINT "payroll_tax_reliefs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payroll_tax_reliefs_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payroll_tax_reliefs_declaredByUserId_fkey" FOREIGN KEY ("declaredByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "payroll_tax_reliefs_verifiedByUserId_fkey" FOREIGN KEY ("verifiedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "payroll_tax_reliefs_org_employee_year_type_key" ON "payroll_tax_reliefs"("organizationId","employeeId","taxYear","reliefType");
CREATE INDEX "payroll_tax_reliefs_org_year_status_idx" ON "payroll_tax_reliefs"("organizationId","taxYear","status");

-- ZERMATT payroll policy supplied by the organization.
-- Uploaded Salary Rate remains the authoritative MONTHLY GROSS.
-- Basic/Housing/Transport/Meal/Medical/Utility are components of that gross and sum to 100%.
-- Pensionable components follow the statutory monthly-emolument basis: Basic + Housing + Transport.
-- NSITF/ECS and ITF are employer costs; they are not employee deductions.
INSERT INTO "payroll_policy_versions" (
  "id","organizationId","code","name","versionNumber","jurisdiction","effectiveFrom","status",
  "salaryStructure","standardDays","pensionEmployeeRate","pensionEmployerRate","pensionableComponents",
  "payeRules","employerStatutoryRules"
)
SELECT
  'zll-ng-payroll-2026-v1',
  o."id",
  'ZLL-NG-PAYROLL',
  'ZERMATT Nigeria Payroll Policy',
  1,
  'NG',
  DATE '2026-01-01',
  'ACTIVE',
  '{"basic":57,"housing":11,"transport":10,"meal":9,"medical":8,"utility":5}'::jsonb,
  '{"Full-Time":26,"Part-Time":16}'::jsonb,
  8,
  10,
  '["basic","housing","transport"]'::jsonb,
  '{"ruleCode":"NG-NTA-2025-2026","effectiveFrom":"2026-01-01","minimumWageMonthly":70000,"rentReliefRate":20,"rentReliefCap":500000,"bands":[{"limit":800000,"rate":0},{"limit":2200000,"rate":15},{"limit":9000000,"rate":18},{"limit":13000000,"rate":21},{"limit":25000000,"rate":23},{"limit":null,"rate":25}],"nhf":{"enabled":false,"employeeRate":2.5,"basis":"BASIC","note":"Enable only after employee/applicability data is configured."}}'::jsonb,
  '{"nsitf":{"enabled":true,"employerRate":1,"basis":"TOTAL_PAYROLL","employeeDeduction":false},"itf":{"enabled":true,"employerRate":1,"basis":"ANNUAL_PAYROLL_ACCRUAL","employeeDeduction":false}}'::jsonb
FROM "organizations" o
WHERE o."slug" = 'zermatt-liquor-limited'
ON CONFLICT DO NOTHING;
