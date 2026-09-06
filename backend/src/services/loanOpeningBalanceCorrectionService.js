const prisma = require("../config/prisma");

function correctionError(code, message, statusCode = 400, details) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

function sourceReferenceFromNotes(notes) {
  const match = String(notes || "").match(/Source Reference:\s*([^|\n]+)/i);
  return match ? match[1].trim() : "";
}

function dateText(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}

function money(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function buildCorrectionPlan({ rows, existingLoans, postedRecoveryCounts = new Map() }) {
  const existingBySource = new Map();
  for (const loan of existingLoans || []) {
    const sourceReference = sourceReferenceFromNotes(loan.notes);
    if (!sourceReference) continue;
    const key = sourceReference.toUpperCase();
    if (!existingBySource.has(key)) existingBySource.set(key, []);
    existingBySource.get(key).push(loan);
  }

  return (rows || []).map((row) => {
    const errors = [...(row.errors || [])];
    const warnings = [...(row.warnings || [])];
    const input = row.input;
    const sourceReference = String(input?.sourceReference || row.display?.sourceReference || "").trim();
    const matches = sourceReference ? (existingBySource.get(sourceReference.toUpperCase()) || []) : [];
    const loan = matches.length === 1 ? matches[0] : null;

    if (!sourceReference) errors.push("Source Reference is required for an opening-balance correction.");
    if (sourceReference && matches.length === 0) errors.push("No previously imported CHRiS loan matches this Source Reference.");
    if (matches.length > 1) errors.push("Source Reference matches more than one existing loan; correction is blocked until the duplicate is resolved.");

    if (loan && input) {
      const identityChecks = [
        [String(loan.employeeId), String(input.employeeId), "Employee"],
        [String(loan.purpose || ""), String(input.purpose || ""), "Loan Type"],
        [money(loan.principalAmount), money(input.principalAmount), "Principal Amount"],
        [money(loan.installmentAmount), money(input.installmentAmount), "Monthly Installment"],
        [dateText(loan.applicationDate), String(input.applicationDate || ""), "Application Date"],
        [dateText(loan.disbursedDate), String(input.disbursedDate || ""), "Disbursed Date"],
        [dateText(loan.recoveryStartDate), String(input.recoveryStartDate || ""), "Recovery Start Date"],
      ];
      for (const [existingValue, correctedValue, label] of identityChecks) {
        if (String(existingValue) !== String(correctedValue)) {
          errors.push(`${label} differs from the already imported loan. Opening-balance correction may change balances only.`);
        }
      }

      const postedRecoveries = Number(postedRecoveryCounts.get(loan.id) || 0);
      if (postedRecoveries > 0) {
        errors.push("A CHRiS approved-payroll loan recovery has already posted. Opening balance can no longer be replaced through bulk correction.");
      }
      if (!["ACTIVE", "PAUSED", "COMPLETED"].includes(String(loan.status || ""))) {
        errors.push(`Existing loan status ${loan.status || "(blank)"} is not eligible for opening-balance correction.`);
      }
    }

    const oldOutstanding = loan ? money(loan.outstandingAmount) : null;
    const newOutstanding = input ? money(input.outstandingAmount) : null;
    const principalAmount = input ? money(input.principalAmount) : (loan ? money(loan.principalAmount) : null);
    const oldRecovered = loan ? money(principalAmount - oldOutstanding) : null;
    const newRecovered = input ? money(principalAmount - newOutstanding) : null;
    const changed = Boolean(loan && input && errors.length === 0 && Math.abs(oldOutstanding - newOutstanding) > 0.009);
    const noChange = Boolean(loan && input && errors.length === 0 && !changed);

    return {
      rowNumber: row.rowNumber,
      valid: errors.length === 0,
      action: errors.length ? "BLOCKED" : changed ? "CORRECT" : "NO_CHANGE",
      errors,
      warnings,
      loanId: loan?.id || null,
      loanNumber: loan?.loanNumber || null,
      sourceReference: sourceReference || null,
      employeeNumber: input?.employeeNumber || row.display?.employeeNumber || "",
      employeeName: input?.employeeName || row.display?.employeeName || "",
      oldOutstanding,
      newOutstanding,
      oldRecovered,
      newRecovered,
      existingStatus: loan?.status || null,
      targetStatus: input?.outstandingAmount === 0 ? "COMPLETED" : (loan?.status === "PAUSED" ? "PAUSED" : "ACTIVE"),
      changed,
      noChange,
    };
  });
}

async function prepareOpeningBalanceCorrections({ organizationId, rows, prismaClient = prisma }) {
  const existingLoans = await prismaClient.$queryRawUnsafe(
    `SELECT "id","loanNumber","employeeId","purpose","principalAmount","outstandingAmount","installmentAmount",
            "applicationDate","disbursedDate","recoveryStartDate","status","notes"
       FROM "payroll_loans"
      WHERE "organizationId"=$1`,
    organizationId
  );
  const recoveryRows = await prismaClient.$queryRawUnsafe(
    `SELECT "loanId", COUNT(*)::int AS "count"
       FROM "payroll_loan_recoveries"
      WHERE "organizationId"=$1 AND "status"='POSTED'
      GROUP BY "loanId"`,
    organizationId
  );
  const postedRecoveryCounts = new Map(recoveryRows.map((row) => [row.loanId, Number(row.count || 0)]));
  return buildCorrectionPlan({ rows, existingLoans, postedRecoveryCounts });
}

async function applyOpeningBalanceCorrections({ organizationId, actorUserId, plan, prismaClient = prisma }) {
  if (!Array.isArray(plan) || !plan.length) throw correctionError("NO_LOAN_CORRECTION_ROWS", "There are no correction rows to apply.");
  const blocked = plan.filter((row) => !row.valid || row.action === "BLOCKED");
  if (blocked.length) {
    throw correctionError("LOAN_OPENING_CORRECTION_BLOCKED", "Opening-balance correction is blocked until every row passes validation.", 409, {
      blockedRows: blocked.map((row) => ({ rowNumber: row.rowNumber, errors: row.errors })),
    });
  }

  const corrections = plan.filter((row) => row.action === "CORRECT");
  return prismaClient.$transaction(async (tx) => {
    const applied = [];
    for (const row of corrections) {
      const recoveryCheck = await tx.$queryRawUnsafe(
        `SELECT COUNT(*)::int AS "count"
           FROM "payroll_loan_recoveries"
          WHERE "organizationId"=$1 AND "loanId"=$2 AND "status"='POSTED'`,
        organizationId,
        row.loanId
      );
      if (Number(recoveryCheck[0]?.count || 0) > 0) {
        throw correctionError("LOAN_RECOVERY_HISTORY_LOCKED", `Loan ${row.loanNumber} received an approved-payroll recovery after preview. Revalidate before correcting.`, 409);
      }

      const currentRows = await tx.$queryRawUnsafe(
        `SELECT "outstandingAmount","principalAmount","status"
           FROM "payroll_loans"
          WHERE "organizationId"=$1 AND "id"=$2
          FOR UPDATE`,
        organizationId,
        row.loanId
      );
      const current = currentRows[0];
      if (!current) throw correctionError("LOAN_NOT_FOUND", `Loan ${row.loanNumber} is no longer available.`, 404);
      const currentOutstanding = money(current.outstandingAmount);
      if (Math.abs(currentOutstanding - money(row.oldOutstanding)) > 0.009) {
        throw correctionError("LOAN_OPENING_BALANCE_CHANGED", `Loan ${row.loanNumber} changed after preview. Revalidate the workbook before correcting.`, 409);
      }

      const targetStatus = money(row.newOutstanding) === 0 ? "COMPLETED" : (current.status === "PAUSED" ? "PAUSED" : "ACTIVE");
      await tx.$executeRawUnsafe(
        `UPDATE "payroll_loans"
            SET "outstandingAmount"=$1,"status"=$2,"updatedAt"=NOW()
          WHERE "organizationId"=$3 AND "id"=$4`,
        money(row.newOutstanding),
        targetStatus,
        organizationId,
        row.loanId
      );

      await tx.organizationAudit.create({
        data: {
          organizationId,
          actorUserId: actorUserId || null,
          entityType: "PayrollLoan",
          entityId: row.loanId,
          action: "LOAN_OPENING_BALANCE_CORRECTED",
          oldValue: {
            outstandingAmount: money(row.oldOutstanding),
            openingRecoveredAmount: money(row.oldRecovered),
            status: current.status,
          },
          newValue: {
            outstandingAmount: money(row.newOutstanding),
            openingRecoveredAmount: money(row.newRecovered),
            status: targetStatus,
            sourceReference: row.sourceReference,
          },
          reason: "Controlled correction of imported opening loan balance before any CHRiS approved-payroll recovery",
        },
      });

      applied.push({
        rowNumber: row.rowNumber,
        loanId: row.loanId,
        loanNumber: row.loanNumber,
        employeeNumber: row.employeeNumber,
        sourceReference: row.sourceReference,
        oldOutstanding: money(row.oldOutstanding),
        newOutstanding: money(row.newOutstanding),
        oldRecovered: money(row.oldRecovered),
        newRecovered: money(row.newRecovered),
        status: targetStatus,
      });
    }
    return {
      applied,
      corrected: applied.length,
      unchanged: plan.filter((row) => row.action === "NO_CHANGE").length,
      total: plan.length,
    };
  });
}

module.exports = {
  sourceReferenceFromNotes,
  buildCorrectionPlan,
  prepareOpeningBalanceCorrections,
  applyOpeningBalanceCorrections,
};
