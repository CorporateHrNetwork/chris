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
  const draftCount = await tx.statutoryObligation.count({
    where: { organizationId, payrollRunId, status: "DRAFT_CALCULATED" },
  });
  if (!draftCount) throw obligationError("PAYROLL_OBLIGATIONS_MISSING", "Payroll approval cannot continue because no draft statutory obligations exist.");

  const withheldByType = statutoryCompliance?.withheldEmployeeIdsByType || {};
  const payeEmployeeIds = [...new Set(withheldByType.PAYE || [])];
  const pensionEmployeeIds = [...new Set(withheldByType.PENSION || [])];

  const confirmedAt = new Date();
  const ready = await tx.statutoryObligation.updateMany({
    where: {
      organizationId,
      payrollRunId,
      status: "DRAFT_CALCULATED",
      NOT: [
        ...(payeEmployeeIds.length ? [{ obligationType: "PAYE", employeeId: { in: payeEmployeeIds } }] : []),
        ...(pensionEmployeeIds.length ? [{ obligationType: "PENSION", employeeId: { in: pensionEmployeeIds } }] : []),
      ],
    },
    data: {
      status: "CONFIRMED",
      confirmedAt,
      exceptionCode: null,
      exceptionReason: null,
    },
  });

  let withheldPaye = { count: 0 };
  if (payeEmployeeIds.length) {
    withheldPaye = await tx.statutoryObligation.updateMany({
      where: {
        organizationId,
        payrollRunId,
        status: "DRAFT_CALCULATED",
        obligationType: "PAYE",
        employeeId: { in: payeEmployeeIds },
      },
      data: {
        status: "CONFIRMED",
        confirmedAt,
        exceptionCode: "WITHHELD_MISSING_STATUTORY_DETAILS",
        exceptionReason: "PAYE remittance withheld because required employee Tax Identification Number and/or PAYE State details are incomplete.",
      },
    });
  }

  let withheldPension = { count: 0 };
  if (pensionEmployeeIds.length) {
    withheldPension = await tx.statutoryObligation.updateMany({
      where: {
        organizationId,
        payrollRunId,
        status: "DRAFT_CALCULATED",
        obligationType: "PENSION",
        employeeId: { in: pensionEmployeeIds },
      },
      data: {
        status: "CONFIRMED",
        confirmedAt,
        exceptionCode: "WITHHELD_MISSING_STATUTORY_DETAILS",
        exceptionReason: "Pension remittance withheld because required employee Pension PFA and/or Pension PIN details are incomplete.",
      },
    });
  }

  const withheldCount = Number(withheldPaye.count || 0) + Number(withheldPension.count || 0);
  const totalConfirmed = Number(ready.count || 0) + withheldCount;

  await tx.statutoryLifecycleEvent.create({ data: {
    organizationId,
    subjectType: "PAYROLL_RUN",
    subjectId: payrollRunId,
    eventType: withheldCount ? "OBLIGATIONS_CONFIRMED_WITH_WITHHELD_POOL" : "OBLIGATIONS_CONFIRMED",
    actorUserId: actorUserId || null,
    previousStatus: "DRAFT_CALCULATED",
    newStatus: "CONFIRMED",
    metadata: {
      count: totalConfirmed,
      readyForRemittanceCount: Number(ready.count || 0),
      withheldCount,
      withheldPayeCount: Number(withheldPaye.count || 0),
      withheldPensionCount: Number(withheldPension.count || 0),
      control: "Payroll approval is independent from remittance readiness. Withheld obligations remain recorded but cannot be allocated to a remittance batch until required employee statutory identifiers are complete.",
    },
  } });

  return {
    count: totalConfirmed,
    readyForRemittanceCount: Number(ready.count || 0),
    withheldCount,
    withheldPayeCount: Number(withheldPaye.count || 0),
    withheldPensionCount: Number(withheldPension.count || 0),
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
