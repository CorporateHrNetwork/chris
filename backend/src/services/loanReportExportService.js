const XLSX = require("xlsx");

function safeText(value) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").trim();
}

function csvEscape(value) {
  const text = safeText(value);
  return /[",]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function rowsToCsv(headers, rows) {
  return [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => row.map(csvEscape).join(",")),
  ].join("\r\n");
}

function addSheet(workbook, name, headers, rows) {
  const data = [headers, ...rows];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(data), name.slice(0, 31));
}

function pdfEscape(value) {
  return safeText(value)
    .replace(/[^\x20-\x7E]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function buildSimplePdf(title, lines) {
  const pageLines = 44;
  const pages = [];
  for (let index = 0; index < lines.length; index += pageLines) {
    pages.push(lines.slice(index, index + pageLines));
  }
  if (!pages.length) pages.push([]);

  const objects = [];
  const pageObjectNumbers = [];
  const contentObjectNumbers = [];
  const fontObjectNumber = 3 + pages.length * 2;

  objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  pageObjectNumbers.forEach(() => {});

  pages.forEach((page, index) => {
    const pageObjectNumber = 3 + index * 2;
    const contentObjectNumber = pageObjectNumber + 1;
    pageObjectNumbers.push(pageObjectNumber);
    contentObjectNumbers.push(contentObjectNumber);
    const contentLines = [
      "BT",
      "/F1 12 Tf",
      "45 800 Td",
      `(${pdfEscape(title)}${pages.length > 1 ? ` - Page ${index + 1}` : ""}) Tj`,
      "/F1 9 Tf",
      ...page.flatMap((line) => ["0 -16 Td", `(${pdfEscape(line)}) Tj`]),
      "ET",
    ];
    const stream = contentLines.join("\n");
    objects[pageObjectNumber] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontObjectNumber} 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`;
    objects[contentObjectNumber] = `<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`;
  });

  objects[2] = `<< /Type /Pages /Kids [${pageObjectNumbers.map((n) => `${n} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[fontObjectNumber] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 1; i <= fontObjectNumber; i += 1) {
    offsets[i] = Buffer.byteLength(pdf, "utf8");
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${fontObjectNumber + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= fontObjectNumber; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${fontObjectNumber + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}

function individualReportData(profile) {
  const loan = profile.loan;
  const summaryHeaders = ["Field", "Value"];
  const summaryRows = [
    ["Loan Number", loan.loanNumber],
    ["Employee Number", loan.employeeNumber],
    ["Employee Name", loan.employeeName],
    ["Department", loan.departmentName || ""],
    ["Designation", loan.designationName || ""],
    ["Loan Policy / Purpose", loan.purpose || ""],
    ["Principal Amount", loan.principalAmount],
    ["Recovered Amount", loan.recoveredAmount],
    ["Outstanding Amount", loan.outstandingAmount],
    ["Monthly Installment", loan.installmentAmount],
    ["Interest Rate %", 0],
    ["Total Interest", 0],
    ["Term Months", loan.termMonths],
    ["Application Date", loan.applicationDate || ""],
    ["Approved Date", loan.approvedDate || ""],
    ["Disbursed Date", loan.disbursedDate || ""],
    ["Recovery Start Date", loan.recoveryStartDate || ""],
    ["Expected Final Installment", loan.expectedFinalInstallmentDate || ""],
    ["Next Payment Due", loan.nextPaymentDue || ""],
    ["Status", loan.status],
  ];

  const scheduleHeaders = ["Installment", "Period", "Due Date", "Opening Balance", "Principal", "Interest", "Total Deduction", "Amount Paid", "Status"];
  const scheduleRows = profile.amortizationSchedule.map((row) => [
    row.installmentNumber,
    row.period,
    row.dueDate,
    row.outstandingBalance,
    row.principalAmount,
    row.interestAmount,
    row.totalDeduction,
    row.amountPaid,
    row.status,
  ]);

  const recoveryHeaders = ["Date", "Payroll Period", "Amount", "Status"];
  const recoveryRows = profile.recoveries.map((row) => [
    row.recoveryDate,
    row.payrollPeriodCode,
    row.amount,
    row.status,
  ]);
  return { summaryHeaders, summaryRows, scheduleHeaders, scheduleRows, recoveryHeaders, recoveryRows };
}

function exportIndividualLoan(profile, format) {
  const data = individualReportData(profile);
  const key = profile.loan.loanNumber.replace(/[^A-Za-z0-9_-]/g, "_");
  if (format === "csv") {
    const csv = [
      "LOAN SUMMARY",
      rowsToCsv(data.summaryHeaders, data.summaryRows),
      "",
      "AMORTIZATION SCHEDULE",
      rowsToCsv(data.scheduleHeaders, data.scheduleRows),
      "",
      "RECOVERY HISTORY",
      rowsToCsv(data.recoveryHeaders, data.recoveryRows),
    ].join("\r\n");
    return { buffer: Buffer.from(csv, "utf8"), contentType: "text/csv; charset=utf-8", fileName: `CHRiS_Loan_${key}.csv` };
  }
  if (format === "xlsx") {
    const workbook = XLSX.utils.book_new();
    addSheet(workbook, "Loan Summary", data.summaryHeaders, data.summaryRows);
    addSheet(workbook, "Amortization", data.scheduleHeaders, data.scheduleRows);
    addSheet(workbook, "Recoveries", data.recoveryHeaders, data.recoveryRows);
    return { buffer: XLSX.write(workbook, { bookType: "xlsx", type: "buffer" }), contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileName: `CHRiS_Loan_${key}.xlsx` };
  }
  if (format === "pdf") {
    const lines = [
      ...data.summaryRows.map(([field, value]) => `${field}: ${value}`),
      "",
      "Amortization Schedule",
      ...data.scheduleRows.map((row) => `#${row[0]} | ${row[1]} | Due ${row[2]} | Principal ${row[4]} | Paid ${row[7]} | ${row[8]}`),
      "",
      "Recovery History",
      ...data.recoveryRows.map((row) => `${row[0]} | ${row[1]} | ${row[2]} | ${row[3]}`),
    ];
    return { buffer: buildSimplePdf(`CHRiS Loan Profile - ${profile.loan.loanNumber}`, lines), contentType: "application/pdf", fileName: `CHRiS_Loan_${key}.pdf` };
  }
  throw new Error("Unsupported export format.");
}

function exportBulkLoans(rows, format) {
  const headers = ["Loan Number", "Employee Number", "Employee Name", "Loan Policy / Purpose", "Principal", "Recovered", "Outstanding", "Installment", "Interest %", "Term Months", "Application Date", "Disbursed Date", "Recovery Start", "Status"];
  const values = rows.map((row) => [
    row.loanNumber,
    row.employeeNumber,
    row.employeeName,
    row.purpose || "",
    row.principalAmount,
    row.recoveredAmount,
    row.outstandingAmount,
    row.installmentAmount,
    0,
    row.termMonths,
    row.applicationDate || "",
    row.disbursedDate || "",
    row.recoveryStartDate || "",
    row.status,
  ]);
  if (format === "csv") {
    return { buffer: Buffer.from(rowsToCsv(headers, values), "utf8"), contentType: "text/csv; charset=utf-8", fileName: "CHRiS_ZERMATT_Loan_Report.csv" };
  }
  if (format === "xlsx") {
    const workbook = XLSX.utils.book_new();
    addSheet(workbook, "Loan Portfolio", headers, values);
    return { buffer: XLSX.write(workbook, { bookType: "xlsx", type: "buffer" }), contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileName: "CHRiS_ZERMATT_Loan_Report.xlsx" };
  }
  if (format === "pdf") {
    const lines = values.map((row) => `${row[0]} | ${row[1]} | ${row[2]} | ${row[3]} | Principal ${row[4]} | Recovered ${row[5]} | Outstanding ${row[6]} | ${row[13]}`);
    return { buffer: buildSimplePdf("CHRiS ZERMATT Loan Portfolio Report", lines), contentType: "application/pdf", fileName: "CHRiS_ZERMATT_Loan_Report.pdf" };
  }
  throw new Error("Unsupported export format.");
}

module.exports = {
  exportIndividualLoan,
  exportBulkLoans,
  buildSimplePdf,
};
