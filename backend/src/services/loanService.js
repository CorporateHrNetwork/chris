const crypto = require("crypto");
const prisma = require("../config/prisma");

function loanError(code, message, statusCode = 400, details) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

function text(value) {
  return String(value ?? "").trim();
}

function money(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw loanError("INVALID_LOAN_AMOUNT", `${label} must be greater than zero.`);
  }
  return Math.round(number * 100) / 100;
}

function dateOnly(value, label) {
  const raw = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw loanError("INVALID_DATE", `${label} must use YYYY-MM-DD.`);
  }
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) {
    throw loanError("INVALID_DATE", `${label} is not a valid date.`);
  }
  return raw;
}

function mapLoan(row) {
  if (!row) return null;
  return {
    ...row,
    principalAmount: Number(row.principalAmount || 0),
    outstandingAmount: Number(row.outstandingAmount || 0),
    installmentAmount: Number(row.installmentAmount || 0),
    applicationDate: row.applicationDate ? new Date(row.applicationDate).toISOString().slice(0, 10) : null,
    approvedDate: row.approvedDate ? new Date(row.approvedDate).toISOString().slice(0, 10) : null,
    disbursedDate: row.disbursedDate ? new Date(row.disbursedDate).toISOString().slice(0, 10) : null,
    recoveryStartDate: row.recoveryStartDate ? new Date(row.recoveryStartDate).toISOString().slice(0, 10) : null,
  };
}

async function resolveEmployee(client, organizationId, employeeNumber) {
  const normalized = text(employeeNumber).toUpperCase();
  if (!normalized) throw loanError("EMPLOYEE_REQUIRED", "Employee Number is required.");
  const employee = await client.employee.findFirst({
    where: { organizationId, employeeNumber: normalized },
    select: {
      id: true,
      employeeNumber: true,
      firstName: true,
      middleName: true,
      lastName: true,
      status: true,
    },
  });
  if (!employee) throw loanError("EMPLOYEE_NOT_FOUND", `Employee ${normalized} was not found in this organization.`, 404);
  return employee;
}

function employeeName(employee) {
  return [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(" ");
}

async function writeAudit(client, { organizationId, actorUserId, entityId, action, previousValue, newValue, reason }) {
  await client.organizationAudit.create({
    data: {
      organizationId,
      actorUserId: actorUserId || null,
      entityType: "PayrollLoan",
      entityId,
      action,
      previousValue: previousValue || undefined,
      newValue: newValue || undefined,
      reason: text(reason) || null,
    },
  });
}

async function listLoans({ organizationId, status, employeeNumber, prismaClient = prisma }) {
  const filters = [];
  const values = [organizationId];
  let parameter = 2;

  if (text(status)) {
    filters.push(`l."status"=$${parameter}`);
    values.push(text(status).toUpperCase());
    parameter += 1;
  }
  if (text(employeeNumber)) {
    filters.push(`e."employeeNumber"=$${parameter}`);
    values.push(text(employeeNumber).toUpperCase());
  }

  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT l.*, e."employeeNumber",
            CONCAT_WS(' ',e."firstName",e."middleName",e."lastName") AS "employeeName",
            parent."loanNumber" AS "parentLoanNumber"
       FROM "payroll_loans" l
       JOIN "employees" e
         ON e."id"=l."employeeId" AND e."organizationId"=l."organizationId"
       LEFT JOIN "payroll_loans" parent
         ON parent."id"=l."parentLoanId" AND parent."organizationId"=l."organizationId"
      WHERE l."organizationId"=$1
        ${filters.length ? `AND ${filters.join(" AND ")}` : ""}
      ORDER BY l."createdAt" DESC`,
    ...values
  );
  return rows.map(mapLoan);
}

async function getLoanSummary({ organizationId, prismaClient = prisma }) {
  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT
       COUNT(*) FILTER (WHERE "status"='PENDING_APPROVAL')::int AS "pendingApproval",
       COUNT(*) FILTER (WHERE "status"='APPROVED')::int AS "approvedAwaitingDisbursement",
       COUNT(*) FILTER (WHERE "status"='ACTIVE')::int AS "activeLoans",
       COUNT(*) FILTER (WHERE "status"='PAUSED')::int AS "pausedLoans",
       COUNT(DISTINCT "employeeId") FILTER (WHERE "status" IN ('ACTIVE','PAUSED'))::int AS "borrowers",
       COALESCE(SUM("outstandingAmount") FILTER (WHERE "status" IN ('ACTIVE','PAUSED')),0) AS "outstandingBalance",
       COALESCE(SUM("principalAmount"),0) AS "totalPrincipal"
     FROM "payroll_loans"
     WHERE "organizationId"=$1`,
    organizationId
  );
  const recoveryRows = await prismaClient.$queryRawUnsafe(
    `SELECT COALESCE(SUM("amount") FILTER (WHERE "status"='POSTED'),0) AS "recoveredAmount"
       FROM "payroll_loan_recoveries"
      WHERE "organizationId"=$1`,
    organizationId
  );
  const row = rows[0] || {};
  return {
    pendingApproval: Number(row.pendingApproval || 0),
    approvedAwaitingDisbursement: Number(row.approvedAwaitingDisbursement || 0),
    activeLoans: Number(row.activeLoans || 0),
    pausedLoans: Number(row.pausedLoans || 0),
    borrowers: Number(row.borrowers || 0),
    outstandingBalance: Number(row.outstandingBalance || 0),
    totalPrincipal: Number(row.totalPrincipal || 0),
    recoveredAmount: Number(recoveryRows[0]?.recoveredAmount || 0),
  };
}

async function createLoan({ organizationId, actorUserId, input, prismaClient = prisma }) {
  const employee = await resolveEmployee(prismaClient, organizationId, input?.employeeNumber);
  const principalAmount = money(input?.principalAmount, "Principal Amount");
  const installmentAmount = money(input?.installmentAmount, "Installment Amount");
  if (installmentAmount > principalAmount) {
    throw loanError("INVALID_LOAN_INSTALLMENT", "Installment Amount cannot exceed Principal Amount.");
  }
  const applicationDate = input?.applicationDate
    ? dateOnly(input.applicationDate, "Application Date")
    : new Date().toISOString().slice(0, 10);
  const parentLoanId = text(input?.parentLoanId) || null;

  if (parentLoanId) {
    const parentRows = await prismaClient.$queryRawUnsafe(
      `SELECT "id","loanNumber","employeeId","status"
         FROM "payroll_loans"
        WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,
      organizationId,
      parentLoanId
    );
    const parent = parentRows[0];
    if (!parent || parent.employeeId !== employee.id) {
      throw loanError("TOPUP_PARENT_INVALID", "Top-up parent loan was not found for this employee.", 404);
    }
    if (!["ACTIVE", "PAUSED"].includes(parent.status)) {
      throw loanError("TOPUP_PARENT_NOT_ACTIVE", "Top-up may only be linked to an Active or Paused loan.", 409);
    }
  }

  const id = crypto.randomUUID();
  const loanNumber = `LN-${employee.employeeNumber}-${id.slice(0, 8).toUpperCase()}`;
  const rows = await prismaClient.$queryRawUnsafe(
    `INSERT INTO "payroll_loans"
      ("id","organizationId","employeeId","loanNumber","principalAmount","outstandingAmount","installmentAmount",
       "applicationDate","status","purpose","notes","parentLoanId","createdByUserId")
     VALUES ($1,$2,$3,$4,$5,$5,$6,$7::date,'PENDING_APPROVAL',$8,$9,$10,$11)
     RETURNING *`,
    id,
    organizationId,
    employee.id,
    loanNumber,
    principalAmount,
    installmentAmount,
    applicationDate,
    text(input?.purpose) || null,
    text(input?.notes) || null,
    parentLoanId,
    actorUserId || null
  );
  const created = mapLoan({
    ...rows[0],
    employeeNumber: employee.employeeNumber,
    employeeName: employeeName(employee),
  });
  await writeAudit(prismaClient, {
    organizationId,
    actorUserId,
    entityId: id,
    action: parentLoanId ? "TOPUP_APPLICATION_CREATED" : "LOAN_APPLICATION_CREATED",
    newValue: created,
    reason: input?.notes || input?.purpose || "Employee loan application created",
  });
  return created;
}

async function decideLoan({ organizationId, actorUserId, loanId, decision, notes, prismaClient = prisma }) {
  const action = text(decision).toUpperCase();
  if (!["APPROVE", "REJECT"].includes(action)) {
    throw loanError("INVALID_LOAN_DECISION", "Decision must be APPROVE or REJECT.");
  }
  const existingRows = await prismaClient.$queryRawUnsafe(
    `SELECT * FROM "payroll_loans" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,
    organizationId,
    loanId
  );
  const existing = existingRows[0];
  if (!existing) throw loanError("LOAN_NOT_FOUND", "Loan not found.", 404);
  if (existing.status !== "PENDING_APPROVAL") {
    throw loanError("INVALID_LOAN_STATE", "Only a pending loan application can be approved or rejected.", 409);
  }
  const nextStatus = action === "APPROVE" ? "APPROVED" : "REJECTED";
  const rows = await prismaClient.$queryRawUnsafe(
    `UPDATE "payroll_loans"
        SET "status"=$3,
            "approvedDate"=CASE WHEN $3='APPROVED' THEN CURRENT_DATE ELSE NULL END,
            "approvedByUserId"=CASE WHEN $3='APPROVED' THEN $4 ELSE NULL END,
            "notes"=CASE WHEN $5::text IS NULL OR $5='' THEN "notes" ELSE $5 END,
            "updatedAt"=CURRENT_TIMESTAMP
      WHERE "organizationId"=$1 AND "id"=$2
      RETURNING *`,
    organizationId,
    loanId,
    nextStatus,
    actorUserId || null,
    text(notes) || null
  );
  const updated = mapLoan(rows[0]);
  await writeAudit(prismaClient, {
    organizationId,
    actorUserId,
    entityId: loanId,
    action: nextStatus === "APPROVED" ? "LOAN_APPROVED" : "LOAN_REJECTED",
    previousValue: mapLoan(existing),
    newValue: updated,
    reason: notes,
  });
  return updated;
}

async function disburseLoan({ organizationId, actorUserId, loanId, input, prismaClient = prisma }) {
  const disbursedDate = dateOnly(input?.disbursedDate, "Disbursed Date");
  const recoveryStartDate = dateOnly(input?.recoveryStartDate, "Recovery Start Date");
  if (recoveryStartDate < disbursedDate) {
    throw loanError("INVALID_RECOVERY_START", "Recovery Start Date cannot be earlier than Disbursed Date.");
  }
  const existingRows = await prismaClient.$queryRawUnsafe(
    `SELECT * FROM "payroll_loans" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,
    organizationId,
    loanId
  );
  const existing = existingRows[0];
  if (!existing) throw loanError("LOAN_NOT_FOUND", "Loan not found.", 404);
  if (existing.status !== "APPROVED") {
    throw loanError("LOAN_NOT_APPROVED", "Only an approved loan can be marked as disbursed.", 409);
  }
  const rows = await prismaClient.$queryRawUnsafe(
    `UPDATE "payroll_loans"
        SET "status"='ACTIVE',"disbursedDate"=$3::date,"recoveryStartDate"=$4::date,
            "notes"=CASE WHEN $5::text IS NULL OR $5='' THEN "notes" ELSE $5 END,
            "updatedAt"=CURRENT_TIMESTAMP
      WHERE "organizationId"=$1 AND "id"=$2
      RETURNING *`,
    organizationId,
    loanId,
    disbursedDate,
    recoveryStartDate,
    text(input?.notes) || null
  );
  const updated = mapLoan(rows[0]);
  await writeAudit(prismaClient, {
    organizationId,
    actorUserId,
    entityId: loanId,
    action: "LOAN_DISBURSED",
    previousValue: mapLoan(existing),
    newValue: updated,
    reason: input?.notes || "Approved loan marked as disbursed and activated for payroll recovery",
  });
  return updated;
}

async function updateLoanStatus({ organizationId, actorUserId, loanId, action, reason, prismaClient = prisma }) {
  const command = text(action).toUpperCase();
  const existingRows = await prismaClient.$queryRawUnsafe(
    `SELECT * FROM "payroll_loans" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,
    organizationId,
    loanId
  );
  const existing = existingRows[0];
  if (!existing) throw loanError("LOAN_NOT_FOUND", "Loan not found.", 404);

  let nextStatus = null;
  if (command === "PAUSE" && existing.status === "ACTIVE") nextStatus = "PAUSED";
  if (command === "RESUME" && existing.status === "PAUSED") nextStatus = "ACTIVE";
  if (command === "CANCEL" && ["PENDING_APPROVAL", "APPROVED", "ACTIVE", "PAUSED"].includes(existing.status)) nextStatus = "CANCELLED";
  if (!nextStatus) {
    throw loanError("INVALID_LOAN_TRANSITION", `Loan cannot perform ${command || "this action"} from ${existing.status}.`, 409);
  }

  const rows = await prismaClient.$queryRawUnsafe(
    `UPDATE "payroll_loans"
        SET "status"=$3,"notes"=CASE WHEN $4::text IS NULL OR $4='' THEN "notes" ELSE $4 END,
            "updatedAt"=CURRENT_TIMESTAMP
      WHERE "organizationId"=$1 AND "id"=$2
      RETURNING *`,
    organizationId,
    loanId,
    nextStatus,
    text(reason) || null
  );
  const updated = mapLoan(rows[0]);
  await writeAudit(prismaClient, {
    organizationId,
    actorUserId,
    entityId: loanId,
    action: `LOAN_${nextStatus}`,
    previousValue: mapLoan(existing),
    newValue: updated,
    reason,
  });
  return updated;
}

async function createTopUp({ organizationId, actorUserId, loanId, input, prismaClient = prisma }) {
  const parentRows = await prismaClient.$queryRawUnsafe(
    `SELECT l."id",l."status",e."employeeNumber"
       FROM "payroll_loans" l
       JOIN "employees" e ON e."id"=l."employeeId" AND e."organizationId"=l."organizationId"
      WHERE l."organizationId"=$1 AND l."id"=$2 LIMIT 1`,
    organizationId,
    loanId
  );
  const parent = parentRows[0];
  if (!parent) throw loanError("LOAN_NOT_FOUND", "Parent loan not found.", 404);
  if (!["ACTIVE", "PAUSED"].includes(parent.status)) {
    throw loanError("TOPUP_PARENT_NOT_ACTIVE", "Top-up may only be requested against an Active or Paused loan.", 409);
  }
  return createLoan({
    organizationId,
    actorUserId,
    prismaClient,
    input: {
      ...input,
      employeeNumber: parent.employeeNumber,
      parentLoanId: parent.id,
    },
  });
}

async function listRecoveries({ organizationId, loanId, prismaClient = prisma }) {
  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT r."id",r."loanId",l."loanNumber",r."employeeId",e."employeeNumber",
            CONCAT_WS(' ',e."firstName",e."middleName",e."lastName") AS "employeeName",
            r."runId",p."code" AS "payrollPeriodCode",r."amount",r."recoveryDate",r."status",r."createdAt"
       FROM "payroll_loan_recoveries" r
       JOIN "payroll_loans" l ON l."id"=r."loanId" AND l."organizationId"=r."organizationId"
       JOIN "employees" e ON e."id"=r."employeeId" AND e."organizationId"=r."organizationId"
       JOIN "payroll_runs" pr ON pr."id"=r."runId" AND pr."organizationId"=r."organizationId"
       JOIN "payroll_periods" p ON p."id"=pr."periodId" AND p."organizationId"=pr."organizationId"
      WHERE r."organizationId"=$1 AND ($2::text IS NULL OR r."loanId"=$2)
      ORDER BY r."recoveryDate" DESC,r."createdAt" DESC`,
    organizationId,
    text(loanId) || null
  );
  return rows.map((row) => ({
    ...row,
    amount: Number(row.amount || 0),
    recoveryDate: row.recoveryDate ? new Date(row.recoveryDate).toISOString().slice(0, 10) : null,
  }));
}

module.exports = {
  loanError,
  listLoans,
  getLoanSummary,
  createLoan,
  decideLoan,
  disburseLoan,
  updateLoanStatus,
  createTopUp,
  listRecoveries,
};
