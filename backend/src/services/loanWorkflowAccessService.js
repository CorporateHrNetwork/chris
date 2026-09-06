const prisma = require("../config/prisma");

const CURRENT_EMPLOYEE_STATUSES = ["ACTIVE", "PROBATION", "LEAVE", "SUSPENDED"];

function accessError(code, message, statusCode = 403) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

async function getUserLocationAccess({ organizationId, userId, prismaClient = prisma }) {
  const user = await prismaClient.user.findFirst({
    where: { id: userId, organizationId, isActive: true },
    select: {
      id: true,
      locationScope: true,
      userLocations: { select: { locationId: true } },
    },
  });
  if (!user) throw accessError("LOAN_WORKFLOW_USER_UNAVAILABLE", "User account is unavailable.", 403);
  const allLocations = user.locationScope === "ALL_LOCATIONS";
  return {
    allLocations,
    locationIds: user.userLocations.map((row) => row.locationId),
  };
}

function visibleLocationClause(access, alias = "l", startParameter = 3) {
  if (access.allLocations) return { sql: "", values: [] };
  return {
    sql: ` AND ${alias}."workflowLocationId" = ANY($${startParameter}::text[])`,
    values: [access.locationIds],
  };
}

async function assertLoanLocationAccess({ organizationId, userId, loanId, prismaClient = prisma }) {
  const access = await getUserLocationAccess({ organizationId, userId, prismaClient });
  if (access.allLocations) return access;
  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT "workflowLocationId" FROM "payroll_loans" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,
    organizationId,
    loanId
  );
  if (!rows[0]) throw accessError("LOAN_NOT_FOUND", "Loan application not found.", 404);
  if (!rows[0].workflowLocationId || !access.locationIds.includes(rows[0].workflowLocationId)) {
    throw accessError("LOAN_LOCATION_ACCESS_DENIED", "This loan application is outside your assigned location scope.", 403);
  }
  return access;
}

async function listLoanEmployeeOptions({ organizationId, userId, prismaClient = prisma }) {
  const access = await getUserLocationAccess({ organizationId, userId, prismaClient });
  const where = {
    organizationId,
    status: { in: CURRENT_EMPLOYEE_STATUSES },
    ...(access.allLocations ? {} : { locationId: { in: access.locationIds } }),
  };
  const employees = await prismaClient.employee.findMany({
    where,
    select: {
      id: true,
      employeeNumber: true,
      firstName: true,
      middleName: true,
      lastName: true,
      employmentType: true,
      department: { select: { name: true } },
      designation: { select: { name: true } },
      location: { select: { id: true, name: true } },
    },
    orderBy: { employeeNumber: "asc" },
  });
  return employees.map((employee) => ({
    id: employee.id,
    employeeNumber: employee.employeeNumber,
    employeeName: [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(" "),
    department: employee.department?.name || null,
    designation: employee.designation?.name || null,
    employmentType: employee.employmentType || null,
    locationId: employee.location?.id || null,
    location: employee.location?.name || null,
  }));
}

async function listVisibleLoans({ organizationId, userId, status, employeeNumber, prismaClient = prisma }) {
  const access = await getUserLocationAccess({ organizationId, userId, prismaClient });
  const values = [organizationId];
  const filters = [];
  let parameter = 2;
  if (!access.allLocations) {
    filters.push(`l."workflowLocationId" = ANY($${parameter}::text[])`);
    values.push(access.locationIds);
    parameter += 1;
  }
  if (String(status || "").trim()) {
    filters.push(`l."status"=$${parameter}`);
    values.push(String(status).trim().toUpperCase());
    parameter += 1;
  }
  if (String(employeeNumber || "").trim()) {
    filters.push(`e."employeeNumber"=$${parameter}`);
    values.push(String(employeeNumber).trim().toUpperCase());
  }
  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT l.*,e."employeeNumber",CONCAT_WS(' ',e."firstName",e."middleName",e."lastName") AS "employeeName",
            ol."name" AS "locationName",parent."loanNumber" AS "parentLoanNumber"
       FROM "payroll_loans" l
       JOIN "employees" e ON e."id"=l."employeeId" AND e."organizationId"=l."organizationId"
       LEFT JOIN "organization_locations" ol ON ol."id"=l."workflowLocationId" AND ol."organizationId"=l."organizationId"
       LEFT JOIN "payroll_loans" parent ON parent."id"=l."parentLoanId" AND parent."organizationId"=l."organizationId"
      WHERE l."organizationId"=$1 ${filters.length ? `AND ${filters.join(" AND ")}` : ""}
      ORDER BY l."createdAt" DESC`,
    ...values
  );
  return rows.map((row) => ({
    ...row,
    principalAmount: Number(row.principalAmount || 0),
    outstandingAmount: Number(row.outstandingAmount || 0),
    installmentAmount: Number(row.installmentAmount || 0),
    applicationDate: row.applicationDate ? new Date(row.applicationDate).toISOString().slice(0, 10) : null,
    approvedDate: row.approvedDate ? new Date(row.approvedDate).toISOString().slice(0, 10) : null,
    disbursedDate: row.disbursedDate ? new Date(row.disbursedDate).toISOString().slice(0, 10) : null,
    recoveryStartDate: row.recoveryStartDate ? new Date(row.recoveryStartDate).toISOString().slice(0, 10) : null,
  }));
}

async function getVisibleLoanSummary({ organizationId, userId, prismaClient = prisma }) {
  const loans = await listVisibleLoans({ organizationId, userId, prismaClient });
  const current = loans.filter((loan) => ["ACTIVE", "PAUSED"].includes(loan.status));
  return {
    pendingApproval: loans.filter((loan) => ["PENDING_APPROVAL", "PENDING_HR_VERIFICATION", "PENDING_GM_APPROVAL"].includes(loan.status)).length,
    approvedAwaitingDisbursement: loans.filter((loan) => ["APPROVED", "GM_APPROVED", "AWAITING_DISBURSEMENT"].includes(loan.status)).length,
    activeLoans: loans.filter((loan) => loan.status === "ACTIVE").length,
    pausedLoans: loans.filter((loan) => loan.status === "PAUSED").length,
    borrowers: new Set(current.map((loan) => loan.employeeId)).size,
    outstandingBalance: current.reduce((sum, loan) => sum + Number(loan.outstandingAmount || 0), 0),
    totalPrincipal: loans.reduce((sum, loan) => sum + Number(loan.principalAmount || 0), 0),
  };
}

async function listVisibleRecoveries({ organizationId, userId, loanId = null, prismaClient = prisma }) {
  const access = await getUserLocationAccess({ organizationId, userId, prismaClient });
  const values = [organizationId];
  const filters = [];
  let parameter = 2;
  if (!access.allLocations) {
    filters.push(`l."workflowLocationId" = ANY($${parameter}::text[])`);
    values.push(access.locationIds);
    parameter += 1;
  }
  if (loanId) {
    filters.push(`r."loanId"=$${parameter}`);
    values.push(loanId);
  }
  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT r."id",r."loanId",r."employeeId",r."runId",r."runLineId",r."amount",r."recoveryDate",r."status",r."createdAt",
            l."loanNumber",e."employeeNumber",CONCAT_WS(' ',e."firstName",e."middleName",e."lastName") AS "employeeName",
            pp."code" AS "payrollPeriodCode",pp."name" AS "payrollPeriodName"
       FROM "payroll_loan_recoveries" r
       JOIN "payroll_loans" l ON l."id"=r."loanId" AND l."organizationId"=r."organizationId"
       JOIN "employees" e ON e."id"=r."employeeId" AND e."organizationId"=r."organizationId"
       JOIN "payroll_runs" pr ON pr."id"=r."runId" AND pr."organizationId"=r."organizationId"
       JOIN "payroll_periods" pp ON pp."id"=pr."periodId" AND pp."organizationId"=pr."organizationId"
      WHERE r."organizationId"=$1 ${filters.length ? `AND ${filters.join(" AND ")}` : ""}
      ORDER BY r."recoveryDate" DESC,r."createdAt" DESC`,
    ...values
  );
  return rows.map((row) => ({ ...row, amount: Number(row.amount || 0), recoveryDate: new Date(row.recoveryDate).toISOString().slice(0, 10) }));
}

module.exports = {
  getUserLocationAccess,
  assertLoanLocationAccess,
  listLoanEmployeeOptions,
  listVisibleLoans,
  getVisibleLoanSummary,
  listVisibleRecoveries,
};
