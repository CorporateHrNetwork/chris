const prisma = require("../config/prisma");

function settlementError(code, message, statusCode = 409, details) {
  const error = new Error(message); error.code = code; error.statusCode = statusCode; error.details = details; return error;
}
function money(value) {
  const result = Math.round(Number(value || 0) * 100) / 100;
  if (!Number.isFinite(result) || result < 0) throw settlementError("INVALID_SETTLEMENT_AMOUNT", "Settlement amounts must be valid non-negative numbers.", 400);
  return Object.is(result, -0) ? 0 : result;
}
function text(value) { return String(value ?? "").trim(); }
async function assertActor(tx, organizationId, actorUserId) {
  const actor = await tx.user.findFirst({ where: { id: actorUserId, organizationId, isActive: true }, select: { id: true } });
  if (!actor) throw settlementError("INVALID_SETTLEMENT_ACTOR", "An active organization user is required.", 403);
}
function calculate(input) {
  const values = {};
  for (const key of ["finalSalary","allowancePayable","leavePayable","noticePay","gratuitySeverance","taxAdjustment","pensionAdjustment","loanRecovery","salaryAdvanceRecovery","otherRecovery"]) values[key] = money(input[key]);
  values.grossPayable = money(values.finalSalary + values.allowancePayable + values.leavePayable + values.noticePay + values.gratuitySeverance);
  values.totalRecovery = money(values.taxAdjustment + values.pensionAdjustment + values.loanRecovery + values.salaryAdvanceRecovery + values.otherRecovery);
  values.netSettlement = Math.round((values.grossPayable - values.totalRecovery) * 100) / 100;
  return values;
}
async function calculateSettlement({ organizationId, actorUserId, exitProcessId, input, prismaClient = prisma }) {
  return prismaClient.$transaction(async (tx) => {
    await assertActor(tx, organizationId, actorUserId);
    const exit = await tx.employeeExitProcess.findFirst({ where: { id: exitProcessId, organizationId }, include: { employee: true } });
    if (!exit) throw settlementError("EXIT_PROCESS_NOT_FOUND", "Exit process not found.", 404);
    const existing = await tx.exitSettlement.findUnique({ where: { exitProcessId } });
    if (existing && !["DRAFT","CALCULATED","DISPUTED"].includes(existing.status)) throw settlementError("SETTLEMENT_IMMUTABLE", "Approved or paid settlement values cannot be recalculated.");
    for (const [amountKey, referenceKey, label] of [
      ["finalSalary", "finalSalaryReference", "final salary"],
      ["leavePayable", "leaveReference", "leave payable"],
      ["noticePay", "noticePayReference", "notice pay"],
      ["gratuitySeverance", "gratuityReference", "gratuity/severance"],
    ]) {
      if (money(input[amountKey]) > 0 && !text(input[referenceKey])) {
        throw settlementError("SETTLEMENT_EVIDENCE_REQUIRED", `A source reference is required for ${label}.`, 400, { amountKey, referenceKey });
      }
    }
    const [loanRows, advanceRows, scheduledDeductionRows] = await Promise.all([
      tx.$queryRawUnsafe(
        `SELECT COALESCE(SUM("outstandingAmount"),0) AS "amount" FROM "payroll_loans"
          WHERE "organizationId"=$1 AND "employeeId"=$2 AND "status" IN ('ACTIVE','APPROVED','DISBURSED')`,
        organizationId, exit.employeeId
      ),
      tx.$queryRawUnsafe(
        `SELECT COALESCE(SUM("outstandingAmount"),0) AS "amount" FROM "payroll_salary_advances"
          WHERE "organizationId"=$1 AND "employeeId"=$2 AND "status"='ACTIVE'`,
        organizationId, exit.employeeId
      ),
      tx.$queryRawUnsafe(
        `SELECT COALESCE(SUM("outstandingAmount"),0) AS "amount" FROM "payroll_deduction_plans"
          WHERE "organizationId"=$1 AND "employeeId"=$2 AND "status"='ACTIVE' AND "outstandingAmount" > 0`,
        organizationId, exit.employeeId
      ),
    ]);
    const scheduledDeductionRecovery = money(scheduledDeductionRows[0]?.amount);
    const authoritativeInput = {
      ...input,
      loanRecovery: money(loanRows[0]?.amount),
      salaryAdvanceRecovery: money(advanceRows[0]?.amount),
      otherRecovery: money(money(input.otherRecovery) + scheduledDeductionRecovery),
    };
    const values = calculate(authoritativeInput);
    const snapshot = {
      inputs: Object.fromEntries(Object.keys(values).filter((key) => !["grossPayable","totalRecovery","netSettlement"].includes(key)).map((key) => [key, values[key]])),
      authoritativeBalances: {
        loanRecovery: values.loanRecovery,
        salaryAdvanceRecovery: values.salaryAdvanceRecovery,
        scheduledDeductionRecovery,
        otherRecoveryEntered: money(input.otherRecovery),
        otherRecoveryTotal: values.otherRecovery,
      },
      evidenceReferences: {
        finalSalary: text(input.finalSalaryReference) || null, leave: text(input.leaveReference) || null,
        noticePay: text(input.noticePayReference) || null, gratuity: text(input.gratuityReference) || null,
      },
      totals: { grossPayable: values.grossPayable, totalRecovery: values.totalRecovery, netSettlement: values.netSettlement },
      calculatedAt: new Date().toISOString(), employeeNumber: exit.employee.employeeNumber,
    };
    const settlement = await tx.exitSettlement.upsert({
      where: { exitProcessId },
      create: { organizationId, exitProcessId, employeeId: exit.employeeId, currency: text(input.currency) || "NGN", ...values, status: "CALCULATED", calculationSnapshot: snapshot, notes: text(input.notes) || null, calculatedByUserId: actorUserId, calculatedAt: new Date() },
      update: { currency: text(input.currency) || existing.currency, ...values, status: "CALCULATED", calculationSnapshot: snapshot, notes: text(input.notes) || null, calculatedByUserId: actorUserId, calculatedAt: new Date(), approvedByUserId: null, approvedAt: null },
    });
    await tx.employeeExitProcess.update({ where: { id: exit.id }, data: { financialStatus: "PENDING", finalClosureAt: null } });
    return settlement;
  }, { isolationLevel: "Serializable" });
}
async function submitSettlement({ organizationId, actorUserId, exitProcessId, prismaClient = prisma }) {
  return prismaClient.$transaction(async (tx) => {
    await assertActor(tx, organizationId, actorUserId);
    const settlement = await tx.exitSettlement.findFirst({ where: { exitProcessId, organizationId } });
    if (!settlement || settlement.status !== "CALCULATED") throw settlementError("SETTLEMENT_NOT_CALCULATED", "A calculated settlement is required before submission.");
    return tx.exitSettlement.update({ where: { id: settlement.id }, data: { status: "PENDING_APPROVAL" } });
  });
}
async function approveSettlement({ organizationId, actorUserId, exitProcessId, notes, prismaClient = prisma }) {
  return prismaClient.$transaction(async (tx) => {
    await assertActor(tx, organizationId, actorUserId);
    const settlement = await tx.exitSettlement.findFirst({ where: { exitProcessId, organizationId } });
    if (!settlement || settlement.status !== "PENDING_APPROVAL") throw settlementError("SETTLEMENT_NOT_PENDING_APPROVAL", "Settlement must be pending approval.");
    if (settlement.calculatedByUserId === actorUserId) throw settlementError("SETTLEMENT_MAKER_CHECKER_REQUIRED", "The settlement calculator cannot approve the same settlement.");
    const zeroBalance = Math.round(Number(settlement.netSettlement || 0) * 100) / 100 === 0;
    const updated = await tx.exitSettlement.update({ where: { id: settlement.id }, data: { status: zeroBalance ? "PAID" : "PAYMENT_PENDING", approvedByUserId: actorUserId, approvedAt: new Date(), paidAt: zeroBalance ? new Date() : null, notes: text(notes) || settlement.notes } });
    await tx.employeeExitProcess.update({ where: { id: exitProcessId }, data: { financialStatus: zeroBalance ? "PAID" : "APPROVED", finalClosureAt: zeroBalance ? new Date() : null } });
    return updated;
  });
}
async function recordSettlementPayment({ organizationId, actorUserId, exitProcessId, amount, notes, prismaClient = prisma }) {
  return prismaClient.$transaction(async (tx) => {
    await assertActor(tx, organizationId, actorUserId);
    const settlement = await tx.exitSettlement.findFirst({ where: { exitProcessId, organizationId } });
    if (!settlement || !["PAYMENT_PENDING","PARTIALLY_PAID"].includes(settlement.status)) throw settlementError("SETTLEMENT_NOT_PAYABLE", "Settlement is not awaiting payment.");
    const paid = money(amount), amountPaid = money(Number(settlement.amountPaid) + paid);
    const settlementTarget = money(Math.abs(Number(settlement.netSettlement)));
    if (amountPaid > settlementTarget) throw settlementError("SETTLEMENT_OVERPAYMENT", "Payment or recovery exceeds the approved settlement balance.");
    const final = amountPaid === settlementTarget;
    const updated = await tx.exitSettlement.update({ where: { id: settlement.id }, data: { amountPaid, status: final ? "PAID" : "PARTIALLY_PAID", paidByUserId: actorUserId, paidAt: final ? new Date() : null, notes: text(notes) || settlement.notes } });
    if (final) await tx.employeeExitProcess.update({ where: { id: exitProcessId }, data: { financialStatus: "PAID", finalClosureAt: new Date() } });
    return updated;
  }, { isolationLevel: "Serializable" });
}
async function waiveSettlement({ organizationId, actorUserId, exitProcessId, reason, prismaClient = prisma }) {
  const notes = text(reason);
  if (!notes) throw settlementError("WAIVER_REASON_REQUIRED", "A documented waiver reason is required.", 400);
  return prismaClient.$transaction(async (tx) => {
    await assertActor(tx, organizationId, actorUserId);
    const settlement = await tx.exitSettlement.findFirst({ where: { exitProcessId, organizationId } });
    if (!settlement || !["PENDING_APPROVAL","APPROVED","PAYMENT_PENDING"].includes(settlement.status)) throw settlementError("SETTLEMENT_NOT_WAIVABLE", "Settlement is not eligible for waiver.");
    if (settlement.calculatedByUserId === actorUserId) throw settlementError("SETTLEMENT_MAKER_CHECKER_REQUIRED", "The calculator cannot waive the same settlement.");
    const updated = await tx.exitSettlement.update({ where: { id: settlement.id }, data: { status: "WAIVED", approvedByUserId: actorUserId, approvedAt: new Date(), notes } });
    await tx.employeeExitProcess.update({ where: { id: exitProcessId }, data: { financialStatus: "WAIVED", finalClosureAt: new Date() } });
    return updated;
  });
}
async function getSettlement({ organizationId, exitProcessId, prismaClient = prisma }) {
  return prismaClient.exitSettlement.findFirst({ where: { organizationId, exitProcessId } });
}
module.exports = { calculate, calculateSettlement, submitSettlement, approveSettlement, recordSettlementPayment, waiveSettlement, getSettlement, settlementError };
