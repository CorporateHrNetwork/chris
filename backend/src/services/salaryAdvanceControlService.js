const prisma = require("../config/prisma");

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

function mapAdvance(row) {
  return {
    ...row,
    amount: Number(row.amount || 0),
    outstandingAmount: Number(row.outstandingAmount || 0),
    installmentAmount: Number(row.installmentAmount || 0),
    issuedDate: row.issuedDate ? new Date(row.issuedDate).toISOString().slice(0, 10) : null,
    recoveryStartDate: row.recoveryStartDate ? new Date(row.recoveryStartDate).toISOString().slice(0, 10) : null,
  };
}

async function writeAudit(client, { organizationId, actorUserId, advanceId, action, previousValue, newValue, reason }) {
  await client.organizationAudit.create({
    data: {
      organizationId,
      actorUserId: actorUserId || null,
      entityType: "PayrollSalaryAdvance",
      entityId: advanceId,
      action,
      previousValue: previousValue || undefined,
      newValue: newValue || undefined,
      reason: text(reason) || null,
    },
  });
}

async function lockAdvance(tx, organizationId, advanceId) {
  const rows = await tx.$queryRawUnsafe(
    `SELECT pa.*,e."employeeNumber",CONCAT_WS(' ',e."firstName",e."middleName",e."lastName") AS "employeeName"
       FROM "payroll_salary_advances" pa
       JOIN "employees" e ON e."id"=pa."employeeId" AND e."organizationId"=pa."organizationId"
      WHERE pa."organizationId"=$1 AND pa."id"=$2
      FOR UPDATE`,
    organizationId,
    advanceId
  );
  if (!rows[0]) throw controlError("SALARY_ADVANCE_NOT_FOUND", "Salary advance not found.", 404);
  return rows[0];
}

async function cancelSalaryAdvance({ organizationId, actorUserId, advanceId, reason, prismaClient = prisma }) {
  return prismaClient.$transaction(async (tx) => {
    const existing = await lockAdvance(tx, organizationId, advanceId);
    const status = String(existing.status || "");
    if (status === "CANCELLED") return { ...mapAdvance(existing), alreadyCancelled: true };
    if (status === "COMPLETED") {
      throw controlError(
        "SALARY_ADVANCE_COMPLETED_CANNOT_CANCEL",
        "A completed salary advance is historical and cannot be cancelled. It must remain available for audit.",
        409
      );
    }

    const recoveredAmount = Math.max(0, Number(existing.amount || 0) - Number(existing.outstandingAmount || 0));
    const updatedRows = await tx.$queryRawUnsafe(
      `UPDATE "payroll_salary_advances"
          SET "status"='CANCELLED',"updatedAt"=CURRENT_TIMESTAMP
        WHERE "organizationId"=$1 AND "id"=$2
        RETURNING *`,
      organizationId,
      advanceId
    );
    const updated = mapAdvance({
      ...updatedRows[0],
      employeeNumber: existing.employeeNumber,
      employeeName: existing.employeeName,
    });

    await writeAudit(tx, {
      organizationId,
      actorUserId,
      advanceId,
      action: "SALARY_ADVANCE_CANCELLED_BY_SUPER_USER",
      previousValue: mapAdvance(existing),
      newValue: { ...updated, recoveredAmount },
      reason: reason || "Salary advance cancelled by Super User",
    });

    return { ...updated, recoveredAmount, historicalRecoveryPreserved: recoveredAmount > 0 };
  });
}

async function deleteSalaryAdvance({ organizationId, actorUserId, advanceId, reason, prismaClient = prisma }) {
  return prismaClient.$transaction(async (tx) => {
    const existing = await lockAdvance(tx, organizationId, advanceId);
    const recoveredAmount = Math.max(0, Number(existing.amount || 0) - Number(existing.outstandingAmount || 0));

    if (recoveredAmount > 0 || String(existing.status) === "COMPLETED") {
      throw controlError(
        "SALARY_ADVANCE_FINANCIAL_HISTORY_DELETE_BLOCKED",
        "This salary advance already has financial history. Cancel it instead; CHRiS will preserve the historical recovery record.",
        409,
        { recoveredAmount, status: existing.status }
      );
    }

    const previousValue = mapAdvance(existing);
    await writeAudit(tx, {
      organizationId,
      actorUserId,
      advanceId,
      action: "SALARY_ADVANCE_DELETED_BY_SUPER_USER",
      previousValue,
      newValue: { deleted: true },
      reason: reason || "Unused salary advance deleted by Super User",
    });

    await tx.$executeRawUnsafe(
      `DELETE FROM "payroll_salary_advances" WHERE "organizationId"=$1 AND "id"=$2`,
      organizationId,
      advanceId
    );

    return { id: advanceId, deleted: true, previousValue };
  });
}

module.exports = {
  cancelSalaryAdvance,
  deleteSalaryAdvance,
};
