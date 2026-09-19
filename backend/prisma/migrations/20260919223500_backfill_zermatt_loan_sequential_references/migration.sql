-- Backfill deterministic ZERMATT references in original record order.
WITH ordered AS (
  SELECT l."id",
         ROW_NUMBER() OVER (PARTITION BY l."organizationId" ORDER BY l."createdAt", l."id") AS seq
    FROM "payroll_loans" l
    JOIN "organizations" o ON o."id" = l."organizationId"
   WHERE o."slug" = 'zermatt-liquor-limited'
)
UPDATE "payroll_loans" l
   SET "gmApprovalReference" = COALESCE(l."gmApprovalReference", 'ZLL-GM-' || LPAD(ordered.seq::text, 6, '0')),
       "accountsPaymentReference" = COALESCE(l."accountsPaymentReference", 'ZLL-AP-' || LPAD(ordered.seq::text, 6, '0'))
  FROM ordered
 WHERE l."id" = ordered."id";
