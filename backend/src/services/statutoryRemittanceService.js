const prisma = require("../config/prisma");

function remitError(code, message, statusCode = 409, details) {
  const error = new Error(message); error.code = code; error.statusCode = statusCode; error.details = details; return error;
}
function text(value) { return String(value ?? "").trim(); }
function money(value) { return Math.round(Number(value || 0) * 100) / 100; }
function positiveMoney(value, label) {
  const result = money(value);
  if (!Number.isFinite(result) || result <= 0) throw remitError("INVALID_REMITTANCE_AMOUNT", `${label} must be greater than zero.`, 400);
  return result;
}
async function assertActor(tx, organizationId, actorUserId) {
  const actor = await tx.user.findFirst({ where: { id: actorUserId, organizationId, isActive: true }, select: { id: true } });
  if (!actor) throw remitError("INVALID_REMITTANCE_ACTOR", "An active organization user is required.", 403);
}
async function lifecycle(tx, input) {
  await tx.statutoryLifecycleEvent.create({ data: {
    organizationId: input.organizationId, subjectType: input.subjectType, subjectId: input.subjectId,
    eventType: input.eventType, actorUserId: input.actorUserId || null, previousStatus: input.previousStatus || null,
    newStatus: input.newStatus || null, notes: text(input.notes) || null, metadata: input.metadata || undefined,
  } });
}
async function listObligations({ organizationId, filters = {}, prismaClient = prisma }) {
  return prismaClient.statutoryObligation.findMany({
    where: {
      organizationId,
      ...(filters.payrollRunId ? { payrollRunId: filters.payrollRunId } : {}),
      ...(filters.obligationType ? { obligationType: text(filters.obligationType).toUpperCase() } : {}),
      ...(filters.status ? { status: text(filters.status).toUpperCase() } : {}),
      ...(filters.periodYear ? { periodYear: Number(filters.periodYear) } : {}),
      ...(filters.periodMonth ? { periodMonth: Number(filters.periodMonth) } : {}),
    },
    include: { employee: { select: { employeeNumber: true, firstName: true, middleName: true, lastName: true } } },
    orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }, { obligationType: "asc" }, { createdAt: "asc" }],
  });
}
async function createBatch({ organizationId, actorUserId, input, prismaClient = prisma }) {
  const reference = text(input.reference);
  const obligationType = text(input.obligationType).toUpperCase();
  const authorityName = text(input.authorityName);
  const year = Number(input.periodYear), month = Number(input.periodMonth);
  if (!reference || !obligationType || !authorityName || !Number.isInteger(year) || month < 1 || month > 12) {
    throw remitError("INVALID_REMITTANCE_BATCH", "Reference, obligation type, authority and valid period are required.", 400);
  }
  return prismaClient.$transaction(async (tx) => {
    await assertActor(tx, organizationId, actorUserId);
    const batch = await tx.statutoryRemittanceBatch.create({ data: {
      organizationId, reference, obligationType, jurisdiction: text(input.jurisdiction) || "NG",
      authorityName, periodYear: year, periodMonth: month, currency: text(input.currency) || "NGN",
      declaredAmount: positiveMoney(input.declaredAmount, "Declared amount"), createdByUserId: actorUserId,
    } });
    await lifecycle(tx, { organizationId, subjectType: "REMITTANCE_BATCH", subjectId: batch.id, eventType: "BATCH_CREATED", actorUserId, newStatus: "DRAFT" });
    return batch;
  }, { isolationLevel: "Serializable" });
}
async function submitBatch({ organizationId, actorUserId, batchId, notes, prismaClient = prisma }) {
  return prismaClient.$transaction(async (tx) => {
    await assertActor(tx, organizationId, actorUserId);
    const batch = await tx.statutoryRemittanceBatch.findFirst({ where: { id: batchId, organizationId } });
    if (!batch) throw remitError("REMITTANCE_BATCH_NOT_FOUND", "Remittance batch not found.", 404);
    if (batch.status !== "DRAFT") throw remitError("INVALID_REMITTANCE_TRANSITION", "Only a draft batch can be submitted.");
    const updated = await tx.statutoryRemittanceBatch.update({ where: { id: batch.id }, data: { status: "SUBMITTED" } });
    await lifecycle(tx, { organizationId, subjectType: "REMITTANCE_BATCH", subjectId: batch.id, eventType: "BATCH_SUBMITTED", actorUserId, previousStatus: batch.status, newStatus: "SUBMITTED", notes });
    return updated;
  });
}
async function approveBatch({ organizationId, actorUserId, batchId, notes, prismaClient = prisma }) {
  return prismaClient.$transaction(async (tx) => {
    await assertActor(tx, organizationId, actorUserId);
    const batch = await tx.statutoryRemittanceBatch.findFirst({ where: { id: batchId, organizationId } });
    if (!batch) throw remitError("REMITTANCE_BATCH_NOT_FOUND", "Remittance batch not found.", 404);
    if (batch.status !== "SUBMITTED") throw remitError("INVALID_REMITTANCE_TRANSITION", "Only a submitted batch can be approved.");
    if (batch.createdByUserId === actorUserId) throw remitError("REMITTANCE_MAKER_CHECKER_REQUIRED", "The batch creator cannot approve the same remittance.");
    const updated = await tx.statutoryRemittanceBatch.update({ where: { id: batch.id }, data: { status: "APPROVED", approvedByUserId: actorUserId, approvedAt: new Date() } });
    await lifecycle(tx, { organizationId, subjectType: "REMITTANCE_BATCH", subjectId: batch.id, eventType: "BATCH_APPROVED", actorUserId, previousStatus: batch.status, newStatus: "APPROVED", notes });
    return updated;
  });
}
async function recordPayment({ organizationId, actorUserId, batchId, input, prismaClient = prisma }) {
  return prismaClient.$transaction(async (tx) => {
    await assertActor(tx, organizationId, actorUserId);
    const batch = await tx.statutoryRemittanceBatch.findFirst({ where: { id: batchId, organizationId } });
    if (!batch) throw remitError("REMITTANCE_BATCH_NOT_FOUND", "Remittance batch not found.", 404);
    if (batch.status !== "APPROVED") throw remitError("INVALID_REMITTANCE_TRANSITION", "Only an approved batch can be marked paid.");
    const paymentReference = text(input.paymentReference), evidenceReference = text(input.evidenceReference);
    const paymentDate = new Date(input.paymentDate);
    if (!paymentReference || !evidenceReference || Number.isNaN(paymentDate.getTime())) throw remitError("PAYMENT_EVIDENCE_REQUIRED", "Payment reference, date and evidence reference are required.", 400);
    const updated = await tx.statutoryRemittanceBatch.update({ where: { id: batch.id }, data: {
      status: "PAID", paymentReference, paymentDate, evidenceReference,
    } });
    await lifecycle(tx, { organizationId, subjectType: "REMITTANCE_BATCH", subjectId: batch.id, eventType: "PAYMENT_RECORDED", actorUserId, previousStatus: batch.status, newStatus: "PAID", metadata: { paymentReference, evidenceReference } });
    return updated;
  });
}
async function allocateBatch({ organizationId, actorUserId, batchId, allocations, prismaClient = prisma }) {
  if (!Array.isArray(allocations) || !allocations.length) throw remitError("ALLOCATIONS_REQUIRED", "At least one allocation is required.", 400);
  return prismaClient.$transaction(async (tx) => {
    await assertActor(tx, organizationId, actorUserId);
    const batch = await tx.statutoryRemittanceBatch.findFirst({ where: { id: batchId, organizationId }, include: { allocations: true } });
    if (!batch) throw remitError("REMITTANCE_BATCH_NOT_FOUND", "Remittance batch not found.", 404);
    if (!["PAID","PARTIALLY_ALLOCATED"].includes(batch.status)) throw remitError("INVALID_REMITTANCE_TRANSITION", "Only a paid batch can be allocated.");
    let added = 0;
    for (const item of allocations) {
      const amount = positiveMoney(item.amount, "Allocation amount");
      const obligation = await tx.statutoryObligation.findFirst({ where: {
        id: item.obligationId, organizationId, obligationType: batch.obligationType,
        periodYear: batch.periodYear, periodMonth: batch.periodMonth,
        status: { in: ["CONFIRMED","DUE","PARTIALLY_REMITTED","OVERDUE"] },
      } });
      if (!obligation) throw remitError("INELIGIBLE_OBLIGATION", "An allocation targets a missing, mismatched or ineligible obligation.", 409, { obligationId: item.obligationId });
      if (money(Number(obligation.amountRemitted) + amount) > money(obligation.totalLiability)) {
        throw remitError("OBLIGATION_OVERALLOCATION", "Allocation exceeds the obligation outstanding balance.", 409, { obligationId: obligation.id });
      }
      await tx.statutoryRemittanceAllocation.upsert({
        where: { batchId_obligationId: { batchId: batch.id, obligationId: obligation.id } },
        create: { organizationId, batchId: batch.id, obligationId: obligation.id, amount },
        update: { amount: { increment: amount } },
      });
      const amountRemitted = money(Number(obligation.amountRemitted) + amount);
      await tx.statutoryObligation.update({ where: { id: obligation.id }, data: {
        amountRemitted, status: amountRemitted === money(obligation.totalLiability) ? "REMITTED" : "PARTIALLY_REMITTED",
      } });
      added = money(added + amount);
    }
    const allocatedAmount = money(Number(batch.allocatedAmount) + added);
    if (allocatedAmount > money(batch.declaredAmount)) throw remitError("BATCH_OVERALLOCATION", "Allocations exceed the declared remittance amount.");
    const status = allocatedAmount === money(batch.declaredAmount) ? "ALLOCATED" : "PARTIALLY_ALLOCATED";
    const updated = await tx.statutoryRemittanceBatch.update({ where: { id: batch.id }, data: { allocatedAmount, status } });
    await lifecycle(tx, { organizationId, subjectType: "REMITTANCE_BATCH", subjectId: batch.id, eventType: "ALLOCATIONS_RECORDED", actorUserId, previousStatus: batch.status, newStatus: status, metadata: { added, allocatedAmount } });
    return updated;
  }, { isolationLevel: "Serializable" });
}
async function reconcileBatch({ organizationId, actorUserId, batchId, input, prismaClient = prisma }) {
  return prismaClient.$transaction(async (tx) => {
    await assertActor(tx, organizationId, actorUserId);
    const batch = await tx.statutoryRemittanceBatch.findFirst({ where: { id: batchId, organizationId }, include: { allocations: true } });
    if (!batch) throw remitError("REMITTANCE_BATCH_NOT_FOUND", "Remittance batch not found.", 404);
    if (!["ALLOCATED","PARTIALLY_ALLOCATED"].includes(batch.status)) throw remitError("INVALID_REMITTANCE_TRANSITION", "Allocate the paid batch before reconciliation.");
    const paidAmount = positiveMoney(input.paidAmount, "Paid amount");
    const expectedAmount = money(batch.declaredAmount), varianceAmount = money(paidAmount - expectedAmount);
    const status = varianceAmount === 0 && money(batch.allocatedAmount) === expectedAmount ? "MATCHED" : varianceAmount < 0 ? "SHORTFALL" : varianceAmount > 0 ? "OVERPAYMENT" : "UNMATCHED";
    const reconciliation = await tx.statutoryReconciliation.upsert({
      where: { batchId: batch.id },
      create: { organizationId, batchId: batch.id, expectedAmount, paidAmount, varianceAmount, status, notes: text(input.notes) || null, reconciledByUserId: actorUserId, reconciledAt: new Date() },
      update: { expectedAmount, paidAmount, varianceAmount, status, notes: text(input.notes) || null, reconciledByUserId: actorUserId, reconciledAt: new Date() },
    });
    if (status === "MATCHED") {
      await tx.statutoryRemittanceBatch.update({ where: { id: batch.id }, data: { status: "RECONCILED" } });
      await tx.statutoryObligation.updateMany({ where: { organizationId, allocations: { some: { batchId: batch.id } }, status: "REMITTED" }, data: { status: "RECONCILED" } });
    }
    await lifecycle(tx, { organizationId, subjectType: "REMITTANCE_BATCH", subjectId: batch.id, eventType: "BATCH_RECONCILED", actorUserId, previousStatus: batch.status, newStatus: status === "MATCHED" ? "RECONCILED" : batch.status, metadata: { expectedAmount, paidAmount, varianceAmount, reconciliationStatus: status } });
    return reconciliation;
  }, { isolationLevel: "Serializable" });
}
async function failBatch({ organizationId, actorUserId, batchId, reason, prismaClient = prisma }) {
  const notes = text(reason);
  if (!notes) throw remitError("REMITTANCE_FAILURE_REASON_REQUIRED", "A failure reason is required.", 400);
  return prismaClient.$transaction(async (tx) => {
    await assertActor(tx, organizationId, actorUserId);
    const batch = await tx.statutoryRemittanceBatch.findFirst({ where: { id: batchId, organizationId } });
    if (!batch) throw remitError("REMITTANCE_BATCH_NOT_FOUND", "Remittance batch not found.", 404);
    if (!["SUBMITTED","APPROVED"].includes(batch.status)) throw remitError("INVALID_REMITTANCE_TRANSITION", "Only a submitted or approved unpaid batch can fail.");
    const updated = await tx.statutoryRemittanceBatch.update({ where: { id: batch.id }, data: { status: "FAILED" } });
    await lifecycle(tx, { organizationId, subjectType: "REMITTANCE_BATCH", subjectId: batch.id, eventType: "BATCH_FAILED", actorUserId, previousStatus: batch.status, newStatus: "FAILED", notes });
    return updated;
  });
}
async function reverseBatch({ organizationId, actorUserId, batchId, reason, prismaClient = prisma }) {
  const notes = text(reason);
  if (!notes) throw remitError("REMITTANCE_REVERSAL_REASON_REQUIRED", "A reversal reason is required.", 400);
  return prismaClient.$transaction(async (tx) => {
    await assertActor(tx, organizationId, actorUserId);
    const batch = await tx.statutoryRemittanceBatch.findFirst({ where: { id: batchId, organizationId }, include: { allocations: true } });
    if (!batch) throw remitError("REMITTANCE_BATCH_NOT_FOUND", "Remittance batch not found.", 404);
    if (!["PAID","PARTIALLY_ALLOCATED","ALLOCATED","RECONCILED"].includes(batch.status)) throw remitError("INVALID_REMITTANCE_TRANSITION", "Only a paid or allocated batch can be reversed.");
    for (const allocation of batch.allocations) {
      const obligation = await tx.statutoryObligation.findFirst({ where: { id: allocation.obligationId, organizationId } });
      if (!obligation) throw remitError("REMITTANCE_REVERSAL_INTEGRITY_ERROR", "Allocated obligation is missing.");
      const amountRemitted = money(Math.max(0, Number(obligation.amountRemitted) - Number(allocation.amount)));
      await tx.statutoryObligation.update({ where: { id: obligation.id }, data: {
        amountRemitted,
        status: amountRemitted === 0 ? "CONFIRMED" : "PARTIALLY_REMITTED",
        exceptionCode: "REMITTANCE_REVERSED", exceptionReason: notes,
      } });
    }
    const updated = await tx.statutoryRemittanceBatch.update({ where: { id: batch.id }, data: { status: "REVERSED" } });
    await tx.statutoryReconciliation.updateMany({ where: { organizationId, batchId: batch.id }, data: { status: "OPEN", notes } });
    await lifecycle(tx, { organizationId, subjectType: "REMITTANCE_BATCH", subjectId: batch.id, eventType: "BATCH_REVERSED", actorUserId, previousStatus: batch.status, newStatus: "REVERSED", notes, metadata: { allocationCount: batch.allocations.length } });
    return updated;
  }, { isolationLevel: "Serializable" });
}
async function listBatches({ organizationId, prismaClient = prisma }) {
  return prismaClient.statutoryRemittanceBatch.findMany({ where: { organizationId }, include: { allocations: true, reconciliation: true }, orderBy: { createdAt: "desc" } });
}

module.exports = { listObligations, createBatch, submitBatch, approveBatch, recordPayment, allocateBatch, reconcileBatch, failBatch, reverseBatch, listBatches, remitError };
