const prisma = require("../config/prisma");
const { markDraftRunsRecalculationRequired } = require("./payrollDraftFreshnessService");
const { splitSalary } = require("./zermattSalarySplit");

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
    amount: Number(row.fullMonthlyGross ?? row.amount ?? 0),
    endMonthGross: row.fullMonthlyGross == null ? null : Number(row.amount || 0),
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
    const amount = positiveMoney(input?.amount ?? existing.fullMonthlyGross ?? existing.amount, "Monthly Gross Salary");
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
      amount !== Number(existing.fullMonthlyGross ?? existing.amount) ||
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

    // A correction changes the authoritative FULL monthly gross, not just
    // the end-month payroll component. Retain both columns consistently.
    // This is in the same audited transaction and cannot alter approved payroll.
    const employee = await tx.employee.findFirst({
      where: { organizationId, id: existing.employeeId },
      select: { employmentType: true, hireDate: true },
    });
    if (!employee?.hireDate || !employee?.employmentType) {
      throw controlError("SALARY_SPLIT_EMPLOYEE_DATA_REQUIRED", "Employee hire date and employment type are required to recalculate salary components.", 422);
    }
    const changedGross = amount !== Number(existing.fullMonthlyGross ?? existing.amount);
    const split = changedGross
      ? splitSalary({
          fullMonthlyGross: amount,
          employmentType: employee.employmentType,
          hireDate: employee.hireDate,
          periodMonth: effectiveFrom.slice(0, 7),
        })
      : null;
    const writeAmount = changedGross ? split.endMonthGross : Number(existing.amount);
    const writeFullGross = changedGross ? split.fullMonthlyGross : existing.fullMonthlyGross;
    // TSP remains a separate Benefits ledger. Protect its submitted/approved/
    // paid periods from silent retroactive salary edits, just like main payroll.
    if (financialChange) {
      const protectedBenefits = await tx.$queryRawUnsafe(
        `SELECT id, "periodMonth", status FROM public.zermatt_midmonth_runs
          WHERE "organizationId"=$1
            AND status IN ('SUBMITTED','APPROVED','PAID')
            AND "periodMonth" <= COALESCE($3::date, DATE '9999-12-31')
            AND ("periodMonth" + INTERVAL '1 month' - INTERVAL '1 day') >= $2::date
          ORDER BY "periodMonth" DESC LIMIT 1`,
        organizationId, effectiveFrom, effectiveTo
      );
      if (protectedBenefits.length) {
        throw controlError(
          "TSP_APPROVED_OR_SUBMITTED_HISTORY_LOCKED",
          "A submitted, approved or paid TSP run falls within this salary period. Preserve the historical amounts and create a new future effective-dated salary record.",
          409, { periodMonth: protectedBenefits[0].periodMonth, status: protectedBenefits[0].status }
        );
      }
    }

    const rows = await tx.$queryRawUnsafe(
      `UPDATE "payroll_salary_rates"
          SET "amount"=$3, "fullMonthlyGross"=$4, "currency"=$5,
              "effectiveFrom"=$6::date, "effectiveTo"=$7::date,
              "reason"=$8, "updatedAt"=CURRENT_TIMESTAMP
        WHERE "organizationId"=$1 AND "id"=$2
        RETURNING *`,
      organizationId, rateId, writeAmount, writeFullGross,
      currency, effectiveFrom, effectiveTo, reason || null
    );
    const updated = mapRate({ ...rows[0], employeeNumber: existing.employeeNumber, employeeName: existing.employeeName });
    // If an unactivated Benefits preparation exists for this exact salary
    // effective month, update its full-gross basis and allocation at the same
    // time. Activated preparations are immutable; the TSP source resolver
    // prefers the updated authoritative salary rate for an equal effective date.
    if (changedGross) {
      const unactivated = await tx.$queryRawUnsafe(
        `SELECT id, "allocationPreview" FROM public.zermatt_salary_split_preparations
          WHERE "organizationId"=$1 AND "employeeId"=$2
            AND "effectiveFrom"=$3::date AND "activatedAt" IS NULL
          FOR UPDATE`,
        organizationId, existing.employeeId, effectiveFrom
      );
      for (const basis of unactivated) {
        const override = basis.allocationPreview?.tspPercentageOverride;
        const allocation = { ...split };
        if (override != null) allocation.tspPercentageOverride = override;
        await tx.$executeRawUnsafe(
          `UPDATE public.zermatt_salary_split_preparations
            SET "fullMonthlyGross"=$3, "allocationPreview"=$4::jsonb,
              reason=$5
            WHERE "organizationId"=$1 AND id=$2 AND "activatedAt" IS NULL`,
          organizationId, basis.id, amount, JSON.stringify(allocation),
          "Updated by unified onboarding salary correction: " + reason
        );
      }
    }
    await audit(tx, {
      organizationId,
      actorUserId,
      rateId,
      action: "SALARY_RATE_CORRECTED_BY_HR",
      previousValue: previous,
      newValue: updated,
      reason: reason || "Salary rate corrected by authorized HR user",
    });
    if (financialChange) {
      await tx.organizationAudit.create({
        data: {
          organizationId, actorUserId: actorUserId || null,
          entityType: "TransportBenefitSalaryBasis",
          entityId: existing.employeeId,
          action: "TSP_SALARY_BASIS_UPDATED_REGENERATE_DRAFT",
          previousValue: { fullMonthlyGross: previous.amount },
          newValue: {
            fullMonthlyGross: amount,
            endMonthGross: writeAmount,
            normalMidMonth: split?.normalMidMonth ?? null,
            effectiveFrom,
            sourceSalaryRateId: rateId,
            status: "RECALCULATION_REQUIRED",
          },
          reason: "Unified salary correction updated TSP basis. Existing TSP draft must be regenerated; no payment was approved.",
        },
      });
    }
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
