const prisma = require("../config/prisma");

function error(code, message, statusCode = 400, details) {
  const value = new Error(message);
  value.code = code;
  value.statusCode = statusCode;
  value.details = details;
  return value;
}

function text(value) {
  return String(value ?? "").trim();
}

function money(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw error("INVALID_FINANCIAL_AMOUNT", `${label} must be greater than zero.`);
  }
  return Math.round(number * 100) / 100;
}

function dateOnly(value, label) {
  const raw = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw error("INVALID_DATE", `${label} must use YYYY-MM-DD.`);
  }
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) {
    throw error("INVALID_DATE", `${label} is not a valid date.`);
  }
  return raw;
}

async function employee(client, organizationId, employeeNumber) {
  const normalized = text(employeeNumber).toUpperCase();
  if (!normalized) throw error("EMPLOYEE_REQUIRED", "Employee is required.");
  const row = await client.employee.findFirst({
    where: { organizationId, employeeNumber: normalized },
    select: { id: true, employeeNumber: true, firstName: true, middleName: true, lastName: true },
  });
  if (!row) throw error("EMPLOYEE_NOT_FOUND", `Employee ${normalized} was not found.`, 404);
  return row;
}

function employeeName(row) {
  return [row.firstName, row.middleName, row.lastName].filter(Boolean).join(" ");
}

async function audit(client, { organizationId, actorUserId, entityType, entityId, action, previousValue, newValue, reason }) {
  await client.organizationAudit.create({
    data: {
      organizationId,
      actorUserId: actorUserId || null,
      entityType,
      entityId,
      action,
      previousValue: previousValue || undefined,
      newValue: newValue || undefined,
      reason: text(reason) || null,
    },
  });
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

async function updateSalaryAdvance({ organizationId, actorUserId, advanceId, input, prismaClient = prisma }) {
  return prismaClient.$transaction(async (tx) => {
    const rows = await tx.$queryRawUnsafe(
      `SELECT pa.*,e."employeeNumber",CONCAT_WS(' ',e."firstName",e."middleName",e."lastName") AS "employeeName"
         FROM "payroll_salary_advances" pa
         JOIN "employees" e ON e."id"=pa."employeeId" AND e."organizationId"=pa."organizationId"
        WHERE pa."organizationId"=$1 AND pa."id"=$2
        FOR UPDATE`,
      organizationId,
      advanceId
    );
    const existing = rows[0];
    if (!existing) throw error("SALARY_ADVANCE_NOT_FOUND", "Salary advance not found.", 404);
    if (String(existing.status) === "COMPLETED") {
      throw error("SALARY_ADVANCE_CLOSED_RECORD_LOCKED", "Completed salary advances are historical records and cannot be edited. Record a new correcting advance if required.", 409);
    }

    const original = mapAdvance(existing);
    const recoveredAmount = Math.max(0, Number(existing.amount || 0) - Number(existing.outstandingAmount || 0));
    const financialHistoryLocked = recoveredAmount > 0;

    const requestedEmployeeNumber = text(input?.employeeNumber || existing.employeeNumber).toUpperCase();
    const requestedAmount = money(input?.amount ?? existing.amount, "Advance Amount");
    const requestedInstallment = money(input?.installmentAmount ?? existing.installmentAmount, "Installment Amount");
    const requestedIssuedDate = dateOnly(input?.issuedDate || new Date(existing.issuedDate).toISOString().slice(0, 10), "Issued Date");
    const requestedRecoveryStart = dateOnly(input?.recoveryStartDate || new Date(existing.recoveryStartDate).toISOString().slice(0, 10), "Recovery Start Date");
    const requestedReason = text(input?.reason);

    if (requestedRecoveryStart < requestedIssuedDate) {
      throw error("INVALID_RECOVERY_START", "Recovery Start Date cannot be earlier than Issued Date.");
    }

    if (financialHistoryLocked) {
      const changesHistoricalIdentity =
        requestedEmployeeNumber !== String(existing.employeeNumber).toUpperCase() ||
        requestedAmount !== Number(existing.amount) ||
        requestedIssuedDate !== new Date(existing.issuedDate).toISOString().slice(0, 10);
      if (changesHistoricalIdentity) {
        throw error(
          "SALARY_ADVANCE_FINANCIAL_HISTORY_LOCKED",
          "Employee, Advance Amount and Issued Date cannot be changed after a posted payroll recovery. Create a correcting/new advance instead.",
          409,
          { recoveredAmount }
        );
      }
    }

    const targetEmployee = requestedEmployeeNumber === String(existing.employeeNumber).toUpperCase()
      ? { id: existing.employeeId, employeeNumber: existing.employeeNumber, firstName: "", middleName: "", lastName: "" }
      : await employee(tx, organizationId, requestedEmployeeNumber);

    const maximumInstallment = financialHistoryLocked ? Number(existing.outstandingAmount || 0) : requestedAmount;
    if (requestedInstallment > maximumInstallment) {
      throw error("INVALID_ADVANCE_INSTALLMENT", `Installment Amount cannot exceed ${financialHistoryLocked ? "the outstanding balance" : "the advance amount"}.`);
    }

    const nextOutstanding = financialHistoryLocked ? Number(existing.outstandingAmount) : requestedAmount;
    const updatedRows = await tx.$queryRawUnsafe(
      `UPDATE "payroll_salary_advances"
          SET "employeeId"=$3,"amount"=$4,"outstandingAmount"=$5,"installmentAmount"=$6,
              "issuedDate"=$7::date,"recoveryStartDate"=$8::date,"reason"=$9,"updatedAt"=CURRENT_TIMESTAMP
        WHERE "organizationId"=$1 AND "id"=$2
        RETURNING *`,
      organizationId,
      advanceId,
      targetEmployee.id,
      requestedAmount,
      nextOutstanding,
      requestedInstallment,
      requestedIssuedDate,
      requestedRecoveryStart,
      requestedReason || null
    );

    const currentEmployee = requestedEmployeeNumber === String(existing.employeeNumber).toUpperCase()
      ? { employeeNumber: existing.employeeNumber, name: existing.employeeName }
      : { employeeNumber: targetEmployee.employeeNumber, name: employeeName(targetEmployee) };
    const updated = mapAdvance({ ...updatedRows[0], employeeNumber: currentEmployee.employeeNumber, employeeName: currentEmployee.name });

    await audit(tx, {
      organizationId,
      actorUserId,
      entityType: "PayrollSalaryAdvance",
      entityId: advanceId,
      action: "SALARY_ADVANCE_UPDATED",
      previousValue: original,
      newValue: updated,
      reason: requestedReason || "Salary advance record edited",
    });

    return { ...updated, recoveredAmount, financialHistoryLocked };
  });
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

async function updateLoan({ organizationId, actorUserId, loanId, input, prismaClient = prisma }) {
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
    if (!existing) throw error("LOAN_NOT_FOUND", "Loan not found.", 404);

    const recoveryRows = await tx.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS "postedRecoveryCount",COALESCE(SUM("amount"),0) AS "postedRecoveryAmount"
         FROM "payroll_loan_recoveries"
        WHERE "organizationId"=$1 AND "loanId"=$2 AND "status"='POSTED'`,
      organizationId,
      loanId
    );
    const postedRecoveryCount = Number(recoveryRows[0]?.postedRecoveryCount || 0);
    const postedRecoveryAmount = Number(recoveryRows[0]?.postedRecoveryAmount || 0);
    const disbursed = Boolean(existing.disbursedDate) || ["ACTIVE", "PAUSED", "COMPLETED"].includes(String(existing.status));
    const financialHistoryLocked = disbursed || postedRecoveryCount > 0;

    if (["REJECTED", "CANCELLED", "COMPLETED"].includes(String(existing.status))) {
      const onlyNotesChanged = ["employeeNumber", "principalAmount", "installmentAmount", "applicationDate", "recoveryStartDate", "purpose"]
        .every((key) => input?.[key] === undefined);
      if (!onlyNotesChanged) {
        throw error("LOAN_CLOSED_RECORD_LOCKED", "Closed loan records preserve their financial history. Only Notes may be amended.", 409);
      }
    }

    const requestedEmployeeNumber = text(input?.employeeNumber || existing.employeeNumber).toUpperCase();
    const requestedPrincipal = money(input?.principalAmount ?? existing.principalAmount, "Principal Amount");
    const requestedInstallment = money(input?.installmentAmount ?? existing.installmentAmount, "Installment Amount");
    const requestedApplicationDate = dateOnly(input?.applicationDate || new Date(existing.applicationDate).toISOString().slice(0, 10), "Application Date");
    const requestedRecoveryStart = input?.recoveryStartDate
      ? dateOnly(input.recoveryStartDate, "Recovery Start Date")
      : existing.recoveryStartDate
        ? new Date(existing.recoveryStartDate).toISOString().slice(0, 10)
        : null;
    const requestedPurpose = input?.purpose === undefined ? text(existing.purpose) : text(input.purpose);
    const requestedNotes = input?.notes === undefined ? text(existing.notes) : text(input.notes);

    if (financialHistoryLocked) {
      const changesHistoricalIdentity =
        requestedEmployeeNumber !== String(existing.employeeNumber).toUpperCase() ||
        requestedPrincipal !== Number(existing.principalAmount) ||
        requestedApplicationDate !== new Date(existing.applicationDate).toISOString().slice(0, 10);
      if (changesHistoricalIdentity) {
        throw error(
          "LOAN_FINANCIAL_HISTORY_LOCKED",
          "Employee, Principal Amount and Application Date cannot be changed after disbursement or posted recoveries.",
          409,
          { postedRecoveryCount, postedRecoveryAmount }
        );
      }
    }

    if (existing.parentLoanId && requestedEmployeeNumber !== String(existing.employeeNumber).toUpperCase()) {
      throw error("TOPUP_EMPLOYEE_LOCKED", "A top-up remains linked to the employee on its parent loan.", 409);
    }

    const targetEmployee = requestedEmployeeNumber === String(existing.employeeNumber).toUpperCase()
      ? { id: existing.employeeId, employeeNumber: existing.employeeNumber, firstName: "", middleName: "", lastName: "" }
      : await employee(tx, organizationId, requestedEmployeeNumber);

    const maximumInstallment = financialHistoryLocked ? Number(existing.outstandingAmount || 0) : requestedPrincipal;
    if (maximumInstallment > 0 && requestedInstallment > maximumInstallment) {
      throw error("INVALID_LOAN_INSTALLMENT", `Monthly Installment cannot exceed ${financialHistoryLocked ? "the outstanding balance" : "the principal amount"}.`);
    }

    if (requestedRecoveryStart && existing.disbursedDate) {
      const disbursedDate = new Date(existing.disbursedDate).toISOString().slice(0, 10);
      if (requestedRecoveryStart < disbursedDate) {
        throw error("INVALID_RECOVERY_START", "Recovery Start Date cannot be earlier than Disbursed Date.");
      }
    }

    const approvalSensitiveChange =
      requestedEmployeeNumber !== String(existing.employeeNumber).toUpperCase() ||
      requestedPrincipal !== Number(existing.principalAmount) ||
      requestedInstallment !== Number(existing.installmentAmount) ||
      requestedApplicationDate !== new Date(existing.applicationDate).toISOString().slice(0, 10) ||
      requestedPurpose !== text(existing.purpose);
    const resetApproval = existing.status === "APPROVED" && !financialHistoryLocked && approvalSensitiveChange;
    const nextStatus = resetApproval ? "PENDING_APPROVAL" : existing.status;
    const nextOutstanding = financialHistoryLocked ? Number(existing.outstandingAmount) : requestedPrincipal;

    const updatedRows = await tx.$queryRawUnsafe(
      `UPDATE "payroll_loans"
          SET "employeeId"=$3,"principalAmount"=$4,"outstandingAmount"=$5,"installmentAmount"=$6,
              "applicationDate"=$7::date,"recoveryStartDate"=$8::date,"purpose"=$9,"notes"=$10,
              "status"=$11,
              "approvedDate"=CASE WHEN $12::boolean THEN NULL ELSE "approvedDate" END,
              "approvedByUserId"=CASE WHEN $12::boolean THEN NULL ELSE "approvedByUserId" END,
              "updatedAt"=CURRENT_TIMESTAMP
        WHERE "organizationId"=$1 AND "id"=$2
        RETURNING *`,
      organizationId,
      loanId,
      targetEmployee.id,
      requestedPrincipal,
      nextOutstanding,
      requestedInstallment,
      requestedApplicationDate,
      requestedRecoveryStart,
      requestedPurpose || null,
      requestedNotes || null,
      nextStatus,
      resetApproval
    );

    const currentEmployee = requestedEmployeeNumber === String(existing.employeeNumber).toUpperCase()
      ? { employeeNumber: existing.employeeNumber, name: existing.employeeName }
      : { employeeNumber: targetEmployee.employeeNumber, name: employeeName(targetEmployee) };
    const original = mapLoan(existing);
    const updated = mapLoan({ ...updatedRows[0], employeeNumber: currentEmployee.employeeNumber, employeeName: currentEmployee.name });

    await audit(tx, {
      organizationId,
      actorUserId,
      entityType: "PayrollLoan",
      entityId: loanId,
      action: "LOAN_UPDATED",
      previousValue: original,
      newValue: { ...updated, approvalReset: resetApproval },
      reason: requestedNotes || requestedPurpose || "Loan record edited",
    });

    return { ...updated, postedRecoveryCount, postedRecoveryAmount, financialHistoryLocked, approvalReset: resetApproval };
  });
}

module.exports = {
  updateSalaryAdvance,
  updateLoan,
};