-- ZERMATT Leave Allowance policy transition:
-- payment is in arrears and will be supplied by an authoritative reference schedule
-- based on the employee's last-December gross salary.
-- Approved payroll history is preserved. Current draft/submitted payroll is scrubbed
-- of the retired formula-based leave allowance.

CREATE TABLE IF NOT EXISTS "zermatt_leave_allowance_references" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "employeeNumber" TEXT NOT NULL,
  "applicableMonth" DATE NOT NULL,
  "referenceDecemberYear" INTEGER NOT NULL,
  "referenceDecemberGross" NUMERIC(18,2) NOT NULL,
  "leaveAllowanceAmount" NUMERIC(18,2) NOT NULL,
  "sourceFileName" TEXT,
  "sourceRowNumber" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "zermatt_leave_allowance_references_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "zermatt_leave_allowance_references_org_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "zermatt_leave_allowance_references_employee_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "zermatt_leave_allowance_references_status_check" CHECK ("status" IN ('ACTIVE','RETIRED')),
  CONSTRAINT "zermatt_leave_allowance_references_amount_check" CHECK ("referenceDecemberGross" >= 0 AND "leaveAllowanceAmount" >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "zermatt_leave_allowance_reference_employee_month_key"
  ON "zermatt_leave_allowance_references"("organizationId","employeeId","applicableMonth")
  WHERE "status"='ACTIVE';

CREATE INDEX IF NOT EXISTS "zermatt_leave_allowance_reference_month_idx"
  ON "zermatt_leave_allowance_references"("organizationId","applicableMonth","status");

-- Remove the retired formula-driven Leave Allowance only from mutable payroll runs.
-- Approved payroll remains immutable historical evidence.
WITH affected AS (
  SELECT pl."id",pl."organizationId",pl."runId",
         COALESCE((pl."details"->'leaveAllowance'->>'amount')::numeric,0) AS old_amount,
         pl."details"
    FROM "payroll_run_lines" pl
    JOIN "payroll_runs" pr ON pr."id"=pl."runId" AND pr."organizationId"=pl."organizationId"
    JOIN "organizations" o ON o."id"=pl."organizationId"
   WHERE o."slug"='zermatt-liquor-limited'
     AND pr."status" IN ('DRAFT','SUBMITTED')
     AND pl."details" ? 'leaveAllowance'
), updated AS (
  UPDATE "payroll_run_lines" pl
     SET "netPreview"=GREATEST(0,pl."netPreview"-a.old_amount),
         "details"=(a."details" - 'leaveAllowance') ||
           jsonb_build_object(
             'benefitEarnings',
             COALESCE(
               (SELECT jsonb_agg(item)
                  FROM jsonb_array_elements(COALESCE(a."details"->'benefitEarnings','[]'::jsonb)) item
                 WHERE COALESCE(item->>'code','') <> 'ZERMATT_LEAVE_ALLOWANCE'),
               '[]'::jsonb
             ),
             'leaveAllowancePolicy',
             jsonb_build_object(
               'mode','REFERENCE_IMPORT',
               'automaticCalculation',false,
               'salaryBasis','LAST_DECEMBER_GROSS',
               'paymentTiming','ARREARS',
               'status','AWAITING_REFERENCE'
             )
           ),
         "updatedAt"=CURRENT_TIMESTAMP
    FROM affected a
   WHERE pl."id"=a."id"
   RETURNING pl."runId",pl."organizationId"
)
UPDATE "payroll_runs" pr
   SET "netPreviewTotal"=x.total_net,
       "updatedAt"=CURRENT_TIMESTAMP
  FROM (
    SELECT pl."organizationId",pl."runId",COALESCE(SUM(pl."netPreview"),0) AS total_net
      FROM "payroll_run_lines" pl
     WHERE EXISTS (
       SELECT 1 FROM updated u
        WHERE u."organizationId"=pl."organizationId" AND u."runId"=pl."runId"
     )
     GROUP BY pl."organizationId",pl."runId"
  ) x
 WHERE pr."organizationId"=x."organizationId" AND pr."id"=x."runId";
