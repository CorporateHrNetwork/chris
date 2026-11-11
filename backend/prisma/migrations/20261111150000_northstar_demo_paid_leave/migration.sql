-- Provision the November 2026 paid-leave demonstration for the fictional tenant.
DO $$
DECLARE
  demo_org constant text := 'chris-demo-org-20261022';
  demo_type constant text := 'northstar-demo-annual-leave-type';
  demo_policy constant text := 'northstar-demo-annual-leave-policy';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "organizations" WHERE "id" = demo_org AND "slug" = 'chris-demo-company') THEN
    RETURN;
  END IF;

  INSERT INTO "leave_types" ("id","organizationId","name","code","isPaid","updatedAt")
  VALUES (demo_type,demo_org,'Demo Annual Leave','NORTHSTAR_DEMO_ANNUAL',true,CURRENT_TIMESTAMP)
  ON CONFLICT ("id") DO NOTHING;

  INSERT INTO "leave_policies"
    ("id","organizationId","leaveTypeId","name","entitlementDays","effectiveFrom","updatedAt")
  VALUES (demo_policy,demo_org,demo_type,'Northstar Demo Annual Leave',10,'2026-01-01',CURRENT_TIMESTAMP)
  ON CONFLICT ("id") DO NOTHING;

  WITH samples("employeeNumber","startDate","endDate","units") AS (
    VALUES ('NSD0001',DATE '2026-11-16',DATE '2026-11-20',5),
           ('NSD0002',DATE '2026-11-23',DATE '2026-11-26',4)
  ), inserted AS (
    INSERT INTO "leave_requests"
      ("id","organizationId","employeeId","leaveTypeId","leavePolicyId","startDate","endDate",
       "requestedUnits","status","reason","reviewNotes","reviewedAt","updatedAt")
    SELECT 'northstar-paid-leave-demo-' || s."employeeNumber",demo_org,e."id",demo_type,demo_policy,
           s."startDate",s."endDate",s."units",'APPROVED','Fictional annual leave demonstration',
           'Approved sample for the Northstar payroll demonstration',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
    FROM samples s
    JOIN "employees" e ON e."organizationId" = demo_org AND e."employeeNumber" = s."employeeNumber"
    ON CONFLICT ("id") DO NOTHING
    RETURNING "employeeId","requestedUnits"
  )
  INSERT INTO "leave_balances"
    ("id","organizationId","employeeId","leaveTypeId","leaveYear","openingBalance","used","updatedAt")
  SELECT 'northstar-demo-annual-balance-' || "employeeId",demo_org,"employeeId",demo_type,2026,
         10,"requestedUnits",CURRENT_TIMESTAMP
  FROM inserted
  ON CONFLICT ("organizationId","employeeId","leaveTypeId","leaveYear") DO UPDATE
  SET "used" = "leave_balances"."used" + EXCLUDED."used", "updatedAt" = CURRENT_TIMESTAMP;

  IF FOUND THEN
    UPDATE "payroll_runs" r
       SET "statutoryStatus" = 'RECALCULATION_REQUIRED', "updatedAt" = CURRENT_TIMESTAMP
      FROM "payroll_periods" p
     WHERE r."organizationId" = demo_org AND p."organizationId" = demo_org
       AND r."periodId" = p."id" AND r."status" IN ('DRAFT','REJECTED')
       AND p."periodStart" <= DATE '2026-11-30' AND p."periodEnd" >= DATE '2026-11-01';
  END IF;
END $$;
