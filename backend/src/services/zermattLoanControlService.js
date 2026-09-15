const prisma = require("../config/prisma");
const { markDraftRunsRecalculationRequired } = require("./payrollDraftFreshnessService");

function controlError(code, message, statusCode = 400, details) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

function text(value) {
  return String(value ?? "").trim();
}

function mapLoan(row) {
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

async function deleteUnusedLoan({ organizationId, actorUserId, loanId, reason, prismaClient = prisma }) {
  return prismaClient.$transaction(async (tx) => {
    const rows = await tx.$queryRawUnsafe(
      `SELECT l.*,e."employeeNumber",CONCAT_WS(' ',e."firstName",e."middleName",e."lastName") AS "employeeName"
         FROM "payroll_loans" l
         JOIN "employees" e ON e."id"=l."employeeId" AND e."organizationId"=l."organizationId"
        WHERE l."organizationId"=$1 AND l."id"=$2
        FOR UPDATE`,
      organizationId,
      loanId
    );
    const existing = rows[0];
    if (!existing) throw controlError("LOAN_NOT_FOUND", "Loan record not found.", 404);

    const recoveryRows = await tx.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS "postedRecoveryCount",COALESCE(SUM("amount"),0) AS "postedRecoveryAmount"
         FROM "payroll_loan_recoveries"
        WHERE "organizationId"=$1 AND "loanId"=$2 AND "status"='POSTED'`,
      organizationId,
      loanId
    );
    const postedRecoveryCount = Number(recoveryRows[0]?.postedRecoveryCount || 0);
    const postedRecoveryAmount = Number(recoveryRows[0]?.postedRecoveryAmount || 0);
    if (postedRecoveryCount > 0 || String(existing.status || "").toUpperCase() === "COMPLETED") {
      throw controlError(
        "LOAN_FINANCIAL_HISTORY_DELETE_BLOCKED",
        "This loan already has payroll recovery/history and cannot be deleted. Preserve it and use an audited status/correction action instead.",
        409,
        { postedRecoveryCount, postedRecoveryAmount, status: existing.status }
      );
    }

    const previousValue = mapLoan(existing);
    await tx.organizationAudit.create({
      data: {
        organizationId,
        actorUserId: actorUserId || null,
        entityType: "PayrollLoan",
        entityId: loanId,
        action: "LOAN_DELETED_BY_HEAD_HR",
        previousValue,
        newValue: { deleted: true },
        reason: text(reason) || "Unused loan record deleted by Head of HR",
      },
    });

    await tx.$executeRawUnsafe(
      `DELETE FROM "payroll_loans" WHERE "organizationId"=$1 AND "id"=$2`,
      organizationId,
      loanId
    );
    await markDraftRunsRecalculationRequired({
      organizationId,
      actorUserId,
      reason: `Unused loan ${existing.loanNumber || loanId} was deleted; draft payroll must be recalculated.`,
      prismaClient: tx,
    });

    return { id: loanId, deleted: true, previousValue };
  });
}

module.exports = { deleteUnusedLoan };