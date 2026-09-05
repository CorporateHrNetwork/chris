const prisma = require("../config/prisma");

function dateText(value) {
  if (!value) return null;
  return new Date(value).toISOString().slice(0, 10);
}

function monthEnd(dateValue, monthOffset = 0) {
  const base = new Date(`${dateValue}T00:00:00.000Z`);
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + monthOffset + 1, 0));
}

function buildAmortizationSchedule({ principalAmount, installmentAmount, recoveryStartDate, recoveries = [] }) {
  const principal = Number(principalAmount || 0);
  const installment = Number(installmentAmount || 0);
  if (!principal || !installment || !recoveryStartDate) return [];

  const termMonths = Math.ceil(principal / installment);
  const postedRecoveries = recoveries
    .filter((row) => row.status === "POSTED")
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);
  let remainingPaid = postedRecoveries;
  let outstandingBefore = principal;

  return Array.from({ length: termMonths }, (_, index) => {
    const scheduledPrincipal = Math.min(installment, outstandingBefore);
    const amountPaid = Math.min(scheduledPrincipal, Math.max(0, remainingPaid));
    remainingPaid = Math.max(0, remainingPaid - amountPaid);
    const outstandingAfter = Math.max(0, outstandingBefore - amountPaid);
    const dueDate = monthEnd(recoveryStartDate, index);
    const status = amountPaid >= scheduledPrincipal
      ? "PAID"
      : amountPaid > 0
        ? "PARTIAL"
        : "PENDING";
    const row = {
      installmentNumber: index + 1,
      period: dueDate.toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }),
      dueDate: dueDate.toISOString().slice(0, 10),
      outstandingBalance: Math.round(outstandingBefore * 100) / 100,
      principalAmount: Math.round(scheduledPrincipal * 100) / 100,
      interestAmount: 0,
      totalDeduction: Math.round(scheduledPrincipal * 100) / 100,
      amountPaid: Math.round(amountPaid * 100) / 100,
      outstandingAfter: Math.round(outstandingAfter * 100) / 100,
      status,
    };
    outstandingBefore = Math.max(0, outstandingBefore - scheduledPrincipal);
    return row;
  });
}

async function getLoanProfile({ organizationId, loanId, prismaClient = prisma }) {
  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT l.*, e."employeeNumber",
            CONCAT_WS(' ',e."firstName",e."middleName",e."lastName") AS "employeeName",
            d."name" AS "departmentName", des."name" AS "designationName",
            parent."loanNumber" AS "parentLoanNumber"
       FROM "payroll_loans" l
       JOIN "employees" e ON e."id"=l."employeeId" AND e."organizationId"=l."organizationId"
       LEFT JOIN "departments" d ON d."id"=e."departmentId"
       LEFT JOIN "designations" des ON des."id"=e."designationId"
       LEFT JOIN "payroll_loans" parent ON parent."id"=l."parentLoanId" AND parent."organizationId"=l."organizationId"
      WHERE l."organizationId"=$1 AND l."id"=$2
      LIMIT 1`,
    organizationId,
    loanId
  );
  const loan = rows[0];
  if (!loan) {
    const error = new Error("Loan not found.");
    error.code = "LOAN_NOT_FOUND";
    error.statusCode = 404;
    throw error;
  }

  const recoveryRows = await prismaClient.$queryRawUnsafe(
    `SELECT r."id",r."amount",r."recoveryDate",r."status",r."runId",
            pp."code" AS "payrollPeriodCode",pp."name" AS "payrollPeriodName",pr."approvedAt"
       FROM "payroll_loan_recoveries" r
       JOIN "payroll_runs" pr ON pr."id"=r."runId" AND pr."organizationId"=r."organizationId"
       JOIN "payroll_periods" pp ON pp."id"=pr."periodId" AND pp."organizationId"=pr."organizationId"
      WHERE r."organizationId"=$1 AND r."loanId"=$2
      ORDER BY r."recoveryDate" ASC,r."createdAt" ASC`,
    organizationId,
    loanId
  );

  const recoveries = recoveryRows.map((row) => ({
    ...row,
    amount: Number(row.amount || 0),
    recoveryDate: dateText(row.recoveryDate),
  }));
  const principalAmount = Number(loan.principalAmount || 0);
  const outstandingAmount = Number(loan.outstandingAmount || 0);
  const installmentAmount = Number(loan.installmentAmount || 0);
  const recoveredAmount = Math.max(0, Math.round((principalAmount - outstandingAmount) * 100) / 100);
  const schedule = buildAmortizationSchedule({
    principalAmount,
    installmentAmount,
    recoveryStartDate: dateText(loan.recoveryStartDate),
    recoveries,
  });
  const nextPending = schedule.find((row) => row.status !== "PAID") || null;

  return {
    loan: {
      id: loan.id,
      loanNumber: loan.loanNumber,
      employeeId: loan.employeeId,
      employeeNumber: loan.employeeNumber,
      employeeName: loan.employeeName,
      departmentName: loan.departmentName || null,
      designationName: loan.designationName || null,
      principalAmount,
      outstandingAmount,
      recoveredAmount,
      installmentAmount,
      interestRatePercent: 0,
      totalInterest: 0,
      totalRepayable: principalAmount,
      applicationDate: dateText(loan.applicationDate),
      approvedDate: dateText(loan.approvedDate),
      disbursedDate: dateText(loan.disbursedDate),
      recoveryStartDate: dateText(loan.recoveryStartDate),
      status: loan.status,
      purpose: loan.purpose || null,
      notes: loan.notes || null,
      parentLoanId: loan.parentLoanId || null,
      parentLoanNumber: loan.parentLoanNumber || null,
      termMonths: schedule.length,
      expectedFinalInstallmentDate: schedule.length ? schedule[schedule.length - 1].dueDate : null,
      nextPaymentDue: nextPending?.dueDate || null,
      nextPaymentAmount: nextPending ? Math.max(0, nextPending.totalDeduction - nextPending.amountPaid) : 0,
    },
    recoveries,
    amortizationSchedule: schedule,
    controls: {
      interestTreatment: "ZERO_INTEREST",
      recoverySource: "APPROVED_PAYROLL_ONLY",
      scheduleBasis: "MONTH_END_FROM_RECOVERY_START",
      historicalRecoveriesImmutable: true,
    },
  };
}

async function getBulkLoanReport({ organizationId, prismaClient = prisma }) {
  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT l."id",l."loanNumber",e."employeeNumber",
            CONCAT_WS(' ',e."firstName",e."middleName",e."lastName") AS "employeeName",
            l."purpose",l."principalAmount",l."outstandingAmount",l."installmentAmount",
            l."applicationDate",l."approvedDate",l."disbursedDate",l."recoveryStartDate",l."status"
       FROM "payroll_loans" l
       JOIN "employees" e ON e."id"=l."employeeId" AND e."organizationId"=l."organizationId"
      WHERE l."organizationId"=$1
      ORDER BY e."employeeNumber" ASC,l."createdAt" ASC`,
    organizationId
  );

  return rows.map((row) => {
    const principalAmount = Number(row.principalAmount || 0);
    const outstandingAmount = Number(row.outstandingAmount || 0);
    const installmentAmount = Number(row.installmentAmount || 0);
    return {
      loanId: row.id,
      loanNumber: row.loanNumber,
      employeeNumber: row.employeeNumber,
      employeeName: row.employeeName,
      purpose: row.purpose || null,
      principalAmount,
      recoveredAmount: Math.max(0, Math.round((principalAmount - outstandingAmount) * 100) / 100),
      outstandingAmount,
      installmentAmount,
      interestRatePercent: 0,
      termMonths: installmentAmount > 0 ? Math.ceil(principalAmount / installmentAmount) : 0,
      applicationDate: dateText(row.applicationDate),
      approvedDate: dateText(row.approvedDate),
      disbursedDate: dateText(row.disbursedDate),
      recoveryStartDate: dateText(row.recoveryStartDate),
      status: row.status,
    };
  });
}

module.exports = {
  buildAmortizationSchedule,
  getLoanProfile,
  getBulkLoanReport,
};
