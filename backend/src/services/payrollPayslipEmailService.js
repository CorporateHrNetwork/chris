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


function pdfSafe(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function pdfMoney(value, currency = "NGN") {
  const amount = Number(value || 0);
  return `${currency || "NGN"} ${amount.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function jpegDimensions(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    if (!length || length < 2) break;
    offset += 2 + length;
  }
  return null;
}

async function fetchPayslipLogo(row) {
  const candidates = [
    text(row.organizationLogoUrl),
    text(process.env.CHRIS_APP_URL) ? `${text(process.env.CHRIS_APP_URL).replace(/\/$/, "")}/zrt-logo.jpeg` : "",
  ].filter(Boolean);
  for (const url of candidates) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const contentType = text(response.headers.get("content-type")).toLowerCase();
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!contentType.includes("jpeg") && !contentType.includes("jpg") && !(bytes[0] === 0xff && bytes[1] === 0xd8)) continue;
      const dimensions = jpegDimensions(bytes);
      if (!dimensions) continue;
      return { bytes, ...dimensions };
    } catch {}
  }
  return null;
}

function createPdfBuffer({ row, organizationName, detailItems, rows, logo }) {
  const width = 595.28;
  const height = 841.89;
  const streams = [];
  const cmd = (value) => streams.push(value);
  const topY = (top) => height - top;
  const textAt = (value, x, top, size = 7, bold = false, color = "0.09 0.13 0.11") => {
    cmd(`BT /${bold ? "F2" : "F1"} ${size} Tf ${color} rg ${x.toFixed(2)} ${topY(top).toFixed(2)} Td (${pdfSafe(value)}) Tj ET\n`);
  };
  const estimatedTextWidth = (value, size) => String(value ?? "").length * size * 0.52;
  const textRight = (value, right, top, size = 7, bold = false, color = "0.09 0.13 0.11") => {
    textAt(value, right - estimatedTextWidth(value, size), top, size, bold, color);
  };
  const line = (x1, top1, x2, top2, color = "0.04 0.42 0.26", thickness = 1) => {
    cmd(`${color} RG ${thickness} w ${x1.toFixed(2)} ${topY(top1).toFixed(2)} m ${x2.toFixed(2)} ${topY(top2).toFixed(2)} l S\n`);
  };
  const rect = (x, top, w, h, stroke = "0.85 0.78 0.53", fill = "0.969 0.953 0.910") => {
    cmd(`${fill} rg ${stroke} RG ${x.toFixed(2)} ${(height-top-h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re B\n`);
  };

  cmd("1 1 1 rg 0 0 595.28 841.89 re f\n");

  if (logo) {
    const maxW = 54, maxH = 35;
    const ratio = Math.min(maxW / logo.width, maxH / logo.height);
    const drawW = logo.width * ratio, drawH = logo.height * ratio;
    const x = (width - drawW) / 2;
    const y = height - 24 - drawH;
    cmd(`q ${drawW.toFixed(2)} 0 0 ${drawH.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im1 Do Q\n`);
    cmd(`q /GS1 gs 210 0 0 110 192 330 cm /Im1 Do Q\n`);
  } else {
    cmd("q /GS1 gs\n");
    textAt(organizationName, 115, 445, 34, true, "0.04 0.31 0.23");
    cmd("Q\n");
  }

  if (!logo) textAt(organizationName, 205, 66, 12.5, true, "0.025 0.306 0.231");
  textAt("EMPLOYEE PAYSLIP", 238, 83, 8.3, true, "0.60 0.45 0.06");
  line(53, 94, 542, 94, "0.04 0.42 0.26", 1.4);
  textAt(row.periodCode || "", 267, 108, 6.8, false, "0.28 0.35 0.42");

  const boxW = 238;
  const boxH = 28;
  detailItems.forEach(([label, value], index) => {
    const col = index % 2;
    const r = Math.floor(index / 2);
    const x = 53 + col * 251;
    const top = 119 + r * 34;
    rect(x, top, boxW, boxH);
    textAt(String(label).toUpperCase(), x + 6, top + 9, 5.3, false, "0.39 0.46 0.55");
    textAt(value, x + 6, top + 21, 6.7, true);
  });

  let top = 259;
  textAt("EARNINGS / DEDUCTIONS", 55, top, 6, true, "0.025 0.306 0.231");
  textRight("AMOUNT", 538, top, 6, true, "0.025 0.306 0.231");
  line(53, top + 5, 542, top + 5, "0.025 0.306 0.231", 1.2);
  top += 15;
  rows.forEach(([label, amount, strong], index) => {
    const net = index === rows.length - 1;
    if (net) line(53, top - 5, 542, top - 5, "0.60 0.45 0.06", 1.4);
    textAt(label, 56, top + 4, net ? 7.6 : 6.7, Boolean(strong || net), strong || net ? "0.025 0.306 0.231" : "0.09 0.13 0.11");
    textRight(pdfMoney(amount, row.currency), 538, top + 4, net ? 7.6 : 6.7, Boolean(strong || net), strong || net ? "0.025 0.306 0.231" : "0.09 0.13 0.11");
    line(53, top + 9, 542, top + 9, net ? "0.60 0.45 0.06" : "0.85 0.87 0.89", net ? 1.4 : 0.35);
    top += 15;
  });

  top += 4;
  line(53, top, 542, top, "0.025 0.306 0.231", 1.4);
  textAt("LOAN SUMMARY", 55, top + 13, 6, true, "0.60 0.45 0.06");
  rect(53, top + 18, 489, 28);
  textAt("RUNNING LOAN BALANCE", 59, top + 29, 5.3, false, "0.39 0.46 0.55");
  textRight(pdfMoney(row.runningLoanBalance, row.currency), 536, top + 34, 6.8, true);

  const footerTop = Math.min(790, top + 67);
  line(53, footerTop, 542, footerTop, "0.58 0.64 0.72", 0.4);
  textAt("Generated from an approved CHRiS payroll run.", 53, footerTop + 11, 5.4, false, "0.39 0.46 0.55");
  textAt("Powered by CHRiS", 469, footerTop + 11, 5.4, false, "0.39 0.46 0.55");

  const content = Buffer.from(streams.join(""), "binary");
  const objects = [];
  const add = (buffer) => { objects.push(Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer, "binary")); return objects.length; };

  const catalogId = add("");
  const pagesId = add("");
  const pageId = add("");
  const fontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const boldFontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const gsId = add("<< /Type /ExtGState /ca 0.08 /CA 0.08 >>");
  let imageId = null;
  if (logo) {
    const header = Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Mask [245 255 245 255 245 255] /Length ${logo.bytes.length} >>\nstream\n`, "binary");
    imageId = add(Buffer.concat([header, logo.bytes, Buffer.from("\nendstream", "binary")]));
  }
  const contentId = add(Buffer.concat([
    Buffer.from(`<< /Length ${content.length} >>\nstream\n`, "binary"),
    content,
    Buffer.from("endstream", "binary"),
  ]));

  const resources = `<< /Font << /F1 ${fontId} 0 R /F2 ${boldFontId} 0 R >> /ExtGState << /GS1 ${gsId} 0 R >>${imageId ? ` /XObject << /Im1 ${imageId} 0 R >>` : ""} >>`;
  objects[catalogId - 1] = Buffer.from(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  objects[pagesId - 1] = Buffer.from(`<< /Type /Pages /Kids [${pageId} 0 R] /Count 1 >>`);
  objects[pageId - 1] = Buffer.from(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${width} ${height}] /Resources ${resources} /Contents ${contentId} 0 R >>`);

  const chunks = [Buffer.from("%PDF-1.4\n%CHRiS\n", "binary")];
  const offsets = [0];
  let offset = chunks[0].length;
  objects.forEach((object, i) => {
    offsets.push(offset);
    const prefix = Buffer.from(`${i + 1} 0 obj\n`, "binary");
    const suffix = Buffer.from("\nendobj\n", "binary");
    chunks.push(prefix, object, suffix);
    offset += prefix.length + object.length + suffix.length;
  });
  const xrefOffset = offset;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i += 1) xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, "binary"));
  return Buffer.concat(chunks);
}

async function buildPayslipEmail(row) {
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
    *{box-sizing:border-box}body{margin:0;background:#ffffff;color:#17211c;font-family:Arial,Helvetica,sans-serif}.payslip{position:relative;width:100%;max-width:794px;min-height:0;margin:0 auto;padding:38px 53px 34px;overflow:hidden;background:#ffffff}.document-content{position:relative;z-index:1}.organization-header{text-align:center;padding-bottom:8px;border-bottom:2px solid #0b6b43}.organization-logo{display:block;max-width:92px;max-height:48px;margin:0 auto 5px;object-fit:contain}.organization-name{margin:0;color:#064e3b;font-size:17px;line-height:1.18}.document-title{margin:4px 0 0;color:#9a7410;font-size:11px;letter-spacing:.12em;text-transform:uppercase}.watermark{position:absolute;z-index:0;top:52%;left:50%;width:46%;max-width:300px;max-height:300px;transform:translate(-50%,-50%);object-fit:contain;opacity:.10;filter:grayscale(100%);pointer-events:none}.watermark-text{position:absolute;z-index:0;top:52%;left:50%;transform:translate(-50%,-50%) rotate(-28deg);width:78%;text-align:center;color:#064e3b;opacity:.09;font-size:42pt;font-weight:900;letter-spacing:.08em;pointer-events:none}.reference{margin:8px 0 8px;text-align:center;color:#475569;font-size:8.5pt}.details{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-bottom:9px}.detail{padding:6px 8px;border:1px solid #d8c788;border-radius:6px;background:#ffffff}.detail span{display:block;margin-bottom:2px;color:#64748b;font-size:6.8pt;text-transform:uppercase;letter-spacing:.04em}.detail strong{font-size:8.2pt;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;background:#ffffff}th,td{padding:5px 8px;border-bottom:1px solid #d8dee2;font-size:8.2pt}th{background:#ffffff;color:#064e3b;text-align:left;text-transform:uppercase;letter-spacing:.06em;font-size:7pt;border-bottom:2px solid #064e3b}th:last-child,td:last-child{text-align:right}.strong-row td{font-weight:700;color:#064e3b}.net-row td{border-top:2px solid #9a7410;border-bottom:2px solid #9a7410;font-size:9.5pt}.payment-summary{margin-top:8px;padding-top:7px;border-top:2px solid #064e3b}.payment-title{margin:0 0 5px;color:#9a7410;font-size:7.2pt;font-weight:800;text-transform:uppercase;letter-spacing:.08em}.payment-item{padding:6px 8px;border:1px solid #d8c788;border-radius:6px;background:#ffffff}.payment-item span{display:inline;margin-right:8px;color:#64748b;font-size:6.8pt;text-transform:uppercase;letter-spacing:.04em}.payment-item strong{font-size:8.2pt}.footer{display:flex;justify-content:space-between;gap:12px;margin-top:8px;padding-top:6px;border-top:1px solid #94a3b8;color:#64748b;font-size:6.8pt}@media(max-width:640px){.payslip{padding:22px 18px}.details{grid-template-columns:1fr}}@media print{@page{size:A4 portrait;margin:0}body{print-color-adjust:exact;-webkit-print-color-adjust:exact}.payslip{width:210mm;padding:10mm 14mm 9mm}}
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

  const logoBinary = await fetchPayslipLogo(row);
  const pdfBuffer = createPdfBuffer({ row, organizationName, detailItems, rows, logo: logoBinary });
  const filename = `ZERMATT-Payslip-${String(row.periodCode || row.periodName || "Payroll").replace(/[^A-Za-z0-9._-]+/g, "-")}-${String(row.employeeNumber || "Employee").replace(/[^A-Za-z0-9._-]+/g, "-")}.pdf`;
  const emailHtml = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><style>:root{color-scheme:light only!important}body{margin:0!important;background:#f4f1e8!important;background-image:linear-gradient(#f4f1e8,#f4f1e8)!important;color:#17211c!important}table,td{color:#17211c!important}@media(prefers-color-scheme:dark){body,.mail-shell,.mail-card,.info-cell{background:#f4f1e8!important;background-image:linear-gradient(#f4f1e8,#f4f1e8)!important;color:#17211c!important}.mail-card{background:#fffdf7!important;background-image:linear-gradient(#fffdf7,#fffdf7)!important}}</style></head><body bgcolor="#f4f1e8"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f4f1e8" class="mail-shell" style="width:100%;background:#f4f1e8;background-image:linear-gradient(#f4f1e8,#f4f1e8);padding:20px 10px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#fffdf7" class="mail-card" style="width:100%;max-width:620px;background:#fffdf7;background-image:linear-gradient(#fffdf7,#fffdf7);border:1px solid #d8c788;border-radius:10px;overflow:hidden"><tr><td align="center" style="padding:22px 18px 14px;border-bottom:3px solid #0b6b43"><div style="font:800 20px Arial,sans-serif;color:#064e3b">${escapeHtml(organizationName)}</div><div style="margin-top:5px;font:700 11px Arial,sans-serif;letter-spacing:.12em;color:#9a7410">EMPLOYEE PAYSLIP</div></td></tr><tr><td style="padding:20px;font:14px/1.55 Arial,sans-serif;color:#17211c"><p style="margin:0 0 12px">Dear ${escapeHtml(row.employeeName)},</p><p style="margin:0 0 18px">Your approved payroll payslip for <strong>${escapeHtml(row.periodName || row.periodCode)}</strong> is attached as an official PDF. Download the PDF for the authoritative document view, saving and printing.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse"><tr><td class="info-cell" style="padding:9px;border-bottom:1px solid #e3ddcc;color:#64748b">Employee Number</td><td class="info-cell" align="right" style="padding:9px;border-bottom:1px solid #e3ddcc;font-weight:700;color:#17211c">${escapeHtml(row.employeeNumber || "—")}</td></tr><tr><td class="info-cell" style="padding:9px;border-bottom:1px solid #e3ddcc;color:#64748b">Designation</td><td class="info-cell" align="right" style="padding:9px;border-bottom:1px solid #e3ddcc;font-weight:700;color:#17211c">${escapeHtml(row.designation || "—")}</td></tr><tr><td class="info-cell" style="padding:9px;border-bottom:1px solid #e3ddcc;color:#64748b">Payroll Period</td><td class="info-cell" align="right" style="padding:9px;border-bottom:1px solid #e3ddcc;color:#17211c">${escapeHtml(row.periodStart || "—")} → ${escapeHtml(row.periodEnd || "—")}</td></tr><tr><td class="info-cell" style="padding:9px;border-bottom:1px solid #e3ddcc;color:#64748b">Net Pay</td><td class="info-cell" align="right" style="padding:9px;border-bottom:1px solid #e3ddcc;font-weight:800;color:#064e3b">${escapeHtml(money(row.netPreview,row.currency))}</td></tr><tr><td class="info-cell" style="padding:9px;color:#64748b">Running Loan Balance</td><td class="info-cell" align="right" style="padding:9px;font-weight:700;color:#17211c">${escapeHtml(money(row.runningLoanBalance,row.currency))}</td></tr></table><div style="margin-top:18px;padding:11px 12px;border-left:4px solid #9a7410;background:#ffffff;background-image:linear-gradient(#ffffff,#ffffff);color:#475569;font-size:12px">The attached PDF is the official CHRiS payslip and preserves the approved Zermatt print layout.</div></td></tr><tr><td align="center" style="padding:11px 16px;border-top:1px solid #d8c788;font:11px Arial,sans-serif;color:#64748b">Powered by CHRiS</td></tr></table></td></tr></table></body></html>`;

  return {
    subject: `${organizationName} Payslip — ${row.periodName || row.periodCode} — ${row.employeeNumber}`,
    html: emailHtml,
    plainText,
    attachment: {
      filename,
      content: pdfBuffer.toString("base64"),
      contentType: "application/pdf",
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
  const email = await buildPayslipEmail(row);

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
