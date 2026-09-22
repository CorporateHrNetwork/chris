const crypto = require("crypto");
const tls = require("tls");
const prisma = require("../config/prisma");

function text(value) { return String(value ?? "").trim(); }
function escapeHtml(value) {
  return text(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function money(value) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 }).format(Number(value || 0));
}
function hashToken(value) { return crypto.createHash("sha256").update(value).digest("hex"); }

async function loadLoanContext({ organizationId, loanId, prismaClient = prisma }) {
  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT l."id",l."loanNumber",l."status",l."purpose",l."principalAmount",l."installmentAmount",l."applicationVersion",
            l."workflowLocationId",l."createdByUserId",e."employeeNumber",
            CONCAT_WS(' ',e."firstName",e."middleName",e."lastName") AS "employeeName",
            ol."name" AS "locationName",d."name" AS "departmentName",des."name" AS "designationName",
            creator."email" AS "originatorEmail",CONCAT_WS(' ',creator."firstName",creator."lastName") AS "originatorName"
       FROM "payroll_loans" l
       JOIN "employees" e ON e."id"=l."employeeId" AND e."organizationId"=l."organizationId"
       LEFT JOIN "organization_locations" ol ON ol."id"=l."workflowLocationId" AND ol."organizationId"=l."organizationId"
       LEFT JOIN "departments" d ON d."id"=e."departmentId" AND d."organizationId"=e."organizationId"
       LEFT JOIN "designations" des ON des."id"=e."designationId" AND des."organizationId"=e."organizationId"
       LEFT JOIN "users" creator ON creator."id"=l."createdByUserId" AND creator."organizationId"=l."organizationId"
      WHERE l."organizationId"=$1 AND l."id"=$2 LIMIT 1`,
    organizationId,
    loanId
  );
  if (!rows[0]) {
    const error = new Error("Loan application not found.");
    error.code = "LOAN_NOT_FOUND";
    error.statusCode = 404;
    throw error;
  }
  const row = rows[0];
  return {
    ...row,
    principalAmount: Number(row.principalAmount || 0),
    installmentAmount: Number(row.installmentAmount || 0),
  };
}

async function resolveRoleRecipients({ organizationId, locationId, workflowRoles, prismaClient = prisma }) {
  const [rules, users] = await Promise.all([
    prismaClient.$queryRawUnsafe(
      `SELECT "workflowRole","roleAliases","locationScoped","actionAuthority"
         FROM "payroll_loan_recipient_rules"
        WHERE "organizationId"=$1 AND "isActive"=true AND "receivesEmail"=true`,
      organizationId
    ),
    prismaClient.$queryRawUnsafe(
      `SELECT u."id",u."email",u."firstName",u."lastName",u."locationScope",r."name" AS "roleName",ul."locationId"
         FROM "users" u
         JOIN "user_roles" ur ON ur."userId"=u."id"
         JOIN "roles" r ON r."id"=ur."roleId"
         LEFT JOIN "user_locations" ul ON ul."userId"=u."id" AND ul."organizationId"=u."organizationId"
        WHERE u."organizationId"=$1 AND u."isActive"=true`,
      organizationId
    ),
  ]);

  const wanted = new Set((workflowRoles || []).map((item) => String(item).toUpperCase()));
  const results = [];
  for (const rule of rules) {
    if (!wanted.has(String(rule.workflowRole).toUpperCase())) continue;
    const aliases = Array.isArray(rule.roleAliases) ? rule.roleAliases : [];
    const aliasSet = new Set(aliases.map((alias) => String(alias).trim().toLowerCase()));
    for (const user of users) {
      if (!aliasSet.has(String(user.roleName || "").trim().toLowerCase())) continue;
      if (rule.locationScoped && locationId && user.locationScope !== "ALL_LOCATIONS" && user.locationId !== locationId) continue;
      results.push({
        userId: user.id,
        email: user.email,
        name: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
        workflowRole: rule.workflowRole,
        actionAuthority: rule.actionAuthority,
      });
    }
  }

  const unique = new Map();
  for (const row of results) {
    const key = `${row.userId}|${row.workflowRole}`;
    if (!unique.has(key)) unique.set(key, row);
  }
  return Array.from(unique.values());
}

async function createGmApprovalTokens({ organizationId, loanId, recipients, expiresHours = 72, prismaClient = prisma }) {
  const tokens = new Map();
  const gmRecipients = (recipients || []).filter((row) => row.actionAuthority === "GM_APPROVE");
  await prismaClient.$executeRawUnsafe(
    `UPDATE "payroll_loan_email_approval_tokens" SET "revokedAt"=CURRENT_TIMESTAMP
      WHERE "organizationId"=$1 AND "loanId"=$2 AND "usedAt" IS NULL AND "revokedAt" IS NULL`,
    organizationId,
    loanId
  );
  for (const recipient of gmRecipients) {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);
    const id = crypto.randomUUID();
    await prismaClient.$executeRawUnsafe(
      `INSERT INTO "payroll_loan_email_approval_tokens"
        ("id","organizationId","loanId","approverUserId","tokenHash","expiresAt")
       VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP + ($6 || ' hours')::interval)`,
      id,
      organizationId,
      loanId,
      recipient.userId,
      tokenHash,
      String(expiresHours)
    );
    tokens.set(recipient.userId, rawToken);
  }
  return tokens;
}

function approvalUrl(rawToken) {
  const base = text(process.env.CHRIS_APP_URL || process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
  return `${base}/loans?approvalToken=${encodeURIComponent(rawToken)}`;
}

function buildEmail({ stage, context, recipient, rawApprovalToken }) {
  const employee = `${context.employeeNumber} — ${context.employeeName}`;
  const baseLines = [
    `Employee: ${employee}`,
    `Branch/Location: ${context.locationName || "Not assigned"}`,
    `Loan: ${context.loanNumber}`,
    `Loan Type: ${context.purpose || "Not specified"}`,
    `Amount: ${money(context.principalAmount)}`,
    `Proposed Installment: ${money(context.installmentAmount)}`,
    `Application Version: ${context.applicationVersion || 1}`,
  ];
  let subject = `[CHRiS] Loan workflow update · ${context.loanNumber} · ${employee}`;
  let heading = "Loan Workflow Update";
  let actionText = "";
  let actionLink = "";

  if (stage === "HR_VERIFICATION_REQUEST") {
    subject = `[CHRiS] HR verification required · ${context.loanNumber} · ${employee}`;
    heading = "Loan Application Pending HR Verification";
    if (recipient.actionAuthority === "HR_VERIFY") actionText = "Open CHRiS Loans to verify or return this application.";
  } else if (stage === "GM_APPROVAL_REQUEST") {
    subject = `[CHRiS] GM approval required · ${context.loanNumber} · ${employee}`;
    heading = "Loan Application Verified by HR — Pending GM Approval";
    if (recipient.actionAuthority === "GM_APPROVE" && rawApprovalToken) {
      actionText = "Review and decide this application in CHRiS using the secure approval link below. Authentication is still required.";
      actionLink = approvalUrl(rawApprovalToken);
    } else {
      actionText = "This notification is for workflow visibility. The General Manager is the approval action owner.";
    }
  } else if (stage === "GM_APPROVED") {
    subject = `[CHRiS] Loan approved — disbursement required · ${context.loanNumber} · ${employee}`;
    heading = "General Manager Approved Loan Application";
    actionText = recipient.actionAuthority === "DISBURSE"
      ? "Chief Accountant action required: open CHRiS Loans and process the approved loan for disbursement."
      : "The approved application has moved to the Chief Accountant for disbursement processing.";
  } else if (stage === "RETURNED_FOR_CORRECTION") {
    subject = `[CHRiS] Loan application returned for correction · ${context.loanNumber} · ${employee}`;
    heading = "Loan Application Returned for Correction";
    actionText = "The originating HR & Admin Officer should correct the application and resubmit it for HR verification.";
  } else if (stage === "REJECTED") {
    subject = `[CHRiS] Loan application rejected · ${context.loanNumber} · ${employee}`;
    heading = "Loan Application Rejected";
  } else if (stage === "DISBURSED") {
    subject = `[CHRiS] Loan disbursed and activated · ${context.loanNumber} · ${employee}`;
    heading = "Loan Disbursement Confirmed";
    actionText = "The loan is now ACTIVE and will be included in payroll from its configured recovery month. The outstanding balance reduces only when payroll is approved.";
  }

  const bodyText = [heading, "", ...baseLines, "", actionText, actionLink].filter(Boolean).join("\n");
  const bodyHtml = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#18251f">
    <h2 style="color:#0b5a43">${escapeHtml(heading)}</h2>
    <p>${baseLines.map((line) => escapeHtml(line)).join("<br>")}</p>
    ${actionText ? `<p>${escapeHtml(actionText)}</p>` : ""}
    ${actionLink ? `<p><a href="${escapeHtml(actionLink)}" style="display:inline-block;padding:10px 16px;background:#b8992e;color:#111;text-decoration:none;font-weight:bold;border-radius:6px">Review Loan Application</a></p>` : ""}
    <p style="font-size:12px;color:#66736d">CHRiS — CorporateHR Network Information System. This message is generated from the auditable loan workflow.</p>
  </body></html>`;
  return { subject, bodyText, bodyHtml };
}

async function attachmentIdsForLoan({ organizationId, loanId, prismaClient = prisma }) {
  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT "id" FROM "payroll_loan_attachments" WHERE "organizationId"=$1 AND "loanId"=$2 ORDER BY "createdAt" ASC`,
    organizationId,
    loanId
  );
  return rows.map((row) => row.id);
}

async function queueLoanNotifications({ organizationId, loanId, stage, workflowRoles, includeOriginator = true, gmApprovalTokens = null, prismaClient = prisma }) {
  const context = await loadLoanContext({ organizationId, loanId, prismaClient });
  const recipients = await resolveRoleRecipients({ organizationId, locationId: context.workflowLocationId, workflowRoles, prismaClient });
  if (includeOriginator && context.originatorEmail) {
    recipients.push({
      userId: context.createdByUserId,
      email: context.originatorEmail,
      name: context.originatorName || context.originatorEmail,
      workflowRole: "ORIGINATING_HR_ADMIN",
      actionAuthority: "VISIBILITY",
    });
  }
  const unique = new Map();
  for (const recipient of recipients) {
    if (!recipient.email) continue;
    const key = `${recipient.email.toLowerCase()}|${recipient.workflowRole}`;
    if (!unique.has(key)) unique.set(key, recipient);
  }
  const attachmentIds = await attachmentIdsForLoan({ organizationId, loanId, prismaClient });
  const queued = [];
  for (const recipient of unique.values()) {
    const rawApprovalToken = gmApprovalTokens?.get(recipient.userId) || null;
    const email = buildEmail({ stage, context, recipient, rawApprovalToken });
    const id = crypto.randomUUID();
    await prismaClient.$executeRawUnsafe(
      `INSERT INTO "payroll_loan_notification_outbox"
        ("id","organizationId","loanId","recipientUserId","recipientRole","toEmail","subject","textBody","htmlBody","attachmentIds")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
      id,
      organizationId,
      loanId,
      recipient.userId || null,
      recipient.workflowRole,
      recipient.email,
      email.subject,
      email.bodyText,
      email.bodyHtml,
      JSON.stringify(attachmentIds)
    );
    queued.push(id);
  }
  return { queued, recipients: Array.from(unique.values()) };
}

function smtpConfigured() {
  return Boolean(text(process.env.CHRIS_SMTP_HOST) && text(process.env.CHRIS_SMTP_USER) && text(process.env.CHRIS_SMTP_PASS));
}

function readSmtpResponse(socket) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const onData = (chunk) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1] || "";
      if (/^\d{3} /.test(last)) {
        cleanup();
        const code = Number(last.slice(0, 3));
        if (code >= 400) reject(new Error(`SMTP ${last}`)); else resolve({ code, text: buffer });
      }
    };
    const onError = (error) => { cleanup(); reject(error); };
    const cleanup = () => { socket.off("data", onData); socket.off("error", onError); };
    socket.on("data", onData); socket.on("error", onError);
  });
}

async function smtpCommand(socket, command, expected = [250]) {
  socket.write(`${command}\r\n`);
  const response = await readSmtpResponse(socket);
  if (!expected.includes(response.code)) throw new Error(`Unexpected SMTP response ${response.code} for ${command.split(" ")[0]}.`);
  return response;
}

function mimeMessage({ from, to, subject, textBody, htmlBody, attachments }) {
  const boundary = `chris_${crypto.randomBytes(12).toString("hex")}`;
  const alt = `alt_${crypto.randomBytes(12).toString("hex")}`;
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    `Content-Type: multipart/alternative; boundary="${alt}"`,
    "",
    `--${alt}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    "",
    textBody,
    "",
    `--${alt}`,
    `Content-Type: text/html; charset="UTF-8"`,
    "",
    htmlBody || `<pre>${escapeHtml(textBody)}</pre>`,
    "",
    `--${alt}--`,
  ];
  for (const attachment of attachments || []) {
    lines.push(
      `--${boundary}`,
      `Content-Type: ${attachment.mimeType || "application/octet-stream"}; name="${attachment.fileName.replace(/"/g, "")}"`,
      `Content-Disposition: attachment; filename="${attachment.fileName.replace(/"/g, "")}"`,
      `Content-Transfer-Encoding: base64`,
      "",
      Buffer.from(attachment.content).toString("base64").match(/.{1,76}/g)?.join("\r\n") || "",
      ""
    );
  }
  lines.push(`--${boundary}--`, "");
  return lines.join("\r\n").replace(/\r\n\.\r\n/g, "\r\n..\r\n");
}

async function sendSmtp({ to, subject, textBody, htmlBody, attachments }) {
  const host = text(process.env.CHRIS_SMTP_HOST);
  const port = Number(process.env.CHRIS_SMTP_PORT || 465);
  const user = text(process.env.CHRIS_SMTP_USER);
  const pass = text(process.env.CHRIS_SMTP_PASS);
  const from = text(process.env.CHRIS_SMTP_FROM || user);
  const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: process.env.CHRIS_SMTP_REJECT_UNAUTHORIZED !== "false" });
  await new Promise((resolve, reject) => { socket.once("secureConnect", resolve); socket.once("error", reject); });
  await readSmtpResponse(socket);
  await smtpCommand(socket, `EHLO chris`, [250]);
  await smtpCommand(socket, `AUTH LOGIN`, [334]);
  await smtpCommand(socket, Buffer.from(user).toString("base64"), [334]);
  await smtpCommand(socket, Buffer.from(pass).toString("base64"), [235]);
  await smtpCommand(socket, `MAIL FROM:<${from}>`, [250]);
  await smtpCommand(socket, `RCPT TO:<${to}>`, [250, 251]);
  await smtpCommand(socket, `DATA`, [354]);
  socket.write(`${mimeMessage({ from, to, subject, textBody, htmlBody, attachments })}\r\n.\r\n`);
  const sent = await readSmtpResponse(socket);
  if (sent.code !== 250) throw new Error(`SMTP delivery failed: ${sent.text}`);
  try { await smtpCommand(socket, "QUIT", [221]); } catch (_) { /* socket may close after acceptance */ }
  socket.end();
}

async function deliverNotification({ notificationId, prismaClient = prisma }) {
  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT * FROM "payroll_loan_notification_outbox" WHERE "id"=$1 LIMIT 1`,
    notificationId
  );
  const notification = rows[0];
  if (!notification || notification.status === "SENT") return { status: notification?.status || "NOT_FOUND" };
  if (!smtpConfigured()) return { status: "QUEUED", reason: "SMTP_NOT_CONFIGURED" };
  const attachmentIds = Array.isArray(notification.attachmentIds) ? notification.attachmentIds : [];
  const attachments = attachmentIds.length
    ? await prismaClient.$queryRawUnsafe(
        `SELECT "fileName","mimeType","content" FROM "payroll_loan_attachments" WHERE "organizationId"=$1 AND "id"=ANY($2::text[])`,
        notification.organizationId,
        attachmentIds
      )
    : [];
  try {
    await sendSmtp({ to: notification.toEmail, subject: notification.subject, textBody: notification.textBody, htmlBody: notification.htmlBody, attachments });
    await prismaClient.$executeRawUnsafe(
      `UPDATE "payroll_loan_notification_outbox" SET "status"='SENT',"attempts"="attempts"+1,"lastError"=NULL,"sentAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1`,
      notificationId
    );
    return { status: "SENT" };
  } catch (error) {
    await prismaClient.$executeRawUnsafe(
      `UPDATE "payroll_loan_notification_outbox" SET "status"='FAILED',"attempts"="attempts"+1,"lastError"=$2,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1`,
      notificationId,
      String(error.message || error).slice(0, 2000)
    );
    return { status: "FAILED", error: error.message };
  }
}

async function deliverQueued({ notificationIds, prismaClient = prisma }) {
  const results = [];
  for (const id of notificationIds || []) results.push({ id, ...(await deliverNotification({ notificationId: id, prismaClient })) });
  return results;
}

module.exports = {
  hashToken,
  loadLoanContext,
  resolveRoleRecipients,
  createGmApprovalTokens,
  queueLoanNotifications,
  deliverNotification,
  deliverQueued,
  smtpConfigured,
};
