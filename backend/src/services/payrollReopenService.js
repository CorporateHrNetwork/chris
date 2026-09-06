const crypto = require("crypto");
const prisma = require("../config/prisma");

function reopenError(code, message, statusCode = 400, details) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.details = details;
  return error;
}
function text(value) { return String(value ?? "").trim(); }
function money(value) { return Math.round(Number(value || 0) * 100) / 100; }

async function writeAudit(client, { organizationId, actorUserId, entityId, action, previousValue, newValue, reason }) {
  await client.organizationAudit.create({
    data: {
      organizationId,
      actorUserId: actorUserId || null,
      entityType: "PayrollRun",
      entityId,
      action,
      previousValue: previousValue || undefined,
      newValue: newValue || undefined,
      reason: text(reason) || null,
    },
  });
}

async function reopenApprovedPayroll({ organizationId, actorUserId, runId, reason, prismaClient = prisma }) {
  const explanation = text(reason);
  if (!explanation) throw reopenError("PAYROLL_REOPEN_REASON_REQUIRED", "A reason is required before an approved payroll can be reopened.");

  return prismaClient.$transaction(async (tx) => {
    const runRows = await tx.$queryRawUnsafe(
      `SELECT pr."id",pr."periodId",pr."status",pr."employeeCount",pr."grossTotal",pr."deductionTotal",pr."netPreviewTotal",
              pr."approvedAt",pr."approvedByUserId",pp."code" AS "periodCode",pp."status" AS "periodStatus"
         FROM "payroll_runs" pr
         JOIN "payroll_periods" pp ON pp."id"=pr."periodId" AND pp."organizationId"=pr."organizationId"
        WHERE pr."organizationId"=$1 AND pr."id"=$2
        FOR UPDATE OF pr`,
      organizationId,
      runId
    );
    const run = runRows[0];
    if (!run) throw reopenError("PAYROLL_RUN_NOT_FOUND", "Payroll run not found.", 404);
    if (run.status !== "APPROVED") throw reopenError("PAYROLL_RUN_NOT_APPROVED", "Only an approved payroll run can be reopened for correction.", 409);
    if (run.periodStatus === "CLOSED") throw reopenError("PAYROLL_PERIOD_CLOSED", "A payroll in a closed period cannot be reopened. Use a future adjustment payroll instead.", 409);

    const loanRecoveries = await tx.$queryRawUnsafe(
      `SELECT "id","loanId","amount","status"
         FROM "payroll_loan_recoveries"
        WHERE "organizationId"=$1 AND "runId"=$2 AND "status"='POSTED'
        FOR UPDATE`,
      organizationId,
      runId
    );

    for (const recovery of loanRecoveries) {
      const amount = money(recovery.amount);
      await tx.$executeRawUnsafe(
        `UPDATE "payroll_loans"
            SET "outstandingAmount"=LEAST("principalAmount","outstandingAmount"+$3),
                "status"=CASE WHEN "status"='COMPLETED' THEN 'ACTIVE' ELSE "status" END,
                "updatedAt"=CURRENT_TIMESTAMP
          WHERE "organizationId"=$1 AND "id"=$2`,
        organizationId,
        recovery.loanId,
        amount
      );
      await tx.$executeRawUnsafe(
        `UPDATE "payroll_loan_recoveries" SET "status"='REVERSED' WHERE "organizationId"=$1 AND "id"=$2`,
        organizationId,
        recovery.id
      );
    }

    const lineRows = await tx.$queryRawUnsafe(
      `SELECT "id","details" FROM "payroll_run_lines" WHERE "organizationId"=$1 AND "runId"=$2`,
      organizationId,
      runId
    );
    let salaryAdvanceRecoveriesReversed = 0;
    let salaryAdvanceAmountRestored = 0;
    for (const line of lineRows) {
      const recoveries = Array.isArray(line.details?.salaryAdvanceRecoveries) ? line.details.salaryAdvanceRecoveries : [];
      for (const recovery of recoveries) {
        const amount = money(recovery.value);
        if (!recovery.id || amount <= 0) continue;
        const changed = await tx.$executeRawUnsafe(
          `UPDATE "payroll_salary_advances"
              SET "outstandingAmount"=LEAST("amount","outstandingAmount"+$3),
                  "status"=CASE WHEN "status"='COMPLETED' THEN 'ACTIVE' ELSE "status" END,
                  "updatedAt"=CURRENT_TIMESTAMP
            WHERE "organizationId"=$1 AND "id"=$2`,
          organizationId,
          recovery.id,
          amount
        );
        if (Number(changed || 0) > 0) {
          salaryAdvanceRecoveriesReversed += 1;
          salaryAdvanceAmountRestored = money(salaryAdvanceAmountRestored + amount);
        }
      }
    }

    await tx.$executeRawUnsafe(
      `UPDATE "payroll_runs"
          SET "status"='DRAFT',
              "statutoryStatus"='RECALCULATION_REQUIRED',
              "submittedByUserId"=NULL,
              "submittedAt"=NULL,
              "approvedByUserId"=NULL,
              "approvedAt"=NULL,
              "updatedAt"=CURRENT_TIMESTAMP
        WHERE "organizationId"=$1 AND "id"=$2`,
      organizationId,
      runId
    );

    await tx.$executeRawUnsafe(
      `INSERT INTO "payroll_approvals" ("id","organizationId","runId","action","actorUserId","notes")
       VALUES ($1,$2,$3,'REOPENED_FOR_CORRECTION',$4,$5)`,
      crypto.randomUUID(),
      organizationId,
      runId,
      actorUserId || null,
      explanation
    );

    const newValue = {
      status: "DRAFT",
      statutoryStatus: "RECALCULATION_REQUIRED",
      loanRecoveriesReversed: loanRecoveries.length,
      loanRecoveryAmountRestored: money(loanRecoveries.reduce((sum, row) => sum + Number(row.amount || 0), 0)),
      salaryAdvanceRecoveriesReversed,
      salaryAdvanceAmountRestored,
      payslipControl: "APPROVED_PAYSLIP_SUPERSEDED_UNTIL_REAPPROVAL",
    };
    await writeAudit(tx, {
      organizationId,
      actorUserId,
      entityId: runId,
      action: "APPROVED_PAYROLL_REOPENED_FOR_CORRECTION",
      previousValue: {
        status: run.status,
        periodCode: run.periodCode,
        approvedAt: run.approvedAt,
        approvedByUserId: run.approvedByUserId,
        grossTotal: money(run.grossTotal),
        deductionTotal: money(run.deductionTotal),
        netPreviewTotal: money(run.netPreviewTotal),
      },
      newValue,
      reason: explanation,
    });

    return {
      runId,
      periodCode: run.periodCode,
      status: "DRAFT",
      statutoryStatus: "RECALCULATION_REQUIRED",
      reason: explanation,
      ...newValue,
      control: "Reopened payroll must be recalculated, submitted and approved again. Loan and Salary Advance balances were restored from the original approved run; historical recovery rows were reversed rather than deleted.",
    };
  });
}

module.exports = { reopenApprovedPayroll };
