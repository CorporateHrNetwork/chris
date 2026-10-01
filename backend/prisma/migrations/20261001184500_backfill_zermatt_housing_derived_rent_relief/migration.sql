-- Backfill Zermatt employees onboarded from 30-Sep-2026 with the approved
-- rent-relief basis: monthly Payroll Housing Allowance × 12 months.
-- Existing tax-relief records are authoritative and are never overwritten.
-- New records remain PENDING_VERIFICATION before PAYE consumption.

WITH org AS (
  SELECT id FROM organizations WHERE slug='zermatt-liquor-limited' LIMIT 1
), policy AS (
  SELECT pp."organizationId",
         COALESCE((pp."salaryStructure"->>'housing')::numeric,0) AS housing_rate,
         COALESCE((pp."payeRules"->>'rentReliefRate')::numeric,20) AS relief_rate,
         COALESCE((pp."payeRules"->>'rentReliefCap')::numeric,500000) AS relief_cap
    FROM payroll_policy_versions pp
    JOIN org o ON o.id=pp."organizationId"
   WHERE pp.status='ACTIVE'
     AND pp."effectiveFrom" <= DATE '2026-12-31'
     AND (pp."effectiveTo" IS NULL OR pp."effectiveTo" >= DATE '2026-12-31')
   ORDER BY pp."effectiveFrom" DESC, pp."versionNumber" DESC
   LIMIT 1
), current_salary AS (
  SELECT DISTINCT ON (sr."employeeId")
         sr."organizationId",sr."employeeId",sr.amount,sr.currency,sr."effectiveFrom"
    FROM payroll_salary_rates sr
    JOIN org o ON o.id=sr."organizationId"
   WHERE sr.status='ACTIVE'
     AND sr."effectiveFrom" <= CURRENT_DATE
     AND (sr."effectiveTo" IS NULL OR sr."effectiveTo" >= CURRENT_DATE)
   ORDER BY sr."employeeId",sr."effectiveFrom" DESC
), eligible AS (
  SELECT
    e."organizationId",
    e.id AS employee_id,
    e."employeeNumber",
    cs.amount::numeric AS gross,
    p.housing_rate,
    ROUND((cs.amount::numeric * p.housing_rate / 100.0),2) AS monthly_housing,
    ROUND((cs.amount::numeric * p.housing_rate / 100.0) * 12,2) AS annual_housing,
    ROUND(LEAST(
      p.relief_cap,
      ((cs.amount::numeric * p.housing_rate / 100.0) * 12) * p.relief_rate / 100.0
    ),2) AS eligible_relief
  FROM employees e
  JOIN org o ON o.id=e."organizationId"
  JOIN current_salary cs
    ON cs."organizationId"=e."organizationId" AND cs."employeeId"=e.id
  CROSS JOIN policy p
  WHERE e."createdAt" >= TIMESTAMP '2026-09-30 00:00:00'
    AND e.status::text IN ('ACTIVE','PROBATION','LEAVE','SUSPENDED')
), inserted AS (
  INSERT INTO payroll_tax_reliefs (
    id,"organizationId","employeeId","taxYear","reliefType",
    "annualDeclaredAmount","eligibleReliefAmount","evidenceReference",
    status,"declaredByUserId",notes,"createdAt","updatedAt"
  )
  SELECT
    md5(el."organizationId"||'|'||el.employee_id||'|2026|RENT|HOUSING-X12'),
    el."organizationId",
    el.employee_id,
    2026,
    'RENT',
    el.annual_housing,
    el.eligible_relief,
    'CHRIS-PAYROLL-HOUSING-'||el."employeeNumber"||'-2026',
    'PENDING_VERIFICATION',
    NULL,
    'System-derived Zermatt rent basis: Payroll Housing Allowance ('||
      trim(to_char(el.housing_rate,'FM999990.####'))||'% of monthly gross) × 12 months.',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  FROM eligible el
  WHERE NOT EXISTS (
    SELECT 1
      FROM payroll_tax_reliefs tr
     WHERE tr."organizationId"=el."organizationId"
       AND tr."employeeId"=el.employee_id
       AND tr."taxYear"=2026
       AND tr."reliefType"='RENT'
  )
  ON CONFLICT ("organizationId","employeeId","taxYear","reliefType") DO NOTHING
  RETURNING "organizationId","employeeId","annualDeclaredAmount","eligibleReliefAmount","evidenceReference"
), audit_payload AS (
  SELECT
    i."organizationId",
    COUNT(*)::int AS inserted_count,
    COALESCE(jsonb_agg(jsonb_build_object(
      'employeeId',i."employeeId",
      'annualRentBasis',i."annualDeclaredAmount",
      'eligibleRentRelief',i."eligibleReliefAmount",
      'evidenceReference',i."evidenceReference"
    )),'[]'::jsonb) AS rows
  FROM inserted i
  GROUP BY i."organizationId"
)
INSERT INTO organization_audits (
  id,"organizationId","actorUserId","entityType","entityId",action,
  "previousValue","newValue",reason,"createdAt"
)
SELECT
  md5(ap."organizationId"||'|20261001|HOUSING_DERIVED_RENT_RELIEF_BACKFILL'),
  ap."organizationId",
  NULL,
  'PayrollTaxReliefBackfill',
  '2026-HOUSING-X12',
  'HOUSING_DERIVED_RENT_RELIEF_BACKFILLED',
  NULL,
  jsonb_build_object('taxYear',2026,'inserted',ap.inserted_count,'records',ap.rows),
  'Backfilled newly onboarded Zermatt employees using Payroll Housing Allowance × 12; existing relief records preserved.',
  CURRENT_TIMESTAMP
FROM audit_payload ap
ON CONFLICT ("id") DO NOTHING;
