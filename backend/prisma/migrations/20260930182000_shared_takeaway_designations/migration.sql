-- Allow selected designations to be valid for multiple departments without
-- duplicating designation records or changing historical primary ownership.

CREATE TABLE IF NOT EXISTS "designation_department_eligibility" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "designationId" TEXT NOT NULL,
  "departmentId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "designation_department_eligibility_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "designation_department_eligibility_designation_fkey"
    FOREIGN KEY ("organizationId","designationId") REFERENCES "designations"("organizationId","id") ON DELETE CASCADE,
  CONSTRAINT "designation_department_eligibility_department_fkey"
    FOREIGN KEY ("organizationId","departmentId") REFERENCES "departments"("organizationId","id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "designation_department_eligibility_org_designation_department_key"
  ON "designation_department_eligibility"("organizationId","designationId","departmentId");
CREATE INDEX IF NOT EXISTS "designation_department_eligibility_org_department_idx"
  ON "designation_department_eligibility"("organizationId","departmentId");
CREATE INDEX IF NOT EXISTS "designation_department_eligibility_org_designation_idx"
  ON "designation_department_eligibility"("organizationId","designationId");

WITH org AS (
  SELECT id FROM organizations WHERE slug='zermatt-liquor-limited' LIMIT 1
),
takeaway_departments AS (
  SELECT d.id,d.name,d."organizationId"
  FROM departments d JOIN org o ON o.id=d."organizationId"
  WHERE d.name IN ('BB Takeaway','BB Takeaway (WSE)','BB Takeaway (GWP)')
    AND d."isActive"=TRUE
),
shared_designations AS (
  SELECT des.id,des.name,des."organizationId"
  FROM designations des JOIN org o ON o.id=des."organizationId"
  WHERE des.name IN (
    'BB Takeaway Attendant',
    'BB Takeaway Cashier',
    'BB Takeaway Shredder',
    'BB Takeaway Team Leader'
  )
    AND des."isActive"=TRUE
)
INSERT INTO "designation_department_eligibility"
  ("id","organizationId","designationId","departmentId","createdAt")
SELECT
  md5(sd."organizationId"||'|'||sd.id||'|'||td.id),
  sd."organizationId",sd.id,td.id,CURRENT_TIMESTAMP
FROM shared_designations sd
CROSS JOIN takeaway_departments td
ON CONFLICT ("organizationId","designationId","departmentId") DO NOTHING;
