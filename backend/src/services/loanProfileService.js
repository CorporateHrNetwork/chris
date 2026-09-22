const prisma = require("../config/prisma");

const ZERMATT_OPENING_HISTORY_PAID_THROUGH = "2026-08";
const ZERMATT_AUGUST_PAUSE_EMPLOYEES = new Set(["ZLL000055", "ZLL000185"]);

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

function monthLabel(value) {
  if (!value) return "External settlement";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return "External settlement";
  return date.toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

function applyZermattOpeningHistoryPolicy({
  organizationSlug,
  employeeNumber,
  loanNotes,
  principalAmount,
  installmentAmount,
  recoveryStartDate,
  legacyPeriodEvents = [],
}) {
  const existing = Array.isArray(legacyPeriodEvents) ? [...legacyPeriodEvents] : [];
  const isZermatt = organizationSlug === "zermatt-liquor-limited";
  const isOpeningLoan = /Source Reference:/i.test(String(loanNotes || ""));
  const principal = money(principalAmount);
  const installment = money(installmentAmount);
  const startText = dateText(recoveryStartDate);

  if (!isZermatt || !isOpeningLoan || !principal || !installment || !startText) return existing;
  const startMonth = startText.slice(0, 7);
  if (startMonth > ZERMATT_OPENING_HISTORY_PAID_THROUGH) return existing;

  const byMonth = new Map();
  for (const event of existing) {
    const key = monthKey(event.periodStart);
    if (key) byMonth.set(key, event);
  }

  const [startYear, startMonthNumber] = startMonth.split("-").map(Number);
  const termMonths = Math.ceil(principal / installment);
  for (let offset = 0; offset < termMonths; offset += 1) {
    const periodStart = new Date(Date.UTC(startYear, startMonthNumber - 1 + offset, 1));
    const key = periodStart.toISOString().slice(0, 7);
    if (key > ZERMATT_OPENING_HISTORY_PAID_THROUGH) break;
    if (byMonth.has(key)) continue;

    const isConfirmedAugustPause = key === "2026-08" && ZERMATT_AUGUST_PAUSE_EMPLOYEES.has(String(employeeNumber || "").toUpperCase());
    const remainingBeforePeriod = Math.max(0, money(principal - (installment * offset)));
    const scheduledAmount = money(Math.min(installment, remainingBeforePeriod));
    if (scheduledAmount <= 0) break;

    byMonth.set(key, {
      id: `runtime-zermatt-opening-history-${key}`,
      periodStart: `${key}-01`,
      status: isConfirmedAugustPause ? "PAUSED" : "PAID",
      amount: isConfirmedAugustPause ? 0 : scheduledAmount,
      reason: isConfirmedAugustPause
        ? "August 2026 deduction is a confirmed ZERMATT opening-history pause."
        : "ZERMATT opening-loan history is confirmed paid through August 2026.",
      source: "ZERMATT_OPENING_HISTORY_POLICY",
      runtimeDerived: true,
    });
  }

  return Array.from(byMonth.values()).sort((a, b) => String(a.periodStart).localeCompare(String(b.periodStart)));
}

function applyExternalSettlementToSchedule(schedule, externalSettlement) {
  const amount = money(externalSettlement?.amount);
  const settlementDate = dateText(externalSettlement?.date);
  if (!amount || !settlementDate) return schedule;

  const settlementMonth = settlementDate.slice(0, 7);
  const retained = schedule.filter((row) => {
    const rowMonth = String(row.dueDate || "").slice(0, 7);
    if (rowMonth < settlementMonth) return true;
    if (rowMonth > settlementMonth) return false;
    return ["PAID", "PAUSED"].includes(row.status);
  });

  retained.push({
    installmentNumber: retained.length + 1,
    period: `${monthLabel(settlementDate)} · External settlement`,
    dueDate: settlementDate,
    outstandingBalance: amount,
    principalAmount: amount,
    interestAmount: 0,
    totalDeduction: 0,
    amountPaid: amount,
    outstandingAfter: 0,
    status: "SETTLED_EXTERNALLY",
    paymentSource: externalSettlement?.source || "EXTERNAL_SETTLEMENT",
    settlementReference: externalSettlement?.reference || null,
    settlementReason: externalSettlement?.reason || null,
  });

  return retained;
}

function buildAmortizationSchedule({
  principalAmount,
  installmentAmount,
  recoveryStartDate,
  recoveries = [],
  openingRecoveredAmount = 0,
  legacyPeriodEvents = [],
  externalSettlement = null,
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

  // Explicit legacy-period events remain authoritative for the months they cover.
  // The aggregate opening recovered balance is independent evidence of historical
  // recovery. Reserve the value already represented by explicit PAID events and
  // carry only the unrepresented remainder forward as a compatibility fallback.
  const explicitLegacyPaidAmount = money(
    Array.from(legacyByMonth.values())
      .filter((event) => event.status === "PAID")
      .reduce((sum, event) => sum + Number(event.amount || 0), 0)
  );
  let remainingLegacyPaid = Math.max(
    0,
    money(Number(openingRecoveredAmount || 0) - explicitLegacyPaidAmount)
  );
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
    let scheduledPrincipal = money(Math.min(installment, plannedOutstanding));

    const microResidual = money(plannedOutstanding - scheduledPrincipal);
    if (microResidual > 0 && microResidual <= 1) scheduledPrincipal = money(plannedOutstanding);

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
        status = "EXCEPTION";
      }
      paymentSource = "APPROVED_PAYROLL";
    } else if (remainingLegacyPaid > 0) {
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

  return applyExternalSettlementToSchedule(schedule, externalSettlement);
}

async function getLoanProfile({ organizationId, loanId, prismaClient = prisma }) {
  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT l.*, e."employeeNumber",
            CONCAT_WS(' ',e."firstName",e."middleName",e."lastName") AS "employeeName",
            d."name" AS "departmentName", des."name" AS "designationName",
            parent."loanNumber" AS "parentLoanNumber", o."slug" AS "organizationSlug"
       FROM "payroll_loans" l
       JOIN "organizations" o ON o."id"=l."organizationId"
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
         JOIN "payroll_periods" pp ON pp."id"=pr."periodId" AND pp."organizationId"=r."organizationId"
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
  const storedLegacyPeriodEvents = legacyRows.map((row) => ({
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
  const externalSettlementAmount = money(loan.externalSettlementAmount);
  const openingRecoveredAmount = Math.max(
    0,
    money(recoveredAmount - payrollRecoveredAmount - externalSettlementAmount)
  );
  const legacyPeriodEvents = applyZermattOpeningHistoryPolicy({
    organizationSlug: loan.organizationSlug,
    employeeNumber: loan.employeeNumber,
    loanNotes: loan.notes,
    principalAmount,
    installmentAmount,
    recoveryStartDate: loan.recoveryStartDate,
    legacyPeriodEvents: storedLegacyPeriodEvents,
  });
  const externalSettlement = externalSettlementAmount > 0
    ? {
        amount: externalSettlementAmount,
        date: loan.externalSettlementDate,
        source: loan.externalSettlementSource,
        reference: loan.externalSettlementReference,
        reason: loan.externalSettlementReason,
      }
    : null;
  const schedule = buildAmortizationSchedule({
    principalAmount,
    installmentAmount,
    recoveryStartDate: dateText(loan.recoveryStartDate),
    recoveries,
    openingRecoveredAmount,
    legacyPeriodEvents,
    externalSettlement,
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
      externalSettlementAmount,
      externalSettlementDate: dateText(loan.externalSettlementDate),
      externalSettlementSource: loan.externalSettlementSource || null,
      externalSettlementReference: loan.externalSettlementReference || null,
      externalSettlementReason: loan.externalSettlementReason || null,
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
      recoverySource: "APPROVED_PAYROLL_OR_RECORDED_EXTERNAL_SETTLEMENT",
      openingRecoveryTreatment: "ZERMATT_CONFIRMED_HISTORY_THROUGH_AUGUST_2026",
      scheduleBasis: "MONTH_END_FROM_RECOVERY_START",
      installmentMode: "FULL_INSTALLMENT_ONLY",
      partialInstallmentsPermitted: false,
      microResidualTreatment: "ABSORB_UP_TO_ONE_NAIRA_INTO_FINAL_INSTALLMENT",
      historicalRecoveriesImmutable: true,
      externalSettlementCreatesPayrollRecovery: false,
    },
  };
}

async function getBulkLoanReport({ organizationId, prismaClient = prisma }) {
  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT l."id",l."loanNumber",e."employeeNumber",
            CONCAT_WS(' ',e."firstName",e."middleName",e."lastName") AS "employeeName",
            l."purpose",l."principalAmount",l."outstandingAmount",l."installmentAmount",
            l."applicationDate",l."approvedDate",l."disbursedDate",l."recoveryStartDate",l."status",
            l."externalSettlementAmount",l."externalSettlementDate",l."externalSettlementSource",l."externalSettlementReference"
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
      externalSettlementAmount: money(row.externalSettlementAmount),
      externalSettlementDate: dateText(row.externalSettlementDate),
      externalSettlementSource: row.externalSettlementSource || null,
      externalSettlementReference: row.externalSettlementReference || null,
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
  ZERMATT_OPENING_HISTORY_PAID_THROUGH,
  ZERMATT_AUGUST_PAUSE_EMPLOYEES,
  applyZermattOpeningHistoryPolicy,
  buildAmortizationSchedule,
  getLoanProfile,
  getBulkLoanReport,
};