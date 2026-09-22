const crypto = require("crypto");
const prisma = require("../config/prisma");
const { markDraftRunsRecalculationRequired } = require("./payrollDraftFreshnessService");
const {
  hashToken,
  resolveRoleRecipients,
  createGmApprovalTokens,
  queueLoanNotifications,
  deliverQueued,
} = require("./loanWorkflowNotificationService");

function workflowError(code, message, statusCode = 400, details) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.details = details;
  return error;
}
function text(value) { return String(value ?? "").trim(); }
function positiveMoney(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw workflowError("INVALID_LOAN_AMOUNT", `${label} must be greater than zero.`);
  return Math.round(number * 100) / 100;
}
function dateOnly(value, label) {
  const raw = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw workflowError("INVALID_DATE", `${label} must use YYYY-MM-DD.`);
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) throw workflowError("INVALID_DATE", `${label} is not a valid date.`);
  return raw;
}
function monthStart(value, label) {
  const date = dateOnly(value, label);
  return `${date.slice(0, 7)}-01`;
}
function employeeName(employee) { return [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(" "); }

async function resolveEmployee(client, organizationId, employeeNumber) {
  const normalized = text(employeeNumber).toUpperCase();
  if (!normalized) throw workflowError("EMPLOYEE_REQUIRED", "Employee is required.");
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
      departmentId: true,
      designationId: true,
    },
  });
  if (!employee) throw workflowError("EMPLOYEE_NOT_FOUND", `Employee ${normalized} was not found.`, 404);
  return employee;
}

async function getLoanForUpdate(client, organizationId, loanId) {
  const rows = await client.$queryRawUnsafe(
    `SELECT * FROM "payroll_loans" WHERE "organizationId"=$1 AND "id"=$2 FOR UPDATE`,
    organizationId,
    loanId
  );
  if (!rows[0]) throw workflowError("LOAN_NOT_FOUND", "Loan application not found.", 404);
  return rows[0];
}

async function getLoan(client, organizationId, loanId) {
  const rows = await client.$queryRawUnsafe(
    `SELECT l.*,e."employeeNumber",CONCAT_WS(' ',e."firstName",e."middleName",e."lastName") AS "employeeName",
            ol."name" AS "locationName"
       FROM "payroll_loans" l
       JOIN "employees" e ON e."id"=l."employeeId" AND e."organizationId"=l."organizationId"
       LEFT JOIN "organization_locations" ol ON ol."id"=l."workflowLocationId" AND ol."organizationId"=l."organizationId"
      WHERE l."organizationId"=$1 AND l."id"=$2 LIMIT 1`,
    organizationId,
    loanId
  );
  if (!rows[0]) throw workflowError("LOAN_NOT_FOUND", "Loan application not found.", 404);
  const row = rows[0];
  return {
    ...row,
    principalAmount: Number(row.principalAmount || 0),
    outstandingAmount: Number(row.outstandingAmount || 0),
    installmentAmount: Number(row.installmentAmount || 0),
  };
}

async function audit(client, { organizationId, actorUserId, loanId, action, previousValue, newValue, reason }) {
  await client.organizationAudit.create({
    data: {
      organizationId,
      actorUserId: actorUserId || null,
      entityType: "PayrollLoan",
      entityId: loanId,
      action,
      previousValue: previousValue || undefined,
      newValue: newValue || undefined,
      reason: text(reason) || null,
    },
  });
}

async function event(client, { organizationId, loanId, actorUserId, action, fromStatus, toStatus, comments, metadata }) {
  await client.$executeRawUnsafe(
    `INSERT INTO "payroll_loan_workflow_events"
      ("id","organizationId","loanId","action","fromStatus","toStatus","actorUserId","comments","metadata")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
    crypto.randomUUID(),
    organizationId,
    loanId,
    action,
    fromStatus || null,
    toStatus || null,
    actorUserId || null,
    text(comments) || null,
    JSON.stringify(metadata || {})
  );
}

async function createDraftApplication({ organizationId, actorUserId, input, purpose, prismaClient = prisma }) {
  const employee = await resolveEmployee(prismaClient, organizationId, input?.employeeNumber);
  const principalAmount = positiveMoney(input?.principalAmount, "Principal Amount");
  const installmentAmount = positiveMoney(input?.installmentAmount, "Installment Amount");
  if (installmentAmount > principalAmount) throw workflowError("INVALID_LOAN_INSTALLMENT", "Installment Amount cannot exceed Principal Amount.");
  const applicationDate = input?.applicationDate ? dateOnly(input.applicationDate, "Application Date") : new Date().toISOString().slice(0, 10);
  const id = crypto.randomUUID();
  const loanNumber = `LN-${employee.employeeNumber}-${id.slice(0, 8).toUpperCase()}`;
  const rows = await prismaClient.$queryRawUnsafe(
    `INSERT INTO "payroll_loans"
      ("id","organizationId","employeeId","loanNumber","principalAmount","outstandingAmount","installmentAmount",
       "applicationDate","status","purpose","notes","workflowLocationId","applicationVersion","createdByUserId")
     VALUES ($1,$2,$3,$4,$5,$5,$6,$7::date,'DRAFT',$8,$9,$10,1,$11)
     RETURNING *`,
    id,
    organizationId,
    employee.id,
    loanNumber,
    principalAmount,
    installmentAmount,
    applicationDate,
    text(purpose) || null,
    text(input?.notes) || null,
    employee.locationId || null,
    actorUserId || null
  );
  const created = {
    ...rows[0],
    employeeNumber: employee.employeeNumber,
    employeeName: employeeName(employee),
    principalAmount,
    outstandingAmount: principalAmount,
    installmentAmount,
  };
  await event(prismaClient, {
    organizationId,
    loanId: id,
    actorUserId,
    action: "LOAN_APPLICATION_DRAFT_CREATED",
    toStatus: "DRAFT",
    metadata: { employeeNumber: employee.employeeNumber, workflowLocationId: employee.locationId || null },
  });
  await audit(prismaClient, {
    organizationId,
    actorUserId,
    loanId: id,
    action: "LOAN_APPLICATION_DRAFT_CREATED",
    newValue: { loanNumber, employeeNumber: employee.employeeNumber, employeeName: employeeName(employee), principalAmount, installmentAmount, purpose, status: "DRAFT" },
    reason: input?.notes || "Branch HR & Admin created a loan application draft",
  });
  return created;
}

async function addApplicationForm({ organizationId, actorUserId, loanId, file, prismaClient = prisma }) {
  if (!file?.buffer?.length) throw workflowError("LOAN_APPLICATION_FORM_REQUIRED", "Select the completed loan application form to attach.");
  if (file.buffer.length > 10 * 1024 * 1024) throw workflowError("LOAN_ATTACHMENT_TOO_LARGE", "Loan application attachments must not exceed 10 MB.");
  const loan = await getLoan(prismaClient, organizationId, loanId);
  if (!["DRAFT", "RETURNED_FOR_CORRECTION"].includes(loan.status)) {
    throw workflowError("LOAN_APPLICATION_FROZEN", "Attachments can only be changed while the application is Draft or Returned for Correction.", 409);
  }
  const allowedTypes = new Set([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
  ]);
  if (!allowedTypes.has(file.mimetype)) throw workflowError("INVALID_LOAN_ATTACHMENT_TYPE", "Attach the completed loan form as PDF, JPG, PNG, DOC or DOCX.");
  const id = crypto.randomUUID();
  const sha256 = crypto.createHash("sha256").update(file.buffer).digest("hex");
  await prismaClient.$executeRawUnsafe(
    `INSERT INTO "payroll_loan_attachments"
      ("id","organizationId","loanId","category","fileName","mimeType","fileSize","sha256","content","uploadedByUserId")
     VALUES ($1,$2,$3,'LOAN_APPLICATION_FORM',$4,$5,$6,$7,$8,$9)`,
    id,
    organizationId,
    loanId,
    file.originalname || "Loan Application Form",
    file.mimetype,
    file.buffer.length,
    sha256,
    file.buffer,
    actorUserId || null
  );
  await event(prismaClient, {
    organizationId,
    loanId,
    actorUserId,
    action: "LOAN_APPLICATION_FORM_ATTACHED",
    fromStatus: loan.status,
    toStatus: loan.status,
    metadata: { attachmentId: id, fileName: file.originalname, sha256 },
  });
  return { id, fileName: file.originalname, mimeType: file.mimetype, fileSize: file.buffer.length, sha256 };
}

async function listAttachments({ organizationId, loanId, prismaClient = prisma }) {
  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT "id","category","fileName","mimeType","fileSize","sha256","createdAt"
       FROM "payroll_loan_attachments" WHERE "organizationId"=$1 AND "loanId"=$2 ORDER BY "createdAt" ASC`,
    organizationId,
    loanId
  );
  return rows;
}

async function getAttachment({ organizationId, loanId, attachmentId, prismaClient = prisma }) {
  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT "id","fileName","mimeType","fileSize","content" FROM "payroll_loan_attachments"
      WHERE "organizationId"=$1 AND "loanId"=$2 AND "id"=$3 LIMIT 1`,
    organizationId,
    loanId,
    attachmentId
  );
  if (!rows[0]) throw workflowError("LOAN_ATTACHMENT_NOT_FOUND", "Loan attachment not found.", 404);
  return rows[0];
}

async function submitForHrVerification({ organizationId, actorUserId, loanId, comments, prismaClient = prisma }) {
  let priorStatus = null;
  let version = 1;
  await prismaClient.$transaction(async (tx) => {
    const loan = await getLoanForUpdate(tx, organizationId, loanId);
    priorStatus = loan.status;
    if (!["DRAFT", "RETURNED_FOR_CORRECTION"].includes(loan.status)) {
      throw workflowError("INVALID_LOAN_WORKFLOW_STATE", `Loan application cannot be submitted for HR verification from ${loan.status}.`, 409);
    }
    const attachments = await tx.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS "count" FROM "payroll_loan_attachments" WHERE "organizationId"=$1 AND "loanId"=$2 AND "category"='LOAN_APPLICATION_FORM'`,
      organizationId,
      loanId
    );
    if (!Number(attachments[0]?.count || 0)) throw workflowError("LOAN_APPLICATION_FORM_REQUIRED", "Attach the completed loan application form before submission.", 409);
    version = Number(loan.applicationVersion || 1) + (loan.status === "RETURNED_FOR_CORRECTION" ? 1 : 0);
    await tx.$executeRawUnsafe(
      `UPDATE "payroll_loans" SET "status"='PENDING_HR_VERIFICATION',"submittedAt"=CURRENT_TIMESTAMP,"applicationVersion"=$3,"updatedAt"=CURRENT_TIMESTAMP
        WHERE "organizationId"=$1 AND "id"=$2`,
      organizationId,
      loanId,
      version
    );
    await event(tx, { organizationId, loanId, actorUserId, action: "SUBMITTED_FOR_HR_VERIFICATION", fromStatus: loan.status, toStatus: "PENDING_HR_VERIFICATION", comments, metadata: { applicationVersion: version } });
    await audit(tx, { organizationId, actorUserId, loanId, action: "SUBMITTED_FOR_HR_VERIFICATION", previousValue: { status: loan.status, applicationVersion: loan.applicationVersion }, newValue: { status: "PENDING_HR_VERIFICATION", applicationVersion: version }, reason: comments });
  });

  const notification = await queueLoanNotifications({
    organizationId,
    loanId,
    stage: "HR_VERIFICATION_REQUEST",
    workflowRoles: ["HEAD_HR_VERIFIER"],
    includeOriginator: true,
    prismaClient,
  });
  const delivery = await deliverQueued({ notificationIds: notification.queued, prismaClient });
  return { loanId, previousStatus: priorStatus, status: "PENDING_HR_VERIFICATION", applicationVersion: version, notifications: delivery };
}

async function hrVerificationDecision({ organizationId, actorUserId, loanId, decision, comments, prismaClient = prisma }) {
  const command = text(decision).toUpperCase();
  if (!["VERIFY", "RETURN", "REJECT"].includes(command)) throw workflowError("INVALID_HR_VERIFICATION_DECISION", "HR decision must be VERIFY, RETURN or REJECT.");
  let nextStatus = null;
  let workflowRoles = [];
  let stage = null;
  await prismaClient.$transaction(async (tx) => {
    const loan = await getLoanForUpdate(tx, organizationId, loanId);
    if (loan.status !== "PENDING_HR_VERIFICATION") throw workflowError("INVALID_LOAN_WORKFLOW_STATE", "Only a loan pending HR verification can be decided by Head HR.", 409);
    if (command === "VERIFY") nextStatus = "PENDING_GM_APPROVAL";
    if (command === "RETURN") nextStatus = "RETURNED_FOR_CORRECTION";
    if (command === "REJECT") nextStatus = "REJECTED";
    await tx.$executeRawUnsafe(
      `UPDATE "payroll_loans" SET "status"=$3,
          "hrVerifiedAt"=CASE WHEN $4='VERIFY' THEN CURRENT_TIMESTAMP ELSE "hrVerifiedAt" END,
          "hrVerifiedByUserId"=CASE WHEN $4='VERIFY' THEN $5 ELSE "hrVerifiedByUserId" END,
          "updatedAt"=CURRENT_TIMESTAMP WHERE "organizationId"=$1 AND "id"=$2`,
      organizationId,
      loanId,
      nextStatus,
      command,
      actorUserId || null
    );
    await event(tx, { organizationId, loanId, actorUserId, action: command === "VERIFY" ? "HR_VERIFIED_AND_FORWARDED_TO_GM" : command === "RETURN" ? "HR_RETURNED_FOR_CORRECTION" : "HR_REJECTED", fromStatus: loan.status, toStatus: nextStatus, comments });
    await audit(tx, { organizationId, actorUserId, loanId, action: command === "VERIFY" ? "HR_VERIFIED_AND_FORWARDED_TO_GM" : command === "RETURN" ? "HR_RETURNED_FOR_CORRECTION" : "HR_REJECTED", previousValue: { status: loan.status }, newValue: { status: nextStatus }, reason: comments });
  });

  let gmTokens = null;
  if (command === "VERIFY") {
    const loan = await getLoan(prismaClient, organizationId, loanId);
    const recipients = await resolveRoleRecipients({ organizationId, locationId: loan.workflowLocationId, workflowRoles: ["GM_APPROVER"], prismaClient });
    if (!recipients.some((recipient) => recipient.actionAuthority === "GM_APPROVE")) {
      throw workflowError("GM_APPROVER_NOT_CONFIGURED", "No active General Manager recipient is configured for this organization. The application remains pending GM approval.", 409);
    }
    gmTokens = await createGmApprovalTokens({ organizationId, loanId, recipients, prismaClient });
    workflowRoles = [
      "GM_APPROVER",
      "BRANCH_OPERATIONS_VISIBILITY",
      "INTERNAL_AUDITOR_VISIBILITY",
      "CHIEF_ACCOUNTANT_DISBURSEMENT",
      "BRANCH_ACCOUNTANT_VISIBILITY",
      "ACCOUNTS_OFFICER_VISIBILITY",
      "HEAD_HR_VERIFIER",
    ];
    stage = "GM_APPROVAL_REQUEST";
  } else if (command === "RETURN") {
    workflowRoles = ["HEAD_HR_VERIFIER"];
    stage = "RETURNED_FOR_CORRECTION";
  } else {
    workflowRoles = ["HEAD_HR_VERIFIER"];
    stage = "REJECTED";
  }

  const notification = await queueLoanNotifications({ organizationId, loanId, stage, workflowRoles, includeOriginator: true, gmApprovalTokens: gmTokens, prismaClient });
  const delivery = await deliverQueued({ notificationIds: notification.queued, prismaClient });
  return { loanId, status: nextStatus, notifications: delivery };
}

async function resolveEmailApprovalToken({ organizationId, token, actorUserId, prismaClient = prisma }) {
  const tokenHash = hashToken(text(token));
  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT t."id",t."loanId",t."approverUserId",t."expiresAt",t."usedAt",t."revokedAt",
            l."status",l."loanNumber",e."employeeNumber",CONCAT_WS(' ',e."firstName",e."middleName",e."lastName") AS "employeeName",
            l."purpose",l."principalAmount",l."installmentAmount"
       FROM "payroll_loan_email_approval_tokens" t
       JOIN "payroll_loans" l ON l."id"=t."loanId" AND l."organizationId"=t."organizationId"
       JOIN "employees" e ON e."id"=l."employeeId" AND e."organizationId"=l."organizationId"
      WHERE t."organizationId"=$1 AND t."tokenHash"=$2 LIMIT 1`,
    organizationId,
    tokenHash
  );
  const row = rows[0];
  if (!row) throw workflowError("LOAN_APPROVAL_LINK_INVALID", "This loan approval link is invalid.", 404);
  if (row.approverUserId !== actorUserId) throw workflowError("LOAN_APPROVAL_LINK_WRONG_USER", "This approval link was issued to another General Manager account.", 403);
  if (row.usedAt || row.revokedAt) throw workflowError("LOAN_APPROVAL_LINK_USED", "This loan approval link has already been used or revoked.", 409);
  if (new Date(row.expiresAt).getTime() < Date.now()) throw workflowError("LOAN_APPROVAL_LINK_EXPIRED", "This loan approval link has expired. Ask Head HR to resend the approval request.", 410);
  return {
    tokenId: row.id,
    loanId: row.loanId,
    status: row.status,
    loanNumber: row.loanNumber,
    employeeNumber: row.employeeNumber,
    employeeName: row.employeeName,
    purpose: row.purpose,
    principalAmount: Number(row.principalAmount || 0),
    installmentAmount: Number(row.installmentAmount || 0),
  };
}

async function gmDecision({ organizationId, actorUserId, loanId, decision, comments, token = null, prismaClient = prisma }) {
  const command = text(decision).toUpperCase();
  if (!["APPROVE", "REJECT", "RETURN"].includes(command)) throw workflowError("INVALID_GM_DECISION", "GM decision must be APPROVE, REJECT or RETURN.");
  let tokenRecord = null;
  if (token) tokenRecord = await resolveEmailApprovalToken({ organizationId, token, actorUserId, prismaClient });
  if (tokenRecord && tokenRecord.loanId !== loanId) throw workflowError("LOAN_APPROVAL_LINK_MISMATCH", "Approval link does not match this loan application.", 409);
  let nextStatus = null;
  await prismaClient.$transaction(async (tx) => {
    const loan = await getLoanForUpdate(tx, organizationId, loanId);
    if (loan.status !== "PENDING_GM_APPROVAL") throw workflowError("INVALID_LOAN_WORKFLOW_STATE", "Only a loan pending GM approval can be decided.", 409);
    nextStatus = command === "APPROVE" ? "AWAITING_DISBURSEMENT" : command === "RETURN" ? "RETURNED_FOR_CORRECTION" : "REJECTED";
    await tx.$executeRawUnsafe(
      `UPDATE "payroll_loans" SET "status"=$3,"gmDecisionAt"=CURRENT_TIMESTAMP,"gmDecisionByUserId"=$4,
          "approvedDate"=CASE WHEN $5='APPROVE' THEN CURRENT_DATE ELSE "approvedDate" END,
          "approvedByUserId"=CASE WHEN $5='APPROVE' THEN $4 ELSE "approvedByUserId" END,
          "updatedAt"=CURRENT_TIMESTAMP WHERE "organizationId"=$1 AND "id"=$2`,
      organizationId,
      loanId,
      nextStatus,
      actorUserId || null,
      command
    );
    await tx.$executeRawUnsafe(
      `UPDATE "payroll_loan_email_approval_tokens" SET "usedAt"=CURRENT_TIMESTAMP
        WHERE "organizationId"=$1 AND "loanId"=$2 AND "approverUserId"=$3 AND "usedAt" IS NULL AND "revokedAt" IS NULL`,
      organizationId,
      loanId,
      actorUserId
    );
    await tx.$executeRawUnsafe(
      `UPDATE "payroll_loan_email_approval_tokens" SET "revokedAt"=CURRENT_TIMESTAMP
        WHERE "organizationId"=$1 AND "loanId"=$2 AND "usedAt" IS NULL AND "revokedAt" IS NULL`,
      organizationId,
      loanId
    );
    await event(tx, { organizationId, loanId, actorUserId, action: command === "APPROVE" ? "GM_APPROVED" : command === "RETURN" ? "GM_RETURNED_FOR_CORRECTION" : "GM_REJECTED", fromStatus: loan.status, toStatus: nextStatus, comments });
    await audit(tx, { organizationId, actorUserId, loanId, action: command === "APPROVE" ? "GM_APPROVED" : command === "RETURN" ? "GM_RETURNED_FOR_CORRECTION" : "GM_REJECTED", previousValue: { status: loan.status }, newValue: { status: nextStatus }, reason: comments });
  });

  const workflowRoles = [
    "GM_APPROVER",
    "BRANCH_OPERATIONS_VISIBILITY",
    "INTERNAL_AUDITOR_VISIBILITY",
    "CHIEF_ACCOUNTANT_DISBURSEMENT",
    "BRANCH_ACCOUNTANT_VISIBILITY",
    "ACCOUNTS_OFFICER_VISIBILITY",
    "HEAD_HR_VERIFIER",
  ];
  const stage = command === "APPROVE" ? "GM_APPROVED" : command === "RETURN" ? "RETURNED_FOR_CORRECTION" : "REJECTED";
  const notification = await queueLoanNotifications({ organizationId, loanId, stage, workflowRoles, includeOriginator: true, prismaClient });
  const delivery = await deliverQueued({ notificationIds: notification.queued, prismaClient });
  return { loanId, status: nextStatus, notifications: delivery };
}

async function disburseApprovedLoan({ organizationId, actorUserId, loanId, input, prismaClient = prisma }) {
  const disbursedDate = dateOnly(input?.disbursedDate, "Disbursed Date");
  const requestedRecoveryDate = input?.recoveryStartDate || input?.recoveryStartMonth;
  const recoveryStartDate = monthStart(requestedRecoveryDate, "Recovery Start Date");
  if (recoveryStartDate.slice(0, 7) < disbursedDate.slice(0, 7)) {
    throw workflowError("INVALID_RECOVERY_START", "Recovery month cannot be earlier than the disbursement month.");
  }
  let previous = null;
  await prismaClient.$transaction(async (tx) => {
    const loan = await getLoanForUpdate(tx, organizationId, loanId);
    previous = loan;
    if (!["AWAITING_DISBURSEMENT", "GM_APPROVED", "APPROVED"].includes(loan.status)) {
      throw workflowError("LOAN_NOT_READY_FOR_DISBURSEMENT", "Only a GM-approved loan awaiting disbursement can be processed.", 409);
    }
    await tx.$executeRawUnsafe(
      `UPDATE "payroll_loans" SET "status"='ACTIVE',"disbursedDate"=$3::date,"recoveryStartDate"=$4::date,
          "disbursementReference"=$5,"notes"=CASE WHEN $6::text IS NULL OR $6='' THEN "notes" ELSE CONCAT_WS(' | ',"notes",$6) END,
          "updatedAt"=CURRENT_TIMESTAMP WHERE "organizationId"=$1 AND "id"=$2`,
      organizationId,
      loanId,
      disbursedDate,
      recoveryStartDate,
      text(input?.disbursementReference) || null,
      text(input?.notes) || null
    );
    await event(tx, { organizationId, loanId, actorUserId, action: "CHIEF_ACCOUNTANT_DISBURSED", fromStatus: loan.status, toStatus: "ACTIVE", comments: input?.notes, metadata: { disbursedDate, recoveryStartDate, disbursementReference: text(input?.disbursementReference) || null } });
    await audit(tx, { organizationId, actorUserId, loanId, action: "LOAN_DISBURSED", previousValue: { status: loan.status, disbursedDate: loan.disbursedDate, recoveryStartDate: loan.recoveryStartDate }, newValue: { status: "ACTIVE", disbursedDate, recoveryStartDate, disbursementReference: text(input?.disbursementReference) || null }, reason: input?.notes || "Chief Accountant confirmed loan disbursement" });
    await markDraftRunsRecalculationRequired({ organizationId, actorUserId, reason: `Loan ${loan.loanNumber} was disbursed/activated for payroll recovery from ${recoveryStartDate}.`, prismaClient: tx });
  });

  const workflowRoles = [
    "GM_APPROVER",
    "BRANCH_OPERATIONS_VISIBILITY",
    "INTERNAL_AUDITOR_VISIBILITY",
    "CHIEF_ACCOUNTANT_DISBURSEMENT",
    "BRANCH_ACCOUNTANT_VISIBILITY",
    "ACCOUNTS_OFFICER_VISIBILITY",
    "HEAD_HR_VERIFIER",
  ];
  const notification = await queueLoanNotifications({ organizationId, loanId, stage: "DISBURSED", workflowRoles, includeOriginator: true, prismaClient });
  const delivery = await deliverQueued({ notificationIds: notification.queued, prismaClient });
  return { ...(await getLoan(prismaClient, organizationId, loanId)), notifications: delivery, previousStatus: previous?.status };
}

async function getWorkflow({ organizationId, loanId, prismaClient = prisma }) {
  const [loan, attachments, events, notifications] = await Promise.all([
    getLoan(prismaClient, organizationId, loanId),
    listAttachments({ organizationId, loanId, prismaClient }),
    prismaClient.$queryRawUnsafe(
      `SELECT e."id",e."action",e."fromStatus",e."toStatus",e."comments",e."metadata",e."createdAt",
              CONCAT_WS(' ',u."firstName",u."lastName") AS "actorName",u."email" AS "actorEmail"
         FROM "payroll_loan_workflow_events" e LEFT JOIN "users" u ON u."id"=e."actorUserId"
        WHERE e."organizationId"=$1 AND e."loanId"=$2 ORDER BY e."createdAt" ASC`,
      organizationId,
      loanId
    ),
    prismaClient.$queryRawUnsafe(
      `SELECT "recipientRole","toEmail","status","attempts","lastError","sentAt","createdAt"
         FROM "payroll_loan_notification_outbox" WHERE "organizationId"=$1 AND "loanId"=$2 ORDER BY "createdAt" DESC`,
      organizationId,
      loanId
    ),
  ]);
  return { loan, attachments, events, notifications };
}

module.exports = {
  createDraftApplication,
  addApplicationForm,
  listAttachments,
  getAttachment,
  submitForHrVerification,
  hrVerificationDecision,
  resolveEmailApprovalToken,
  gmDecision,
  disburseApprovedLoan,
  getWorkflow,
};
