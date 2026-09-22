-- CHRiS ZERMATT payroll policy v3 — tenant-controlled payroll workday cycles
-- ZERMATT rule:
--   Part-time = 16 payroll days
--   Every other ZERMATT Employment Type = 26 payroll days
-- Current authoritative ZERMATT Employment Types:
--   Full-Time, Part-time, Expatriate, NYSC/Internship
--
-- This is an effective-dated policy version. Earlier policy migrations are not rewritten.

INSERT INTO "payroll_policy_versions" (
  "id","organizationId","code","name","versionNumber","jurisdiction","effectiveFrom","status",
  "salaryStructure","standardDays","pensionEmployeeRate","pensionEmployerRate","pensionableComponents",
  "payeRules","employerStatutoryRules"
)
SELECT
  'zll-ng-payroll-2026-v3',
  o."id",
  'ZLL-NG-PAYROLL',
  'ZERMATT Nigeria Payroll Policy — Tenant Workday Cycles',
  3,
  'NG',
  DATE '2026-01-01',
  'ACTIVE',
  '{"basic":57,"housing":11,"transport":10,"meal":9,"medical":8,"utility":5}'::jsonb,
  '{"Full-Time":26,"Part-time":16,"Expatriate":26,"NYSC/Internship":26}'::jsonb,
  8,
  10,
  '["basic","housing","transport"]'::jsonb,
  '{"ruleCode":"NG-NTA-2025-2026","effectiveFrom":"2026-01-01","minimumWageMonthly":70000,"rentReliefRate":20,"rentReliefCap":500000,"statutoryDeductionExemptEmploymentTypes":["Part-time"],"bands":[{"limit":800000,"rate":0},{"limit":2200000,"rate":15},{"limit":9000000,"rate":18},{"limit":13000000,"rate":21},{"limit":25000000,"rate":23},{"limit":null,"rate":25}],"nhf":{"enabled":false,"employeeRate":2.5,"basis":"BASIC","note":"Enable only after employee/applicability data is configured."}}'::jsonb,
  '{"nsitf":{"enabled":true,"employerRate":1,"basis":"TOTAL_PAYROLL","employeeDeduction":false},"itf":{"enabled":true,"employerRate":1,"basis":"ANNUAL_PAYROLL_ACCRUAL","employeeDeduction":false},"pensionParticipationExemptEmploymentTypes":["Part-time"]}'::jsonb
FROM "organizations" o
WHERE o."slug" = 'zermatt-liquor-limited'
ON CONFLICT ("organizationId","code","versionNumber") DO NOTHING;

UPDATE "payroll_policy_versions" pv
SET "status"='RETIRED', "updatedAt"=CURRENT_TIMESTAMP
FROM "organizations" o
WHERE pv."organizationId"=o."id"
  AND o."slug"='zermatt-liquor-limited'
  AND pv."code"='ZLL-NG-PAYROLL'
  AND pv."versionNumber" < 3
  AND pv."status"='ACTIVE'
  AND EXISTS (
    SELECT 1
    FROM "payroll_policy_versions" current_policy
    WHERE current_policy."organizationId"=pv."organizationId"
      AND current_policy."code"='ZLL-NG-PAYROLL'
      AND current_policy."versionNumber"=3
      AND current_policy."status"='ACTIVE'
  );
