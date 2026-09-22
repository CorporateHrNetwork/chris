const prisma = require("../config/prisma");
const baseWorkflow = require("./loanOriginationWorkflowService");
const { assessLoanCollateral, getEosbStatement } = require("./eosbService");

function collateralError(code, message, statusCode = 409, details) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

async function recordCollateral(client, { organizationId, actorUserId, loanId, assessment, reason }) {
  return client.organizationAudit.create({
    data: {
      organizationId,
      actorUserId: actorUserId || null,
      entityType: "LoanCollateral",
      entityId: loanId,
      action: "LOAN_COLLATERAL_ASSESSED",
      newValue: assessment,
      reason: reason || "Zermatt loan collateral assessment",
    },
  });
}

async function latestCollateral(client, organizationId, loanId) {
  const row = await client.organizationAudit.findFirst({
    where: { organizationId, entityType: "LoanCollateral", entityId: loanId },
    orderBy: { createdAt: "desc" },
    select: { newValue: true },
  });
  return row?.newValue || null;
}

async function loanContext(client, organizationId, loanId) {
  const rows = await client.$queryRawUnsafe(
    `SELECT l."id",l."principalAmount",l."outstandingAmount",l."status",e."employeeNumber"
       FROM "payroll_loans" l
       JOIN "employees" e ON e."id"=l."employeeId" AND e."organizationId"=l."organizationId"
      WHERE l."organizationId"=$1 AND l."id"=$2 LIMIT 1`,
    organizationId,
    loanId
  );
  if (!rows[0]) throw collateralError("LOAN_NOT_FOUND", "Loan application not found.", 404);
  return rows[0];
}

async function revalidateExistingLoan({ organizationId, actorUserId, loanId, prismaClient = prisma }) {
  const loan = await loanContext(prismaClient, organizationId, loanId);
  const previous = await latestCollateral(prismaClient, organizationId, loanId);
  const requestedAmount = Number(loan.principalAmount || 0);
  const statement = await getEosbStatement({ organizationId, employeeNumber: loan.employeeNumber, prismaClient });
  let assessment;

  if (statement.loanCollateral.mode === "EOSB") {
    if (!statement.eosb.calculationReady) {
      throw collateralError("EOSB_CALCULATION_NOT_READY", statement.eosb.missingReason || "EoSB calculation is not ready.");
    }
    // The statement's exposure already contains this existing draft/application.
    // Add this application's own outstanding amount back before validating it,
    // while preserving reservations from every other live loan/application.
    const ownExposure = Math.max(Number(loan.outstandingAmount ?? loan.principalAmount ?? 0), 0);
    const adjustedAvailable = Math.max(Number(statement.loanCollateral.availableCollateral || 0) + ownExposure, 0);
    if (requestedAmount > adjustedAvailable) {
      throw collateralError(
        "LOAN_EXCEEDS_EOSB_COLLATERAL",
        `Requested loan exceeds available EoSB collateral of ${adjustedAvailable.toFixed(2)} after other loan exposure.`,
        409,
        { requestedAmount, availableCollateral: adjustedAvailable }
      );
    }
    assessment = {
      ...statement.loanCollateral,
      availableCollateral: adjustedAvailable,
      requestedAmount,
      approvedByRule: true,
      surety: null,
      assessedAt: new Date().toISOString(),
    };
  } else {
    const suretyEmployeeNumber = previous?.surety?.employeeNumber || previous?.suretyEmployeeNumber || null;
    assessment = await assessLoanCollateral({
      organizationId,
      employeeNumber: loan.employeeNumber,
      requestedAmount,
      suretyEmployeeNumber,
      prismaClient,
    });
    assessment = { ...assessment, assessedAt: new Date().toISOString() };
  }

  await recordCollateral(prismaClient, {
    organizationId,
    actorUserId,
    loanId,
    assessment,
    reason: "Loan collateral revalidated before workflow decision",
  });
  return assessment;
}

async function createDraftApplication(args) {
  const input = args.input || {};
  const assessment = await assessLoanCollateral({
    organizationId: args.organizationId,
    employeeNumber: input.employeeNumber,
    requestedAmount: input.principalAmount,
    suretyEmployeeNumber: input.suretyEmployeeNumber,
    prismaClient: args.prismaClient || prisma,
  });
  const created = await baseWorkflow.createDraftApplication(args);
  await recordCollateral(args.prismaClient || prisma, {
    organizationId: args.organizationId,
    actorUserId: args.actorUserId,
    loanId: created.id,
    assessment: { ...assessment, assessedAt: new Date().toISOString() },
    reason: assessment.mode === "EOSB" ? "EoSB collateral reserved at loan application" : "Internal employee surety recorded at loan application",
  });
  return { ...created, collateral: assessment };
}

async function submitForHrVerification(args) {
  await revalidateExistingLoan(args);
  return baseWorkflow.submitForHrVerification(args);
}

async function hrVerificationDecision(args) {
  if (String(args.decision || "").trim().toUpperCase() === "VERIFY") {
    await revalidateExistingLoan(args);
  }
  return baseWorkflow.hrVerificationDecision(args);
}

module.exports = {
  ...baseWorkflow,
  createDraftApplication,
  submitForHrVerification,
  hrVerificationDecision,
  revalidateExistingLoan,
};
