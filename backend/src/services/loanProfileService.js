const prisma = require("../config/prisma");

function dateText(value) {
  if (!value) return null;
  return new Date(value).toISOString().slice(0, 10);
}

function monthEnd(dateValue, monthOffset = 0) {
  const base = new Date(`${dateValue}T00:00:00.000Z`);
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + monthOffset + 1, 0));
}

function money(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function monthKey(value) {
  const text = dateText(value);
  return text ? text.slice(0, 7) : "";
}

function buildAmortizationSchedule({
  principalAmount,
  installmentAmount,
  recoveryStartDate,
  recoveries = [],
  openingRecoveredAmount = 0,
  legacyPeriodEvents = [],
}) {
  const principal = money(principalAmount);
  const installment = money(installmentAmount);
  if (!principal || !installment || !recoveryStartDate) return [];

  const legacyByMonth = new Map();
  for (const event of legacyPeriodEvents || []) {
    const key = monthKey(event.periodStart);
    if (key) legacyByMonth.set(key, event);
  }

  const postedByMonth = new Map();
  for (const recovery of recoveries || []) {
    if (recovery.status !== "POSTED") continue;
    const key = monthKey(recovery.recoveryDate);
    if (!key) continue;
    postedByMonth.set(key, money((postedByMonth.get(key) || 0) + Number(recovery.amount || 0)));
  }

  // Once explicit legacy month events exist, they are the authoritative schedule history.
  // Do not re-spend the aggregate openingRecoveredAmount in later months.
  let remainingLegacyPaid = legacyByMonth.size ? 0 : Math.max(0, money(openingRecoveredAmount));
  let plannedOutstanding = principal;
  let monthOffset = 0;
  const schedule = [];
  const pauseCount = Array.from(legacyByMonth.values()).filter((event) => event.status === "PAUSED").length;
  const baseTermMonths = Math.ceil(principal / installment);
  const safetyLimit = baseTermMonths + pauseCount + 24;

  while (plannedOutstanding > 0.004 && monthOffset < safetyLimit) {
    const dueDate = monthEnd(recoveryStartDate, monthOffset);
    const key = dueDate.toISOString().slice(0, 7);
    const legacyEvent = legacyByMonth.get(key) || null;
    const postedAmount = money(postedByMonth.get(key) || 0);
    const scheduledPrincipal = money(Math.min(installment, plannedOutstanding));

    let status = "PENDING";
    let amountPaid = 0;
    let consumesPlannedPrincipal = true;
    let paymentSource = null;

    if (legacyEvent?.status === "PAUSED") {
      status = "PAUSED";
      amountPaid = 0;
      consumesPlannedPrincipal = false;
      paymentSource = legacyEvent.source || "OPENING_MIGRATION";
    } else if (legacyEvent?.status === "PAID") {
      status = "PAID";
      amountPaid = scheduledPrincipal;
      paymentSource = legacyEvent.source || "OPENING_MIGRATION";
    } else if (postedAmount > 0) {
      amountPaid = money(Math.min(scheduledPrincipal, postedAmount));
      if (Math.abs(amountPaid - scheduledPrincipal) <= 0.01) {
        amountPaid = scheduledPrincipal;
        status = "PAID";
      } else {
        // ZERMATT does not permit partial loan installments. Any historic partial posting is an exception,
        // not a legitimate installment status.
        status = "EXCEPTION";
      }
      paymentSource = "APPROVED_PAYROLL";
    } else if (remainingLegacyPaid > 0) {
      // Compatibility fallback for opening loans created before explicit legacy-period history existed.
      // Currency-rounding residues of up to ₦1 must never create a false PARTIAL installment.
      if (remainingLegacyPaid + 1 >= scheduledPrincipal) {
        status = "PAID";
        amountPaid = scheduledPrincipal;
        remainingLegacyPaid = Math.max(0, money(remainingLegacyPaid - scheduledPrincipal));
        paymentSource = "LEGACY_OPENING_BALANCE_FALLBACK";
      } else if (remainingLegacyPaid <= 1) {
        remainingLegacyPaid = 0;
      } else {
        status = "EXCEPTION";
        paymentSource = "LEGACY_OPENING_BALANCE_REVIEW";
        remainingLegacyPaid = 0;
      }
    }

    const outstandingAfter = consumesPlannedPrincipal
      ? money(Math.max(0, plannedOutstanding - scheduledPrincipal))
      : money(plannedOutstanding);

    schedule.push({
      installmentNumber: schedule.length + 1,
      period: dueDate.toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }),
      dueDate: dueDate.toISOString().slice(0, 10),
      outstandingBalance: money(plannedOutstanding),
      principalAmount: scheduledPrincipal,
      interestAmount: 0,
      totalDeduction: scheduledPrincipal,
      amountPaid: money(amountPaid),
      outstandingAfter,
      status,
      paymentSource,
      pauseReason: legacyEvent?.status === "PAUSED" ? legacyEvent.reason || null : null,
    });

    if (consumesPlannedPrincipal) plannedOutstanding = outstandingAfter;
    monthOffset += 1;
  }

  return schedule;
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

  const [recoveryRows, legacyRows] = await Promise.all([
    prismaClient.$queryRawUnsafe(
      `SELECT r."id",r."amount",r."recoveryDate",r."status",r."runId",
              pp."code" AS "payrollPeriodCode",pp."name" AS "payrollPeriodName",pr."approvedAt"
         FROM "payroll_loan_recoveries" r
         JOIN "payroll_runs" pr ON pr."id"=r."runId" AND pr."organizationId"=r."organizationId"
         JOIN "payroll_periods" pp ON pp."id"=pr."periodId" AND pp."organizationId"=pr."organizationId"
        WHERE r."organizationId"=$1 AND r."loanId"=$2
        ORDER BY r."recoveryDate" ASC,r."createdAt" ASC`,
      organizationId,
      loanId
    ),
    prismaClient.$queryRawUnsafe(
      `SELECT "id","periodStart","status","amount","reason","source","createdAt"
         FROM "payroll_loan_legacy_period_events"
        WHERE "organizationId"=$1 AND "loanId"=$2
        ORDER BY "periodStart" ASC`,
      organizationId,
      loanId
    ),
  ]);

  const recoveries = recoveryRows.map((row) => ({
    ...row,
    amount: money(row.amount),
    recoveryDate: dateText(row.recoveryDate),
  }));
  const legacyPeriodEvents = legacyRows.map((row) => ({
    ...row,
    periodStart: dateText(row.periodStart),
    amount: money(row.amount),
  }));

  const principalAmount = money(loan.principalAmount);
  const outstandingAmount = money(loan.outstandingAmount);
  const installmentAmount = money(loan.installmentAmount);
  const recoveredAmount = Math.max(0, money(principalAmount - outstandingAmount));
  const payrollRecoveredAmount = money(recoveries
    .filter((row) => row.status === "POSTED")
    .reduce((sum, row) => sum + Number(row.amount || 0), 0));
  const openingRecoveredAmount = Math.max(0, money(recoveredAmount - payrollRecoveredAmount));
  const schedule = buildAmortizationSchedule({
    principalAmount,
    installmentAmount,
    recoveryStartDate: dateText(loan.recoveryStartDate),
    recoveries,
    openingRecoveredAmount,
    legacyPeriodEvents,
  });
  const nextPending = schedule.find((row) => row.status === "PENDING") || null;

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
      openingRecoveredAmount,
      payrollRecoveredAmount,
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
      nextPaymentAmount: nextPending ? nextPending.totalDeduction : 0,
    },
    recoveries,
    legacyPeriodEvents,
    amortizationSchedule: schedule,
    controls: {
      interestTreatment: "ZERO_INTEREST",
      recoverySource: "APPROVED_PAYROLL_ONLY_FOR_CHRIS_POSTINGS",
      openingRecoveryTreatment: "RECONCILED_LEGACY_PERIOD_HISTORY",
      scheduleBasis: "MONTH_END_FROM_RECOVERY_START",
      installmentMode: "FULL_INSTALLMENT_ONLY",
      partialInstallmentsPermitted: false,
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
    const principalAmount = money(row.principalAmount);
    const outstandingAmount = money(row.outstandingAmount);
    const installmentAmount = money(row.installmentAmount);
    return {
      loanId: row.id,
      loanNumber: row.loanNumber,
      employeeNumber: row.employeeNumber,
      employeeName: row.employeeName,
      purpose: row.purpose || null,
      principalAmount,
      recoveredAmount: Math.max(0, money(principalAmount - outstandingAmount)),
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
