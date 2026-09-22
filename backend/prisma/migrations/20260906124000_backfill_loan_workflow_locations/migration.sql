-- Preserve branch visibility for loans imported before the automated origination workflow.
-- Existing loans inherit the employee's current authoritative organization location only when workflowLocationId is blank.

UPDATE "payroll_loans" l
SET "workflowLocationId" = e."locationId",
    "updatedAt" = CURRENT_TIMESTAMP
FROM "employees" e
WHERE l."organizationId" = e."organizationId"
  AND l."employeeId" = e."id"
  AND l."workflowLocationId" IS NULL
  AND e."locationId" IS NOT NULL;
