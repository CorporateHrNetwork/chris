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

function dateOnly(value, label) {
  const raw = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw controlError("INVALID_DATE", `${label} must use YYYY-MM-DD.`);
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) {
    throw controlError("INVALID_DATE", `${label} is not a valid date.`);
  }
  return raw;
}

function positiveMoney(value, label) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) throw controlError("INVALID_AMOUNT", `${label} must be greater than zero.`);
  return Math.round(amount * 100) / 100;
}

function mapRate(row) {
  return {
    ...row,
    amount: Number(row.amount || 0),
    effectiveFrom: row.effectiveFrom ? new Date(row.effectiveFrom).toISOString().slice(0, 10) : null,
    effectiveTo: row.effectiveTo ? new Date(row.effectiveTo).toISOString().slice(0, 10) : null,
  };
}

async function lockRate(tx, organizationId, rateId) {
  const rows = await tx.$queryRawUnsafe(
    `SELECT sr.*,e."employeeNumber",CONCAT_WS(' ',e."firstName",e."middleName",e."lastName") AS "employeeName"
       FROM "payroll_salary_rates" sr
       JOIN "employees" e ON e."id"=sr."employeeId" AND e."organizationId"=sr."organizationId"
      WHERE sr."organizationId"=$1 AND sr."id"=$2
      FOR UPDATE`,
    organizationId,
    rateId
  );
  if (!rows[0]) throw controlError("SALARY_RATE_NOT_FOUND", "Salary rate not found.", 404);
  return rows[0];
}

async function approvedPayrollUse(tx, organizationId, employeeId, effectiveFrom, effectiveTo) {
  const rows = await tx.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS "approvedCount",MAX(pp."periodEnd") AS "latestApprovedPeriodEnd"
       FROM "payroll_run_lines" pl
       JOIN "payroll_runs" pr ON pr."id"=pl."runId" AND pr."organizationId"=pl."organizationId"
       JOIN "payroll_periods" pp ON pp."id"=pr."periodId" AND pp."organizationId"=pr."organizationId"
      WHERE pl."organizationId"=$1
        AND pl."employeeId"=$2
        AND pr."status"='APPROVED'
        AND pp."periodStart" <= COALESCE($4::date, DATE '9999-12-31')
        AND pp."periodEnd" >= $3::date`,
    organizationId,
    employeeId,
    effectiveFrom,
    effectiveTo || null
  );
  return {
    approvedCount: Number(rows[0]?.approvedCount || 0),
    latestApprovedPeriodEnd: rows[0]?.latestApprovedPeriodEnd
      ? new Date(rows[0].latestApprovedPeriodEnd).toISOString().slice(0, 10)
      : null,
  };
}

async function audit(tx, { organizationId, actorUserId, rateId, action, previousValue, newValue, reason }) {
  await tx.organizationAudit.create({
    data: {
      organizationId,
      actorUserId: actorUserId || null,
      entityType: "PayrollSalaryRate",
      entityId: rateId,
      action,
      previousValue: previousValue || undefined,
      newValue: newValue || undefined,
      reason: text(reason) || null,
    },
  });
}

async function updateSalaryRate({ organizationId, actorUserId, rateId, input, prismaClient = prisma }) {
  return prismaClient.$transaction(async (tx) => {
    const existing = await lockRate(tx, organizationId, rateId);
    if (String(existing.status || "").toUpperCase() === "RETIRED") {
      throw controlError("SALARY_RATE_RETIRED_LOCKED", "Retired salary rates are historical records and cannot be edited.", 409);
    }

    const previous = mapRate(existing);
    const amount = positiveMoney(input?.amount ?? existing.amount, "Monthly Gross Salary");
    const currency = text(input?.currency ?? existing.currency ?? "NGN").toUpperCase();
    const effectiveFrom = dateOnly(
      input?.effectiveFrom || new Date(existing.effectiveFrom).toISOString().slice(0, 10),
      "Effective From"
    );
    const effectiveTo = input?.effectiveTo === "" || input?.effectiveTo === null
      ? null
      : input?.effectiveTo
        ? dateOnly(input.effectiveTo, "Effective To")
        : existing.effectiveTo
          ? new Date(existing.effectiveTo).toISOString().slice(0, 10)
          : null;
    const reason = text(input?.reason ?? existing.reason);
    if (effectiveTo && effectiveTo < effectiveFrom) {
      throw controlError("INVALID_SALARY_RATE_DATES", "Effective To cannot be earlier than Effective From.");
    }

    const history = await approvedPayrollUse(
      tx,
      organizationId,
      existing.employeeId,
      previous.effectiveFrom,
      previous.effectiveTo
    );
    const financialChange =
      amount !== Number(existing.amount) ||
      currency !== String(existing.currency || "NGN").toUpperCase() ||
      effectiveFrom !== previous.effectiveFrom ||
      effectiveTo !== previous.effectiveTo;
    if (history.approvedCount > 0 && financialChange) {
      throw controlError(
        "SALARY_RATE_APPROVED_PAYROLL_HISTORY_LOCKED",
        "This salary rate has already supported approved payroll. Preserve the historical rate and create a new effective-dated salary rate for the correction/change.",
        409,
        history
      );
    }

    const overlapRows = await tx.$queryRawUnsafe(
      `SELECT "id" FROM "payroll_salary_rates"
        WHERE "organizationId"=$1 AND "employeeId"=$2 AND "id"<>$3 AND "status"='ACTIVE'
          AND "effectiveFrom" <= COALESCE($5::date, DATE '9999-12-31')
          AND COALESCE("effectiveTo", DATE '9999-12-31') >= $4::date
        LIMIT 1`,
      organizationId,
      existing.employeeId,
      rateId,
      effectiveFrom,
      effectiveTo
    );
    if (overlapRows[0]) {
      throw controlError("SALARY_RATE_OVERLAP", "The edited effective period overlaps another active salary rate for this employee.", 409);
    }

    const rows = await tx.$queryRawUnsafe(
      `UPDATE "payroll_salary_rates"
          SET "amount"=$3,"currency"=$4,"effectiveFrom"=$5::date,"effectiveTo"=$6::date,
              "reason"=$7,"updatedAt"=CURRENT_TIMESTAMP
        WHERE "organizationId"=$1 AND "id"=$2
        RETURNING *`,
      organizationId,
      rateId,
      amount,
      currency,
      effectiveFrom,
      effectiveTo,
      reason || null
    );
    const updated = mapRate({ ...rows[0], employeeNumber: existing.employeeNumber, employeeName: existing.employeeName });
    await audit(tx, {
      organizationId,
      actorUserId,
      rateId,
      action: "SALARY_RATE_CORRECTED_BY_HR",
      previousValue: previous,
      newValue: updated,
      reason: reason || "Salary rate corrected by authorized HR user",
    });
    await markDraftRunsRecalculationRequired({
      organizationId,
      actorUserId,
      reason: `Salary rate ${rateId} was edited; draft payroll must be recalculated.`,
      prismaClient: tx,
    });
    return { ...updated, approvedPayrollHistoryLocked: false };
  });
}

async function deleteUnusedSalaryRate({ organizationId, actorUserId, rateId, reason, prismaClient = prisma }) {
  return prismaClient.$transaction(async (tx) => {
    const existing = await lockRate(tx, organizationId, rateId);
    const previous = mapRate(existing);
    const history = await approvedPayrollUse(
      tx,
      organizationId,
      existing.employeeId,
      previous.effectiveFrom,
      previous.effectiveTo
    );
    if (history.approvedCount > 0) {
      throw controlError(
        "SALARY_RATE_FINANCIAL_HISTORY_DELETE_BLOCKED",
        "This salary rate has already supported approved payroll and cannot be deleted. Retire/end-date it and create a new effective-dated rate instead.",
        409,
        history
      );
    }

    await audit(tx, {
      organizationId,
      actorUserId,
      rateId,
      action: "SALARY_RATE_DELETED_BY_HEAD_HR",
      previousValue: previous,
      newValue: { deleted: true },
      reason: reason || "Unused salary rate deleted by Head of HR",
    });
    await tx.$executeRawUnsafe(
      `DELETE FROM "payroll_salary_rates" WHERE "organizationId"=$1 AND "id"=$2`,
      organizationId,
      rateId
    );
    await markDraftRunsRecalculationRequired({
      organizationId,
      actorUserId,
      reason: `Unused salary rate ${rateId} was deleted; draft payroll must be recalculated.`,
      prismaClient: tx,
    });
    return { id: rateId, deleted: true, previousValue: previous };
  });
}

module.exports = {
  updateSalaryRate,
  deleteUnusedSalaryRate,
};