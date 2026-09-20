const crypto = require("crypto");

function obligationError(code, message, statusCode = 409, details) {
  const error = new Error(message); error.code = code; error.statusCode = statusCode; error.details = details; return error;
}
function money(value) { const result = Math.round(Number(value || 0) * 100) / 100; return Object.is(result, -0) ? 0 : result; }
function periodParts(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw obligationError("INVALID_OBLIGATION_PERIOD", "Payroll period end date is invalid.", 400);
  return { periodYear: date.getUTCFullYear(), periodMonth: date.getUTCMonth() + 1 };
}
function dueDateFor(type, year, month) {
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const day = type === "PAYE" ? 10 : 7;
  return new Date(Date.UTC(nextYear, nextMonth - 1, day, 23, 59, 59, 999));
}
function rowsFromLine(line, context) {
  const statutory = line.details?.statutory || {};
  const candidates = [
    ["PAYE", statutory.annualChargeableIncomeIncludingOneTime, statutory.payeTax, 0],
    ["PENSION", statutory.pensionableBase, statutory.employeePension, statutory.employerPension],
    ["NHF", statutory.pensionableBase, statutory.nhfEmployee, 0],
    ["NSITF_ECS", line.grossPay, 0, statutory.nsitfEmployer],
    ["ITF", line.grossPay, 0, statutory.itfEmployerAccrual],
  ];
  return candidates.filter(([, , employeeAmount, employerAmount]) => money(employeeAmount) + money(employerAmount) > 0)
    .map(([obligationType, assessableBase, employeeAmount, employerAmount]) => ({
      id: crypto.randomUUID(), organizationId: context.organizationId, employeeId: line.employee.id,
      payrollRunId: context.payrollRunId, payrollRunLineId: line.runLineId, obligationType,
      jurisdiction: "NG", ...periodParts(context.periodEnd), ruleId: context.ruleId || null,
      currency: line.currency || "NGN", assessableBase: money(assessableBase), employeeAmount: money(employeeAmount),
      employerAmount: money(employerAmount), totalLiability: money(money(employeeAmount) + money(employerAmount)),
      amountRemitted: 0, status: "DRAFT_CALCULATED",
      dueDate: dueDateFor(obligationType, periodParts(context.periodEnd).periodYear, periodParts(context.periodEnd).periodMonth),
      calculationSnapshot: {
        policy: line.details?.policy || null,
        statutory: statutory,
        employeeNumber: line.employee.employeeNumber,
        payrollRunId: context.payrollRunId,
        payrollRunLineId: line.runLineId,
      },
    }));
}
async function replaceDraftObligations(tx, { organizationId, payrollRunId, periodEnd, ruleId, lines }) {
  const protectedRows = await tx.statutoryObligation.count({
    where: { organizationId, payrollRunId, status: { notIn: ["DRAFT_CALCULATED", "REVERSED"] } },
  });
  if (protectedRows) throw obligationError("CONFIRMED_OBLIGATIONS_IMMUTABLE", "Confirmed or remitted statutory obligations cannot be replaced by payroll recalculation.");
  await tx.statutoryObligation.deleteMany({ where: { organizationId, payrollRunId, status: "DRAFT_CALCULATED" } });
  const rows = lines.flatMap((line) => rowsFromLine(line, { organizationId, payrollRunId, periodEnd, ruleId }));
  if (rows.length) await tx.statutoryObligation.createMany({ data: rows });
  return rows;
}
async function confirmPayrollObligations(tx, { organizationId, payrollRunId, actorUserId, statutoryCompliance = null }) {
  const obligations = await tx.statutoryObligation.findMany({
    where: { organizationId, payrollRunId, status: "DRAFT_CALCULATED" },
    select: { id: true, employeeId: true, obligationType: true },
  });

  const payeWithheld = new Set(statutoryCompliance?.withheldEmployeeIdsByType?.PAYE || []);
  const pensionWithheld = new Set(statutoryCompliance?.withheldEmployeeIdsByType?.PENSION || []);
  const readyIds = [];
  const withheldPayeIds = [];
  const withheldPensionIds = [];

  for (const obligation of obligations) {
    if (obligation.obligationType === "PAYE" && payeWithheld.has(obligation.employeeId)) {
      withheldPayeIds.push(obligation.id);
    } else if (obligation.obligationType === "PENSION" && pensionWithheld.has(obligation.employeeId)) {
      withheldPensionIds.push(obligation.id);
    } else {
      readyIds.push(obligation.id);
    }
  }

  const confirmedAt = new Date();
  let readyCount = 0;
  if (readyIds.length) {
    const result = await tx.statutoryObligation.updateMany({
      where: { organizationId, id: { in: readyIds }, status: "DRAFT_CALCULATED" },
      data: { status: "CONFIRMED", confirmedAt, exceptionCode: null, exceptionReason: null },
    });
    readyCount = Number(result.count || 0);
  }

  let withheldPayeCount = 0;
  if (withheldPayeIds.length) {
    const result = await tx.statutoryObligation.updateMany({
      where: { organizationId, id: { in: withheldPayeIds }, status: "DRAFT_CALCULATED" },
      data: {
        status: "CONFIRMED",
        confirmedAt,
        exceptionCode: "WITHHELD_MISSING_STATUTORY_DETAILS",
        exceptionReason: "PAYE remittance withheld because required employee Tax Identification Number and/or PAYE State details are incomplete.",
      },
    });
    withheldPayeCount = Number(result.count || 0);
  }

  let withheldPensionCount = 0;
  if (withheldPensionIds.length) {
    const result = await tx.statutoryObligation.updateMany({
      where: { organizationId, id: { in: withheldPensionIds }, status: "DRAFT_CALCULATED" },
      data: {
        status: "CONFIRMED",
        confirmedAt,
        exceptionCode: "WITHHELD_MISSING_STATUTORY_DETAILS",
        exceptionReason: "Pension remittance withheld because required employee Pension PFA and/or Pension PIN details are incomplete.",
      },
    });
    withheldPensionCount = Number(result.count || 0);
  }

  const withheldCount = withheldPayeCount + withheldPensionCount;
  const totalConfirmed = readyCount + withheldCount;

  await tx.statutoryLifecycleEvent.create({ data: {
    organizationId,
    subjectType: "PAYROLL_RUN",
    subjectId: payrollRunId,
    eventType: withheldCount
      ? "OBLIGATIONS_CONFIRMED_WITH_WITHHELD_POOL"
      : totalConfirmed
        ? "OBLIGATIONS_CONFIRMED"
        : "PAYROLL_APPROVED_NO_STATUTORY_LIABILITY",
    actorUserId: actorUserId || null,
    previousStatus: obligations.length ? "DRAFT_CALCULATED" : null,
    newStatus: totalConfirmed ? "CONFIRMED" : "NO_APPLICABLE_LIABILITY",
    metadata: {
      count: totalConfirmed,
      readyForRemittanceCount: readyCount,
      withheldCount,
      withheldPayeCount,
      withheldPensionCount,
      control: "Payroll approval is independent from remittance readiness. Missing employee statutory identifiers never block payroll approval; affected liabilities remain recorded but cannot be allocated until the required details are completed.",
    },
  } });

  return {
    count: totalConfirmed,
    readyForRemittanceCount: readyCount,
    withheldCount,
    withheldPayeCount,
    withheldPensionCount,
  };
}

async function reversePayrollObligations(tx, { organizationId, payrollRunId, actorUserId, reason }) {
  const remitted = await tx.statutoryObligation.count({ where: { organizationId, payrollRunId, amountRemitted: { gt: 0 } } });
  if (remitted) throw obligationError("REMITTED_OBLIGATIONS_BLOCK_PAYROLL_REOPEN", "Payroll cannot be reopened after statutory remittance. Record a future adjustment instead.");
  const changed = await tx.statutoryObligation.updateMany({
    where: { organizationId, payrollRunId, status: { in: ["CONFIRMED", "DUE", "OVERDUE"] } },
    data: { status: "REVERSED", exceptionCode: "PAYROLL_REOPENED", exceptionReason: reason },
  });
  await tx.statutoryLifecycleEvent.create({ data: {
    organizationId, subjectType: "PAYROLL_RUN", subjectId: payrollRunId, eventType: "OBLIGATIONS_REVERSED",
    actorUserId: actorUserId || null, newStatus: "REVERSED", notes: reason, metadata: { count: changed.count },
  } });
  return changed.count;
}

module.exports = { rowsFromLine, replaceDraftObligations, confirmPayrollObligations, reversePayrollObligations, money };
