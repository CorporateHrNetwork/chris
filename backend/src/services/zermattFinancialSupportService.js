const crypto = require("crypto");
const prisma = require("../config/prisma");
const { markDraftRunsRecalculationRequired } = require("./payrollDraftFreshnessService");

const MAX_REPAYMENT_MONTHS = 600;

function policyError(code, message, statusCode = 400, details) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

function text(value) {
  return String(value ?? "").trim();
}

function positiveMoney(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw policyError("INVALID_AMOUNT", `${label} must be greater than zero.`);
  }
  return Math.round(number * 100) / 100;
}

function dateOnly(value, label) {
  const raw = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw policyError("INVALID_DATE", `${label} must use YYYY-MM-DD.`);
  }
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) {
    throw policyError("INVALID_DATE", `${label} is not a valid date.`);
  }
  return raw;
}

function monthStart(value, label) {
  const raw = text(value);
  if (/^\d{4}-\d{2}$/.test(raw)) return `${raw}-01`;
  return `${dateOnly(raw, label).slice(0, 7)}-01`;
}

function addMonths(month, offset) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(month || ""));
  if (!match || !Number.isSafeInteger(offset) || offset < 0 || offset >= MAX_REPAYMENT_MONTHS) return null;
  const timestamp = Date.UTC(Number(match[1]), Number(match[2]) - 1 + offset, 1);
  if (!Number.isFinite(timestamp)) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return date.toISOString().slice(0, 7);
  } catch {
    return null;
  }
}

function repaymentPlan(balanceValue, installmentValue, recoveryStartDate) {
  const balance = Number(balanceValue);
  const installmentAmount = Number(installmentValue);
  const startMonth = text(recoveryStartDate).slice(0, 7);
  if (!Number.isFinite(balance) || balance <= 0 || !Number.isFinite(installmentAmount) || installmentAmount <= 0 || !/^\d{4}-\d{2}$/.test(startMonth)) {
    return { installmentCount: 0, startMonth: startMonth || null, endMonth: null, finalInstallment: 0 };
  }
  const installmentCount = Math.ceil(balance / installmentAmount);
  if (!Number.isSafeInteger(installmentCount) || installmentCount < 1 || installmentCount > MAX_REPAYMENT_MONTHS) {
    throw policyError(
      "INVALID_REPAYMENT_TERM",
      `The repayment plan exceeds ${MAX_REPAYMENT_MONTHS} months. Increase the monthly installment before saving.`,
      400,
      { balance, installmentAmount, installmentCount, maximumMonths: MAX_REPAYMENT_MONTHS }
    );
  }
  const endMonth = addMonths(startMonth, installmentCount - 1);
  if (!endMonth) {
    throw policyError("INVALID_REPAYMENT_TERM", "The repayment end month could not be calculated safely. Increase the monthly installment or review the recovery start month.");
  }
  const recoveredBeforeFinal = installmentAmount * Math.max(0, installmentCount - 1);
  const finalInstallment = Math.round(Math.max(0, balance - recoveredBeforeFinal) * 100) / 100;
  return {
    installmentCount,
    startMonth,
    endMonth,
    finalInstallment: finalInstallment || installmentAmount,
  };
}

function employeeName(employee) {
  return [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(" ");
}

async function assertZermattOrganization(client, organizationId) {
  const organization = await client.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, slug: true, name: true },
  });
  if (!organization || organization.slug !== "zermatt-liquor-limited") {
    throw policyError(
      "ZERMATT_FINANCIAL_SUPPORT_POLICY_ONLY",
      "This approved-and-disbursed recording policy is configured for Zermatt Liquor Limited only.",
      409
    );
  }
  return organization;
}

async function resolveEmployee(client, organizationId, employeeNumber) {
  const normalized = text(employeeNumber).toUpperCase();
  if (!normalized) throw policyError("EMPLOYEE_REQUIRED", "Employee is required.");
  const employee = await client.employee.findFirst({
    where: { organizationId, employeeNumber: normalized },
    select: {
      id: true,
      employeeNumber: true,
      firstName: true,
      middleName: true,
      lastName: true,
      status: true,
      locationId: true,
    },
  });
  if (!employee) throw policyError("EMPLOYEE_NOT_FOUND", `Employee ${normalized} was not found.`, 404);
  if (["RESIGNED", "TERMINATED", "RETIRED", "INACTIVE"].includes(String(employee.status || "").toUpperCase())) {
    throw policyError("EMPLOYEE_NOT_CURRENT", "Financial support can only be recorded for a current employee.", 409);
  }
  return employee;
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

function approvalMetadata(input) {
  return {
    approvalMode: "MANUAL_GM_OUTSIDE_CHRIS",
    disbursementMode: "ACCOUNTS_PAYMENT_OUTSIDE_CHRIS",
    systemPurpose: "PAYROLL_RECOVERY_RECORD_ONLY",
    gmApprovalReference: text(input?.gmApprovalReference) || null,
    accountsPaymentReference: text(input?.accountsPaymentReference || input?.disbursementReference) || null,
  };
}

async function recordApprovedDisbursedLoan({
  organizationId,
  actorUserId,
  input,
  collateralAssessment,
  prismaClient = prisma,
}) {
  await assertZermattOrganization(prismaClient, organizationId);
  const employee = await resolveEmployee(prismaClient, organizationId, input?.employeeNumber);
  const approvedAmount = positiveMoney(input?.approvedAmount ?? input?.principalAmount, "GM Approved Loan Amount");
  const installmentAmount = positiveMoney(input?.installmentAmount, "Monthly Installment");
  if (installmentAmount > approvedAmount) {
    throw policyError("INVALID_LOAN_INSTALLMENT", "Monthly Installment cannot exceed the approved loan amount.");
  }
  const gmApprovalDate = dateOnly(input?.gmApprovalDate || input?.approvedDate, "GM Approval Date");
  const disbursedDate = dateOnly(input?.disbursedDate || input?.issuedDate, "External Disbursement Date");
  const recoveryStartDate = monthStart(input?.recoveryStartMonth || input?.recoveryStartDate, "Recovery Start Month");
  if (disbursedDate < gmApprovalDate) {
    throw policyError("INVALID_EXTERNAL_APPROVAL_SEQUENCE", "External disbursement date cannot be earlier than the GM approval date.");
  }
  if (recoveryStartDate.slice(0, 7) < disbursedDate.slice(0, 7)) {
    throw policyError("INVALID_RECOVERY_START", "Payroll recovery month cannot be earlier than the external disbursement month.");
  }

  const id = crypto.randomUUID();
  const loanNumber = `LN-${employee.employeeNumber}-${id.slice(0, 8).toUpperCase()}`;
  const metadata = approvalMetadata(input);
  const plan = repaymentPlan(approvedAmount, installmentAmount, recoveryStartDate);

  const created = await prismaClient.$transaction(async (tx) => {
    const rows = await tx.$queryRawUnsafe(
      `INSERT INTO "payroll_loans"
        ("id","organizationId","employeeId","loanNumber","principalAmount","outstandingAmount","installmentAmount",
         "applicationDate","approvedDate","approvedByUserId","disbursedDate","recoveryStartDate","disbursementReference",
         "status","purpose","notes","workflowLocationId","createdByUserId")
       VALUES ($1,$2,$3,$4,$5,$5,$6,$7::date,$7::date,$8,$9::date,$10::date,$11,'ACTIVE',$12,$13,$14,$8)
       RETURNING *`,
      id,
      organizationId,
      employee.id,
      loanNumber,
      approvedAmount,
      installmentAmount,
      gmApprovalDate,
      actorUserId || null,
      disbursedDate,
      recoveryStartDate,
      metadata.accountsPaymentReference,
      text(input?.purpose) || null,
      text(input?.notes) || null,
      employee.locationId || null
    );

    const value = {
      id,
      loanNumber,
      employeeNumber: employee.employeeNumber,
      employeeName: employeeName(employee),
      principalAmount: approvedAmount,
      outstandingAmount: approvedAmount,
      installmentAmount,
      gmApprovalDate,
      disbursedDate,
      recoveryStartDate,
      status: "ACTIVE",
      repaymentPlan: plan,
      collateral: collateralAssessment || null,
      ...metadata,
    };
    await audit(tx, {
      organizationId,
      actorUserId,
      entityType: "PayrollLoan",
      entityId: id,
      action: "LOAN_APPROVED_DISBURSED_RECORDED_BY_HR",
      newValue: value,
      reason: input?.notes || "GM-approved loan paid externally by Accounts and recorded by authorized HR for payroll recovery",
    });
    await markDraftRunsRecalculationRequired({
      organizationId,
      actorUserId,
      reason: `Approved/disbursed loan ${loanNumber} was recorded for payroll recovery from ${recoveryStartDate}.`,
      prismaClient: tx,
    });
    return { ...rows[0], ...value };
  });

  return created;
}

async function applyApprovedDisbursedLoanTopUp({
  organizationId,
  actorUserId,
  loanId,
  input,
  collateralAssessment,
  prismaClient = prisma,
}) {
  await assertZermattOrganization(prismaClient, organizationId);
  const topUpAmount = positiveMoney(input?.topUpAmount ?? input?.principalAmount, "GM Approved Top-Up Amount");
  const gmApprovalDate = dateOnly(input?.gmApprovalDate || input?.approvedDate, "GM Approval Date");
  const disbursedDate = dateOnly(input?.disbursedDate || input?.issuedDate, "External Disbursement Date");
  const recoveryStartDate = monthStart(input?.recoveryStartMonth || input?.recoveryStartDate, "Recovery Start Month");
  if (disbursedDate < gmApprovalDate) {
    throw policyError("INVALID_EXTERNAL_APPROVAL_SEQUENCE", "External disbursement date cannot be earlier than the GM approval date.");
  }
  if (recoveryStartDate.slice(0, 7) < disbursedDate.slice(0, 7)) {
    throw policyError("INVALID_RECOVERY_START", "Payroll recovery month cannot be earlier than the external top-up disbursement month.");
  }
  const metadata = approvalMetadata(input);

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
    if (!existing) throw policyError("LOAN_NOT_FOUND", "Loan account not found.", 404);
    if (!["ACTIVE", "PAUSED"].includes(String(existing.status || "").toUpperCase())) {
      throw policyError("TOPUP_ACCOUNT_NOT_CURRENT", "Top-up can only be recorded against an Active or Paused loan account.", 409);
    }

    const currentPrincipal = Number(existing.principalAmount || 0);
    const currentOutstanding = Math.max(0, Number(existing.outstandingAmount || 0));
    const installmentAmount = positiveMoney(input?.installmentAmount || existing.installmentAmount, "New Monthly Installment");
    const newPrincipal = Math.round((currentPrincipal + topUpAmount) * 100) / 100;
    const newOutstanding = Math.round((currentOutstanding + topUpAmount) * 100) / 100;
    if (installmentAmount > newOutstanding) {
      throw policyError("INVALID_LOAN_INSTALLMENT", "New Monthly Installment cannot exceed the revised outstanding balance.");
    }
    const plan = repaymentPlan(newOutstanding, installmentAmount, recoveryStartDate);

    const updatedRows = await tx.$queryRawUnsafe(
      `UPDATE "payroll_loans"
          SET "principalAmount"=$3,
              "outstandingAmount"=$4,
              "installmentAmount"=$5,
              "recoveryStartDate"=$6::date,
              "notes"=CASE WHEN $7::text IS NULL OR $7='' THEN "notes" ELSE CONCAT_WS(' | ',"notes",$7) END,
              "updatedAt"=CURRENT_TIMESTAMP
        WHERE "organizationId"=$1 AND "id"=$2
        RETURNING *`,
      organizationId,
      loanId,
      newPrincipal,
      newOutstanding,
      installmentAmount,
      recoveryStartDate,
      text(input?.notes) || null
    );

    const previousValue = {
      loanNumber: existing.loanNumber,
      principalAmount: currentPrincipal,
      outstandingAmount: currentOutstanding,
      installmentAmount: Number(existing.installmentAmount || 0),
      recoveryStartDate: existing.recoveryStartDate,
      status: existing.status,
    };
    const newValue = {
      loanNumber: existing.loanNumber,
      employeeNumber: existing.employeeNumber,
      employeeName: existing.employeeName,
      topUpAmount,
      principalAmount: newPrincipal,
      outstandingAmount: newOutstanding,
      installmentAmount,
      gmApprovalDate,
      disbursedDate,
      recoveryStartDate,
      status: existing.status,
      repaymentPlan: plan,
      collateral: collateralAssessment || null,
      ...metadata,
    };
    await audit(tx, {
      organizationId,
      actorUserId,
      entityType: "PayrollLoan",
      entityId: loanId,
      action: "LOAN_TOPUP_APPROVED_DISBURSED_MERGED_BY_HR",
      previousValue,
      newValue,
      reason: input?.notes || "GM-approved top-up paid externally by Accounts and merged into the existing loan account by authorized HR",
    });
    await markDraftRunsRecalculationRequired({
      organizationId,
      actorUserId,
      reason: `Loan ${existing.loanNumber} top-up changed the payroll recovery balance/installment from ${recoveryStartDate}.`,
      prismaClient: tx,
    });

    return {
      ...updatedRows[0],
      employeeNumber: existing.employeeNumber,
      employeeName: existing.employeeName,
      topUpAmount,
      previousPrincipalAmount: currentPrincipal,
      previousOutstandingAmount: currentOutstanding,
      principalAmount: newPrincipal,
      outstandingAmount: newOutstanding,
      installmentAmount,
      gmApprovalDate,
      disbursedDate,
      recoveryStartDate,
      repaymentPlan: plan,
      collateral: collateralAssessment || null,
      ...metadata,
    };
  });
}

async function recordApprovedDisbursedSalaryAdvance({
  organizationId,
  actorUserId,
  input,
  prismaClient = prisma,
}) {
  await assertZermattOrganization(prismaClient, organizationId);
  const employee = await resolveEmployee(prismaClient, organizationId, input?.employeeNumber);
  const amount = positiveMoney(input?.approvedAmount ?? input?.amount, "GM Approved Salary Advance Amount");
  const installmentAmount = positiveMoney(input?.installmentAmount, "Monthly Installment");
  if (installmentAmount > amount) {
    throw policyError("INVALID_ADVANCE_INSTALLMENT", "Monthly Installment cannot exceed the approved salary advance amount.");
  }
  const gmApprovalDate = dateOnly(input?.gmApprovalDate || input?.approvedDate, "GM Approval Date");
  const issuedDate = dateOnly(input?.issuedDate || input?.disbursedDate, "External Payment Date");
  const recoveryStartDate = monthStart(input?.recoveryStartMonth || input?.recoveryStartDate, "Recovery Start Month");
  if (issuedDate < gmApprovalDate) {
    throw policyError("INVALID_EXTERNAL_APPROVAL_SEQUENCE", "External payment date cannot be earlier than the GM approval date.");
  }
  if (recoveryStartDate.slice(0, 7) < issuedDate.slice(0, 7)) {
    throw policyError("INVALID_RECOVERY_START", "Payroll recovery month cannot be earlier than the external payment month.");
  }
  const metadata = approvalMetadata(input);
  const plan = repaymentPlan(amount, installmentAmount, recoveryStartDate);
  const id = crypto.randomUUID();

  return prismaClient.$transaction(async (tx) => {
    const rows = await tx.$queryRawUnsafe(
      `INSERT INTO "payroll_salary_advances"
        ("id","organizationId","employeeId","amount","outstandingAmount","installmentAmount","issuedDate","recoveryStartDate","status","reason","createdByUserId")
       VALUES ($1,$2,$3,$4,$4,$5,$6::date,$7::date,'ACTIVE',$8,$9)
       RETURNING *`,
      id,
      organizationId,
      employee.id,
      amount,
      installmentAmount,
      issuedDate,
      recoveryStartDate,
      text(input?.reason || input?.notes) || null,
      actorUserId || null
    );
    const value = {
      id,
      employeeNumber: employee.employeeNumber,
      employeeName: employeeName(employee),
      amount,
      outstandingAmount: amount,
      installmentAmount,
      gmApprovalDate,
      issuedDate,
      recoveryStartDate,
      status: "ACTIVE",
      repaymentPlan: plan,
      ...metadata,
    };
    await audit(tx, {
      organizationId,
      actorUserId,
      entityType: "PayrollSalaryAdvance",
      entityId: id,
      action: "SALARY_ADVANCE_APPROVED_DISBURSED_RECORDED_BY_HR",
      newValue: value,
      reason: input?.reason || input?.notes || "GM-approved salary advance paid externally by Accounts and recorded by authorized HR for payroll recovery",
    });
    await markDraftRunsRecalculationRequired({
      organizationId,
      actorUserId,
      reason: `Approved/disbursed salary advance for ${employee.employeeNumber} was recorded for payroll recovery from ${recoveryStartDate}.`,
      prismaClient: tx,
    });
    return { ...rows[0], ...value };
  });
}

module.exports = {
  policyError,
  repaymentPlan,
  assertZermattOrganization,
  recordApprovedDisbursedLoan,
  applyApprovedDisbursedLoanTopUp,
  recordApprovedDisbursedSalaryAdvance,
};