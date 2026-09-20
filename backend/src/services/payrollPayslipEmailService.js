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
        pay."bankName",pay."accountName",pay."accountNumber",
        loan."loanOutstandingBalance",
        o."name" AS "organizationName",o."legalName" AS "organizationLegalName",o."logoUrl" AS "organizationLogoUrl"
      FROM "payroll_run_lines" pl
      JOIN "payroll_runs" pr ON pr."id"=pl."runId" AND pr."organizationId"=pl."organizationId"
      JOIN "payroll_periods" pp ON pp."id"=pr."periodId" AND pp."organizationId"=pr."organizationId"
      JOIN "employees" e ON e."id"=pl."employeeId" AND e."organizationId"=pl."organizationId"
      LEFT JOIN "designations" d ON d."id"=e."designationId" AND d."organizationId"=e."organizationId"
      LEFT JOIN LATERAL (
        SELECT
          eo."sectionData"->'payment-details'->>'bankName' AS "bankName",
          eo."sectionData"->'payment-details'->>'accountName' AS "accountName",
          eo."sectionData"->'payment-details'->>'accountNumber' AS "accountNumber"
        FROM "employee_onboardings" eo
        WHERE eo."organizationId"=pl."organizationId" AND eo."employeeId"=pl."employeeId"
        ORDER BY eo."updatedAt" DESC, eo."createdAt" DESC
        LIMIT 1
      ) pay ON TRUE
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
  const customAllowances = (details.customAllowances || []).reduce((sum, item) => sum + Number(item.value || 0), 0);
  const customDeductions = (details.customDeductions || []).reduce((sum, item) => sum + Number(item.value || 0), 0);
  const organizationName = row.organizationLegalName || row.organizationName || "CHRiS Organization";
  const logoUrl = text(row.organizationLogoUrl);

  const amountRows = [
    ["Basic", structure.basic ?? row.baseSalary],
    ...Object.entries(structure)
      .filter(([key]) => key !== "basic")
      .map(([key, value]) => [key.charAt(0).toUpperCase() + key.slice(1), value]),
    ["Other Earnings", customAllowances],
    ["Taxable Gross Pay", row.grossPay, true],
    ["PAYE", statutory.payeTax || 0],
    ["Pension", statutory.employeePension || 0],
    ["Other Deductions", customDeductions],
    ["Salary Advance Recovery", row.advanceRecovery],
    ["Loan Recovery", row.loanRecovery],
    ...(leaveAllowance > 0 ? [["Leave Allowance · After Tax / Non-taxable", leaveAllowance, true]] : []),
    ["Net Pay", row.netPreview, true],
  ];

  const htmlRows = amountRows.map(([label, amount, strong], index) => {
    const net = index === amountRows.length - 1;
    return `<tr>
      <td style="padding:9px 10px;border-bottom:1px solid #d9e2dd;${strong ? "font-weight:700;color:#064e3b;" : ""}">${escapeHtml(label)}</td>
      <td style="padding:9px 10px;border-bottom:1px solid #d9e2dd;text-align:right;${strong ? "font-weight:700;color:#064e3b;" : ""}${net ? "border-top:2px solid #b08a1e;font-size:16px;" : ""}">${escapeHtml(money(amount, row.currency))}</td>
    </tr>`;
  }).join("");

  const logo = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(organizationName)} logo" style="max-width:120px;max-height:64px;display:block;margin:0 auto 8px;object-fit:contain;">`
    : "";

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#f4f7f5;padding:24px;color:#17211c;">
    <div style="max-width:760px;margin:0 auto;background:#fff;border:1px solid #d5dfd9;border-radius:12px;overflow:hidden;">
      <div style="padding:22px;text-align:center;border-bottom:3px solid #087A43;">
        ${logo}
        <div style="font-size:21px;font-weight:800;color:#064e3b;">${escapeHtml(organizationName)}</div>
        <div style="margin-top:6px;color:#9a7410;font-size:13px;font-weight:700;letter-spacing:.1em;">EMPLOYEE PAYSLIP</div>
      </div>
      <div style="padding:20px 22px;">
        <p style="margin-top:0;">Dear ${escapeHtml(row.employeeName)},</p>
        <p>Your approved payroll payslip for <strong>${escapeHtml(row.periodName || row.periodCode)}</strong> is shown below.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:6px 0;color:#64748b;">Employee Name</td><td style="padding:6px 0;text-align:right;font-weight:700;">${escapeHtml(row.employeeName || "—")}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;">Employee Number</td><td style="padding:6px 0;text-align:right;">${escapeHtml(row.employeeNumber || "—")}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;">Designation</td><td style="padding:6px 0;text-align:right;">${escapeHtml(row.designation || "—")}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;">Bank</td><td style="padding:6px 0;text-align:right;">${escapeHtml(row.bankName || "—")}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;">Account Name</td><td style="padding:6px 0;text-align:right;">${escapeHtml(row.accountName || "—")}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;">Account Number</td><td style="padding:6px 0;text-align:right;">${escapeHtml(row.accountNumber || "—")}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;">Payroll Period</td><td style="padding:6px 0;text-align:right;">${escapeHtml(row.periodStart || "—")} → ${escapeHtml(row.periodEnd || "—")}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;">Pay Date</td><td style="padding:6px 0;text-align:right;">${escapeHtml(row.payDate || "—")}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;">Worked Days</td><td style="padding:6px 0;text-align:right;">${attendance.payableDays != null ? `${escapeHtml(attendance.payableDays)} / ${escapeHtml(attendance.standardDays)}` : "—"}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;">Running Loan Balance</td><td style="padding:6px 0;text-align:right;">${escapeHtml(money(row.runningLoanBalance, row.currency))}</td></tr>
        </table>
        <table style="width:100%;border-collapse:collapse;border:1px solid #d9e2dd;">
          <thead><tr><th style="padding:10px;background:#064e3b;color:#fff;text-align:left;">Earnings / Deductions</th><th style="padding:10px;background:#064e3b;color:#fff;text-align:right;">Amount</th></tr></thead>
          <tbody>${htmlRows}</tbody>
        </table>
        <p style="margin:18px 0 0;color:#64748b;font-size:12px;">This payslip was generated from an approved CHRiS payroll run. Please contact HR if you have a payroll query.</p>
      </div>
      <div style="padding:12px 22px;background:#f8faf9;color:#64748b;font-size:11px;text-align:center;">CHRiS — People. Performance. Reward.</div>
    </div>
  </div>`;

  const plainText = [
    organizationName,
    `Employee Payslip — ${row.periodName || row.periodCode}`,
    `Employee Name: ${row.employeeName || "—"}`,
    `Employee Number: ${row.employeeNumber || "—"}`,
    `Designation: ${row.designation || "—"}`,
    `Bank: ${row.bankName || "—"}`,
    `Account Name: ${row.accountName || "—"}`,
    `Account Number: ${row.accountNumber || "—"}`,
    `Payroll Period: ${row.periodStart || "—"} to ${row.periodEnd || "—"}`,
    `Pay Date: ${row.payDate || "—"}`,
    `Running Loan Balance: ${money(row.runningLoanBalance, row.currency)}`,
    "",
    ...amountRows.map(([label, amount]) => `${label}: ${money(amount, row.currency)}`),
    "",
    "Generated from an approved CHRiS payroll run.",
  ].join("\n");

  return {
    subject: `${organizationName} Payslip — ${row.periodName || row.periodCode} — ${row.employeeNumber}`,
    html,
    plainText,
  };
}

async function sendViaResend({ to, subject, html, plainText }) {
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
