"use strict";
/**
 * Preview-only importer for Zermatt's historical 2026 workbook.
 * Produces individual source-backed pension and PAYE transactions. Never
 * merges by fuzzy names, guesses a branch, or spreads "9 Months" over months.
 */
const crypto = require("node:crypto");
const XLSX = require("xlsx");

const HEADERS = {
  pension: ["Employee Name", "Pension Employer", "Pension Employee", "Pension Number", "Pension Provider", "Total Pension Contribution", "Period"],
  paye: ["Employee Name", "Employee Number", "Basic Salary", "Housing Allowance", "Transport Allowance", "Gross Salary", "PAYE", "Tax Payer Number", "Period"],
};
function value(row, index) { return row[index] === undefined || row[index] === "" ? null : row[index]; }
function amount(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(typeof v === "string" ? v.replace(/,/g, "") : v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
function findHeader(rows, fields) {
  return rows.findIndex(row => fields.every((header, index) => String(row[index] || "").trim().toLowerCase() === header.toLowerCase()));
}
function periodValid(text) {
  const s = String(text || "").trim();
  return /^(?:JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+20\d{2}$/i.test(s)
    || /^\d+\s+Months?$/i.test(s)
    || /^20\d{2}[-/]\d{2}$/.test(s);
}
function previewHistoricalWorkbook({ buffer, organizationId, year = 2026, employeeMatches = {} }) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error("Historical workbook buffer required");
  if (!organizationId || !Number.isInteger(year)) throw new Error("Valid organization and year required");
  const workbookHash = crypto.createHash("sha256").update(buffer).digest("hex");
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const records = [], exceptions = [], diagnostics = [];
  for (const [sheet, kind] of [["STAFF PENSION","pension"],["STAFF PAYE","paye"]]) {
    if (!workbook.Sheets[sheet]) { exceptions.push({ code: "MISSING_SHEET", sheet }); continue; }
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheet], { header: 1, defval: null, raw: true });
    const offset = findHeader(rows, HEADERS[kind]);
    if (offset < 0) { exceptions.push({ code: "MISSING_HEADERS", sheet }); continue; }
    let accepted = 0;
    for (let i=offset+1; i<rows.length; i++) {
      const row = rows[i];
      if (!row.some(c => c !== null && c !== "")) continue;
      const rowNumber = i+1;
      const name = String(value(row,0) || "").trim();
      // PAYE exports contain a trailing 'Totals' summary row. This is NOT an employee.
      if (/^totals?\s*:?$/i.test(name)) continue;
      const period = String(value(row,kind==="paye" ? 8 : 6) || "").trim();
      if (!name || !period) { exceptions.push({ code:"INCOMPLETE_SOURCE_ROW", sheet, rowNumber }); continue; }
      const sourceId = workbookHash+":"+sheet+":"+rowNumber;
      const employeeNo = kind === "paye" ? String(value(row,1) || "").trim() : "";
      // Matches supplied by an authorized, reviewed identity mapping; no fuzzy auto-match.
      const match = employeeNo ? employeeMatches[employeeNo] : null;
      const record = {
        organizationId: String(organizationId), year, sourceType: "HISTORICAL_IMPORT",
        sourceId, employeeNo, employeeId: match?.employeeId || null,
        employeeName: name, branch: match?.branch || null,
        department: match?.department || null, period,
        pensionProvider: kind === "pension" ? value(row,4) : null,
        pensionNumber: kind === "pension" ? value(row,3) : null,
        taxPayerNumber: kind === "paye" ? value(row,7) : null,
        pensionEmployee: kind === "pension" ? amount(value(row,2)) : null,
        pensionEmployer: kind === "pension" ? amount(value(row,1)) : null,
        basicSalary: kind === "paye" ? amount(value(row,2)) : null,
        housingAllowance: kind === "paye" ? amount(value(row,3)) : null,
        transportAllowance: kind === "paye" ? amount(value(row,4)) : null,
        grossSalary: kind === "paye" ? amount(value(row,5)) : null,
        paye: kind === "paye" ? amount(value(row,6)) : null,
      };
      if (!periodValid(period)) exceptions.push({ code:"UNRECOGNIZED_PERIOD", sheet, rowNumber, period });
      if (!match) exceptions.push({ code:"IDENTITY_MATCH_REQUIRED", sheet, rowNumber, employeeNo, employeeName:name });
      if (kind === "pension") {
        const statedTotal = amount(value(row,5));
        const components = (record.pensionEmployee || 0)+(record.pensionEmployer || 0);
        if (statedTotal !== null && Math.abs(statedTotal - components) > 0.02) {
          exceptions.push({ code:"PENSION_TOTAL_MISMATCH", sheet, rowNumber, statedTotal, componentTotal:components });
        }
      }
      records.push(record); accepted++;
    }
    diagnostics.push({ sheet, accepted, headerRow: offset+1 });
  }
  return { workbookHash, organizationId: String(organizationId), year, records, exceptions, diagnostics, isPreview:true };
}
module.exports = { previewHistoricalWorkbook, periodValid };
