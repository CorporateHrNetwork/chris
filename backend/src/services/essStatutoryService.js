// ESS is a published employee view, not the administrative calculation ledger.
// Keep the ledger untouched. Sum legitimate approved contributions rather than
// discarding rows merely because their displayed amounts happen to match.
const ESS_STATUTORY_OBLIGATIONS_SQL = `
  SELECT MIN(o."id") AS "id", o."obligationType", o."periodYear",
         o."periodMonth", o."currency", o."status",
         SUM(o."assessableBase") AS "assessableBase",
         SUM(o."employeeAmount") AS "employeeAmount",
         SUM(o."employerAmount") AS "employerAmount",
         SUM(o."totalLiability") AS "totalLiability",
         SUM(o."amountRemitted") AS "amountRemitted",
         MIN(o."dueDate") AS "dueDate"
    FROM "statutory_obligations" o
    JOIN "payroll_runs" r
      ON r."id" = o."payrollRunId"
     AND r."organizationId" = o."organizationId"
   WHERE o."organizationId" = $1 AND o."employeeId" = $2
     AND r."status" = 'APPROVED'
     AND o."status" NOT IN ('DRAFT_CALCULATED', 'REVERSED')
   GROUP BY o."periodYear", o."periodMonth", o."obligationType",
            o."currency", o."status"
   ORDER BY o."periodYear" DESC, o."periodMonth" DESC,
            o."obligationType", o."currency", o."status"
`;

module.exports = { ESS_STATUTORY_OBLIGATIONS_SQL };
