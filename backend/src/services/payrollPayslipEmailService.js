const prisma = require("../config/prisma");

function text(value) {
  return String(value ?? "").trim();
}

function money(value, currency = "NGN") {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: currency || "NGN",
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency || "NGN"} ${amount.toLocaleString("en-NG")}`;
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[character]));
}

function json(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return {}; }
}

function payrollEmailError(code, message, statusCode = 400, details) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

async function loadApprovedPayslip({ organizationId, payrollRunLineId, prismaClient = prisma }) {
  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT
        pl."id",pl."runId",pl."employeeId",pl."employeeNumber",pl."employeeName",pl."currency",
        pl."baseSalary",pl."allowances",pl."deductions",pl."advanceRecovery",pl."loanRecovery",
        pl."grossPay",pl."netPreview",pl."details",
        pr."status" AS "runStatus",pr."approvedAt",
        pp."code" AS "periodCode",pp."name" AS "periodName",pp."periodStart",pp."periodEnd",pp."payDate",
        e."email" AS "employeeEmail",d."name" AS "designation",
        loan."loanOutstandingBalance",
        o."name" AS "organizationName",o."legalName" AS "organizationLegalName",o."logoUrl" AS "organizationLogoUrl"
      FROM "payroll_run_lines" pl
      JOIN "payroll_runs" pr ON pr."id"=pl."runId" AND pr."organizationId"=pl."organizationId"
      JOIN "payroll_periods" pp ON pp."id"=pr."periodId" AND pp."organizationId"=pr."organizationId"
      JOIN "employees" e ON e."id"=pl."employeeId" AND e."organizationId"=pl."organizationId"
      LEFT JOIN "designations" d ON d."id"=e."designationId" AND d."organizationId"=e."organizationId"
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(l."outstandingAmount") FILTER (WHERE l."status" IN ('ACTIVE','PAUSED')),0) AS "loanOutstandingBalance"
        FROM "payroll_loans" l
        WHERE l."organizationId"=pl."organizationId" AND l."employeeId"=pl."employeeId"
      ) loan ON TRUE
      JOIN "organizations" o ON o."id"=pl."organizationId"
     WHERE pl."organizationId"=$1 AND pl."id"=$2
     LIMIT 1`,
    organizationId,
    payrollRunLineId
  );
  const row = rows[0];
  if (!row) throw payrollEmailError("PAYSLIP_NOT_FOUND", "Payroll payslip line was not found.", 404);
  if (row.runStatus !== "APPROVED") {
    throw payrollEmailError(
      "PAYSLIP_EMAIL_REQUIRES_APPROVED_PAYROLL",
      "Only payslips generated from an approved payroll can be emailed to employees.",
      409
    );
  }
  if (!text(row.employeeEmail)) {
    throw payrollEmailError(
      "EMPLOYEE_EMAIL_REQUIRED",
      `Employee ${row.employeeNumber} does not have an email address in the employee record.`,
      409,
      { employeeNumber: row.employeeNumber }
    );
  }
  return {
    ...row,
    baseSalary: Number(row.baseSalary || 0),
    allowances: Number(row.allowances || 0),
    deductions: Number(row.deductions || 0),
    advanceRecovery: Number(row.advanceRecovery || 0),
    loanRecovery: Number(row.loanRecovery || 0),
    loanOutstandingBalance: Number(row.loanOutstandingBalance || 0),
    runningLoanBalance: Number(row.loanOutstandingBalance || 0),
    grossPay: Number(row.grossPay || 0),
    netPreview: Number(row.netPreview || 0),
    details: json(row.details),
    periodStart: row.periodStart ? new Date(row.periodStart).toISOString().slice(0, 10) : null,
    periodEnd: row.periodEnd ? new Date(row.periodEnd).toISOString().slice(0, 10) : null,
    payDate: row.payDate ? new Date(row.payDate).toISOString().slice(0, 10) : null,
  };
}

function buildPayslipEmail(row) {
  const details = row.details || {};
  const statutory = details.statutory || {};
  const structure = details.salaryStructure || {};
  const attendance = details.attendance || {};
  const leaveAllowance = Number(details.leaveAllowance?.amount || 0);
  const customAllowances = details.customAllowances || [];
  const customDeductions = details.customDeductions || [];
  const componentRow = (item) => [
    [text(item.code), text(item.name)].filter(Boolean).join(" — ") || "Payroll Component",
    Number(item.value || 0),
  ];
  const organizationName = row.organizationLegalName || row.organizationName || "CHRiS Organization";
  const logoUrl = text(row.organizationLogoUrl);
  const logo = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(organizationName)} logo" class="organization-logo">`
    : "";
  const watermark = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="" class="watermark">`
    : `<div class="watermark-text">${escapeHtml(organizationName)}</div>`;

  const rows = [
    ["Basic", structure.basic ?? row.baseSalary],
    ...Object.entries(structure)
      .filter(([key]) => key !== "basic")
      .map(([key, value]) => [key.charAt(0).toUpperCase() + key.slice(1), value]),
    ...customAllowances.map(componentRow),
    ["Taxable Gross Pay", row.grossPay, true],
    ["PAYE", statutory.payeTax || 0],
    ["Pension", statutory.employeePension || 0],
    ...customDeductions.map(componentRow),
    ["Salary Advance Recovery", row.advanceRecovery],
    ["Loan Recovery", row.loanRecovery],
    ...(leaveAllowance > 0 ? [["Leave Allowance · After Tax / Non-taxable", leaveAllowance, true]] : []),
    ["Net Pay", row.netPreview, true],
  ];

  const detailItems = [
    ["Employee Name", row.employeeName || "—"],
    ["Employee Number", row.employeeNumber || "—"],
    ["Designation", row.designation || "—"],
    ["Payroll Period", `${row.periodStart || "—"} → ${row.periodEnd || "—"}`],
    ["Pay Date", row.payDate || "—"],
    ["Worked Days", attendance.payableDays != null ? `${attendance.payableDays} / ${attendance.standardDays}` : "—"],
    ["Attendance Source", text(attendance.source || attendance.sourceLabel) || "STANDARD DAYS DEFAULT"],
    ["Status", row.runStatus === "APPROVED" ? "Approved Payroll" : row.runStatus || "—"],
  ];

  const ledgerRows = rows.map(([label, amount, strong], index) =>
    `<tr class="${strong ? "strong-row" : ""}${index === rows.length - 1 ? " net-row" : ""}"><td>${escapeHtml(label)}</td><td>${escapeHtml(money(amount, row.currency))}</td></tr>`
  ).join("");

  const documentHtml = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(organizationName)} Payslip</title><style>
    *{box-sizing:border-box}body{margin:0;background:#f7f3e8;color:#17211c;font-family:Arial,Helvetica,sans-serif}.payslip{position:relative;width:100%;max-width:794px;min-height:0;margin:0 auto;padding:38px 53px 34px;overflow:hidden;background:#f7f3e8}.document-content{position:relative;z-index:1}.organization-header{text-align:center;padding-bottom:8px;border-bottom:2px solid #0b6b43}.organization-logo{display:block;max-width:92px;max-height:48px;margin:0 auto 5px;object-fit:contain}.organization-name{margin:0;color:#064e3b;font-size:17px;line-height:1.18}.document-title{margin:4px 0 0;color:#9a7410;font-size:11px;letter-spacing:.12em;text-transform:uppercase}.watermark{position:absolute;z-index:0;top:52%;left:50%;width:46%;max-width:300px;max-height:300px;transform:translate(-50%,-50%);object-fit:contain;opacity:.10;filter:grayscale(100%);pointer-events:none}.watermark-text{position:absolute;z-index:0;top:52%;left:50%;transform:translate(-50%,-50%) rotate(-28deg);width:78%;text-align:center;color:#064e3b;opacity:.09;font-size:42pt;font-weight:900;letter-spacing:.08em;pointer-events:none}.reference{margin:8px 0 8px;text-align:center;color:#475569;font-size:8.5pt}.details{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-bottom:9px}.detail{padding:6px 8px;border:1px solid #d8c788;border-radius:6px;background:#f7f3e8}.detail span{display:block;margin-bottom:2px;color:#64748b;font-size:6.8pt;text-transform:uppercase;letter-spacing:.04em}.detail strong{font-size:8.2pt;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;background:#f7f3e8}th,td{padding:5px 8px;border-bottom:1px solid #d8dee2;font-size:8.2pt}th{background:#f7f3e8;color:#064e3b;text-align:left;text-transform:uppercase;letter-spacing:.06em;font-size:7pt;border-bottom:2px solid #064e3b}th:last-child,td:last-child{text-align:right}.strong-row td{font-weight:700;color:#064e3b}.net-row td{border-top:2px solid #9a7410;border-bottom:2px solid #9a7410;font-size:9.5pt}.payment-summary{margin-top:8px;padding-top:7px;border-top:2px solid #064e3b}.payment-title{margin:0 0 5px;color:#9a7410;font-size:7.2pt;font-weight:800;text-transform:uppercase;letter-spacing:.08em}.payment-item{padding:6px 8px;border:1px solid #d8c788;border-radius:6px;background:#f7f3e8}.payment-item span{display:inline;margin-right:8px;color:#64748b;font-size:6.8pt;text-transform:uppercase;letter-spacing:.04em}.payment-item strong{font-size:8.2pt}.footer{display:flex;justify-content:space-between;gap:12px;margin-top:8px;padding-top:6px;border-top:1px solid #94a3b8;color:#64748b;font-size:6.8pt}@media(max-width:640px){.payslip{padding:22px 18px}.details{grid-template-columns:1fr}}@media print{@page{size:A4 portrait;margin:0}body{print-color-adjust:exact;-webkit-print-color-adjust:exact}.payslip{width:210mm;padding:10mm 14mm 9mm}}
  </style></head><body><article class="payslip">${watermark}<div class="document-content"><header class="organization-header">${logo}<h1 class="organization-name">${escapeHtml(organizationName)}</h1><h2 class="document-title">Employee Payslip</h2></header><p class="reference">${escapeHtml(row.periodCode)} · ${escapeHtml(row.employeeNumber)}</p><section class="details">${detailItems.map(([label, value]) => `<div class="detail"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}</section><table><thead><tr><th>Earnings / Deductions</th><th>Amount</th></tr></thead><tbody>${ledgerRows}</tbody></table><section class="payment-summary"><h3 class="payment-title">Loan Summary</h3><div class="payment-item"><span>Running Loan Balance</span><strong>${escapeHtml(money(row.runningLoanBalance, row.currency))}</strong></div></section><footer class="footer"><span>Generated from an approved CHRiS payroll run.</span><span>Powered by CHRiS</span></footer></div></article></body></html>`;

  const plainText = [
    organizationName,
    `Employee Payslip — ${row.periodName || row.periodCode}`,
    `Employee Name: ${row.employeeName || "—"}`,
    `Employee Number: ${row.employeeNumber || "—"}`,
    `Designation: ${row.designation || "—"}`,
    `Payroll Period: ${row.periodStart || "—"} to ${row.periodEnd || "—"}`,
    `Pay Date: ${row.payDate || "—"}`,
    `Running Loan Balance: ${money(row.runningLoanBalance, row.currency)}`,
    "",
    ...rows.map(([label, amount]) => `${label}: ${money(amount, row.currency)}`),
    "",
    "Generated from an approved CHRiS payroll run.",
  ].join("\n");

  const filename = `ZERMATT-Payslip-${String(row.periodCode || row.periodName || "Payroll").replace(/[^A-Za-z0-9._-]+/g, "-")}-${String(row.employeeNumber || "Employee").replace(/[^A-Za-z0-9._-]+/g, "-")}.html`;
  const emailIntro = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:794px;margin:0 auto 12px;color:#17211c"><p>Dear ${escapeHtml(row.employeeName)},</p><p>Your approved payroll payslip for <strong>${escapeHtml(row.periodName || row.periodCode)}</strong> is below. The same official payslip is attached for download, saving and printing.</p></div>`;

  return {
    subject: `${organizationName} Payslip — ${row.periodName || row.periodCode} — ${row.employeeNumber}`,
    html: emailIntro + documentHtml,
    plainText,
    attachment: {
      filename,
      content: Buffer.from(documentHtml, "utf8").toString("base64"),
      contentType: "text/html; charset=utf-8",
    },
  };
}

async function sendViaResend({ to, subject, html, plainText, attachment }) {
  const apiKey = text(process.env.RESEND_API_KEY);
  if (!apiKey) return null;
  const from = text(process.env.PAYROLL_EMAIL_FROM || process.env.RESEND_FROM) || "CHRiS Payroll <noreply@crnetwork.com.ng>";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
      text: plainText,
      attachments: attachment ? [{ filename: attachment.filename, content: attachment.content, content_type: attachment.contentType }] : undefined,
    }),
  });
  let body = null;
  try { body = await response.json(); } catch { body = null; }
  if (!response.ok) {
    throw payrollEmailError(
      "PAYSLIP_EMAIL_DELIVERY_FAILED",
      `Payslip email delivery failed: ${body?.message || body?.name || `HTTP ${response.status}`}`,
      502
    );
  }
  return { status: "SENT", channel: "RESEND_API", providerMessageId: body?.id || null };
}

async function sendViaWebhook({ to, subject, html, plainText, row }) {
  const webhook = text(process.env.PAYROLL_EMAIL_WEBHOOK_URL);
  if (!webhook) return null;
  const response = await fetch(webhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "APPROVED_PAYSLIP",
      to,
      subject,
      html,
      text: plainText,
      payrollRunId: row.runId,
      payrollRunLineId: row.id,
      employeeNumber: row.employeeNumber,
      periodCode: row.periodCode,
    }),
  });
  if (!response.ok) {
    throw payrollEmailError("PAYSLIP_EMAIL_DELIVERY_FAILED", `Payslip email webhook returned HTTP ${response.status}.`, 502);
  }
  return { status: "SENT", channel: "PAYROLL_EMAIL_WEBHOOK", providerMessageId: null };
}

async function sendApprovedPayslipEmail({ organizationId, actorUserId, payrollRunLineId, prismaClient = prisma }) {
  const row = await loadApprovedPayslip({ organizationId, payrollRunLineId, prismaClient });
  const email = buildPayslipEmail(row);

  let delivery = await sendViaResend({
    to: text(row.employeeEmail),
    subject: email.subject,
    html: email.html,
    plainText: email.plainText,
    attachment: email.attachment,
  });
  if (!delivery) {
    delivery = await sendViaWebhook({
      to: text(row.employeeEmail),
      subject: email.subject,
      html: email.html,
      plainText: email.plainText,
      row,
    });
  }
  if (!delivery) {
    delivery = {
      status: "PENDING_CONFIGURATION",
      channel: "EMAIL",
      providerMessageId: null,
    };
  }

  await prismaClient.organizationAudit.create({
    data: {
      organizationId,
      actorUserId: actorUserId || null,
      entityType: "PayrollPayslipEmail",
      entityId: row.id,
      action: delivery.status === "SENT" ? "SENT" : "DELIVERY_PENDING_CONFIGURATION",
      newValue: {
        employeeId: row.employeeId,
        employeeNumber: row.employeeNumber,
        employeeEmail: row.employeeEmail,
        payrollRunId: row.runId,
        periodCode: row.periodCode,
        deliveryStatus: delivery.status,
        channel: delivery.channel,
        providerMessageId: delivery.providerMessageId,
      },
      reason: "Approved payroll payslip email delivery",
    },
  });

  return {
    payrollRunLineId: row.id,
    employeeNumber: row.employeeNumber,
    employeeName: row.employeeName,
    email: row.employeeEmail,
    periodCode: row.periodCode,
    ...delivery,
  };
}

module.exports = {
  buildPayslipEmail,
  loadApprovedPayslip,
  sendApprovedPayslipEmail,
  payrollEmailError,
};
