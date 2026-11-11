const { NORTHSTAR_ID } = require("../middleware/salesDemoBoundary");

async function loadPayrollSalaryAdvances(client, organizationId, periodEnd) {
  return client.$queryRawUnsafe(
    `SELECT "id","employeeId","outstandingAmount",
            CASE WHEN $3::boolean THEN "outstandingAmount" ELSE "installmentAmount" END AS "installmentAmount",
            "recoveryStartDate"
       FROM "payroll_salary_advances"
      WHERE "organizationId"=$1 AND "status"='ACTIVE'
        AND "outstandingAmount" > 0 AND "installmentAmount" > 0
        AND "recoveryStartDate" <= $2::date
        AND (NOT $3::boolean OR ("issuedDate" BETWEEN date_trunc('month', $2::date::timestamp)::date AND $2::date))`,
    organizationId,
    periodEnd,
    organizationId === NORTHSTAR_ID
  );
}

async function assertNorthstarAdvancePeriodEditable(client, organizationId, issuedDate) {
  const [locked] = await client.$queryRawUnsafe(
    `SELECT 1 FROM "payroll_periods" p
      WHERE p."organizationId"=$1 AND $2::date BETWEEN p."periodStart" AND p."periodEnd"
        AND (p."status" IN ('LOCKED','CLOSED') OR EXISTS (
          SELECT 1 FROM "payroll_runs" r WHERE r."organizationId"=$1 AND r."periodId"=p."id"
            AND r."status" IN ('PENDING_APPROVAL','APPROVED')
        ))
      LIMIT 1`,
    organizationId,
    issuedDate
  );
  if (locked) {
    throw Object.assign(new Error("The grant month's payroll is locked or already submitted. Reopen its payroll before changing salary advances."), {
      code: "SALARY_ADVANCE_PAYROLL_LOCKED",
      statusCode: 409,
    });
  }
}

module.exports = { loadPayrollSalaryAdvances, assertNorthstarAdvancePeriodEditable };
