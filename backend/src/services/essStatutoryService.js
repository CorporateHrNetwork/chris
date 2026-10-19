// Employee-scoped presentation queries only. Never mutate the payroll ledger.
const ESS_PAYROLL_RUNS_CTE = `
  WITH employee_runs AS (
    SELECT r.*, p."periodStart", p."periodEnd", p."payDate",
           p."code" AS "periodCode", p."name" AS "periodName",
           ROW_NUMBER() OVER (
             PARTITION BY r."organizationId", date_trunc('month', p."periodStart")
             ORDER BY CASE r."status" WHEN 'APPROVED' THEN 0
                      WHEN 'PENDING_APPROVAL' THEN 1 WHEN 'SUBMITTED' THEN 1 ELSE 2 END,
                      r."updatedAt" DESC, r."createdAt" DESC, r."id" DESC
           ) AS revision_rank
      FROM "payroll_runs" r
      JOIN "payroll_periods" p ON p."id"=r."periodId" AND p."organizationId"=r."organizationId"
     WHERE r."organizationId"=$1
       AND r."status" IN ('APPROVED','PENDING_APPROVAL','SUBMITTED','DRAFT')
       AND EXISTS (SELECT 1 FROM "payroll_run_lines" l
                    WHERE l."runId"=r."id" AND l."organizationId"=$1 AND l."employeeId"=$2)
  )
`;

const ESS_STATUTORY_OBLIGATIONS_SQL = `${ESS_PAYROLL_RUNS_CTE},
  current_rows AS (
    SELECT MIN(o."id") AS "id", o."obligationType", o."periodYear", o."periodMonth",
           o."currency", o."status", SUM(o."assessableBase") AS "assessableBase",
           SUM(o."employeeAmount") AS "employeeAmount", SUM(o."employerAmount") AS "employerAmount",
           SUM(o."totalLiability") AS "totalLiability", SUM(o."amountRemitted") AS "amountRemitted",
           MIN(o."dueDate") AS "dueDate", 'CURRENT'::text AS "recordKind"
      FROM "statutory_obligations" o
      JOIN employee_runs r ON r."id"=o."payrollRunId" AND r."organizationId"=o."organizationId"
     WHERE o."organizationId"=$1 AND o."employeeId"=$2 AND o."status"<>'REVERSED'
       AND (r."status"='APPROVED' OR r.revision_rank=1)
     GROUP BY o."periodYear",o."periodMonth",o."obligationType",o."currency",o."status"
  ), reversal_revisions AS (
    SELECT o.*, ROW_NUMBER() OVER (
      PARTITION BY o."periodYear",o."periodMonth",o."obligationType",o."currency"
      ORDER BY o."updatedAt" DESC,o."createdAt" DESC,o."id" DESC
    ) AS reversal_rank
    FROM "statutory_obligations" o
    WHERE o."organizationId"=$1 AND o."employeeId"=$2 AND o."status"='REVERSED'
  ), display_rows AS (
    SELECT * FROM current_rows
    UNION ALL
    SELECT "id","obligationType","periodYear","periodMonth","currency","status",
           "assessableBase","employeeAmount","employerAmount","totalLiability","amountRemitted",
           "dueDate",'HISTORY'::text AS "recordKind"
      FROM reversal_revisions WHERE reversal_rank=1
  )
  SELECT * FROM display_rows
  ORDER BY "periodYear" DESC,"periodMonth" DESC,"obligationType","currency","recordKind","status"
`;

const ESS_PAYROLL_PREVIEWS_SQL = `${ESS_PAYROLL_RUNS_CTE}
  SELECT l."id",l."runId",l."currency",l."grossPay",l."deductions",l."netPreview",
         r."status" AS "runStatus",r."periodCode",r."periodName",r."periodStart",r."periodEnd",r."payDate"
    FROM employee_runs r
    JOIN "payroll_run_lines" l ON l."runId"=r."id" AND l."organizationId"=r."organizationId"
   WHERE l."organizationId"=$1 AND l."employeeId"=$2 AND r.revision_rank=1 AND r."status"<>'APPROVED'
   ORDER BY r."periodEnd" DESC
`;

const ESS_CURRENT_SALARY_SQL = `
  SELECT "amount", "currency" FROM "payroll_salary_rates"
   WHERE "organizationId"=$1 AND "employeeId"=$2 AND "status"='ACTIVE'
     AND "effectiveFrom"<=CURRENT_DATE AND ("effectiveTo" IS NULL OR "effectiveTo">=CURRENT_DATE)
   ORDER BY "effectiveFrom" DESC,"updatedAt" DESC,"id" DESC LIMIT 1
`;

module.exports = { ESS_STATUTORY_OBLIGATIONS_SQL, ESS_PAYROLL_PREVIEWS_SQL, ESS_CURRENT_SALARY_SQL };
