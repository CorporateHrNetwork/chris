"use strict";

/**
 * Consolidated statutory reporting core, independent of storage and HTTP.
 * Upstream adapters MUST supply tenant-scoped, authorization-checked records.
 * Never turn an aggregated historical period into invented monthly entries.
 */
const BRANCHES = ["Abuja", "Lagos", "Port Harcourt"];
const COMPONENTS = ["grossSalary", "netSalary", "basicSalary", "housingAllowance", "transportAllowance", "otherEarnings", "paye", "pensionEmployee", "pensionEmployer", "nhfEmployee", "nsitfEmployer", "itfEmployer", "otherEmployeeDeductions", "otherEmployerContributions"];

function money(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "string" ? Number(value.replace(/,/g, "")) : Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}
function branchOf(input) {
  const key = String(input || "").trim().toLowerCase().replace(/[^a-z]/g, "");
  return ({ abuja: "Abuja", lagos: "Lagos", portharcourt: "Port Harcourt", phc: "Port Harcourt" })[key] || null;
}
function prepare(row, year) {
  const historical = row.sourceType === "HISTORICAL_IMPORT";
  const approved = row.sourceType === "APPROVED_PAYROLL" && row.payrollStatus === "APPROVED";
  if (!historical && !approved) return null;
  const r = {
    organizationId: String(row.organizationId || ""),
    employeeId: row.employeeId || null,
    employeeNo: String(row.employeeNo || "").trim(),
    employeeName: String(row.employeeName || "").trim(),
    branch: branchOf(row.branch),
    department: row.department || "",
    pensionProvider: row.pensionProvider || null,
    pensionNumber: row.pensionNumber || null,
    taxPayerNumber: row.taxPayerNumber || null,
    year: Number(row.year),
    period: String(row.period || "").trim(),
    sourceType: row.sourceType,
    sourceId: String(row.sourceId || "").trim(),
    payrollStatus: approved ? "APPROVED" : "HISTORICAL_UNVERIFIED",
    reportingRemittanceStatus: approved ? "DEEMED_REMITTED_BY_APPROVAL_POLICY" : "NOT_DETERMINED_FROM_IMPORT",
  };
  if (r.year !== Number(year) || !r.organizationId || !r.sourceId || !r.period) return null;
  for (const key of COMPONENTS) r[key] = money(row[key]);
  r.pensionTotal = r.pensionEmployee === null && r.pensionEmployer === null ? null : (r.pensionEmployee || 0) + (r.pensionEmployer || 0);
  return r;
}
function deduplicate(records) {
  const seen = new Set(), rows = [], exceptions = [];
  for (const row of records) {
    const key = [row.organizationId, row.sourceType, row.sourceId, row.employeeId || row.employeeNo, row.period].join("|");
    if (seen.has(key)) { exceptions.push({ code: "DUPLICATE_SOURCE", employeeNo: row.employeeNo, sourceId: row.sourceId, period: row.period }); continue; }
    seen.add(key);
    rows.push(row);
  }
  return { rows, exceptions };
}
function summarize(rows) {
  const sum = Object.fromEntries([...COMPONENTS, "pensionTotal"].map(k => [k, 0]));
  const present = Object.fromEntries([...COMPONENTS, "pensionTotal"].map(k => [k, 0]));
  for (const row of rows) for (const key of Object.keys(sum)) if (row[key] !== null) { sum[key] += row[key]; present[key]++; }
  const result = { employeeRecords: rows.length };
  for (const key of Object.keys(sum)) result[key] = present[key] ? Math.round(sum[key] * 100) / 100 : null;
  return result;
}
function buildConsolidatedReport({ organizationId, year, records }) {
  if (!organizationId || !Number.isInteger(Number(year)) || Number(year) < 2000) throw new Error("Valid organizationId and year required");
  const filtered = (records || []).filter(x => String(x.organizationId) === String(organizationId)).map(x => prepare(x, year)).filter(Boolean);
  const { rows, exceptions } = deduplicate(filtered);
  for (const row of rows) {
    if (!row.employeeId) exceptions.push({ code: "UNMATCHED_EMPLOYEE", sourceId: row.sourceId, employeeNo: row.employeeNo });
    if (!row.branch) exceptions.push({ code: "BRANCH_UNVERIFIED", sourceId: row.sourceId, employeeNo: row.employeeNo });
    if (row.sourceType === "HISTORICAL_IMPORT" && (row.grossSalary === null || row.netSalary === null)) {
      exceptions.push({ code: "HISTORICAL_SALARY_MISSING", sourceId: row.sourceId, employeeNo: row.employeeNo });
    }
  }
  const branches = Object.fromEntries(BRANCHES.map(b => [b, rows.filter(x => x.branch === b)]));
  const unresolved = rows.filter(x => !x.branch);
  const statutory = rows.map(x => ({
    organizationId: x.organizationId, employeeNo: x.employeeNo, employeeName: x.employeeName,
    branch: x.branch, year: x.year, period: x.period, paye: x.paye,
    taxPayerNumber: x.taxPayerNumber, pensionNumber: x.pensionNumber, pensionProvider: x.pensionProvider,
    pensionEmployee: x.pensionEmployee, pensionEmployer: x.pensionEmployer, pensionTotal: x.pensionTotal,
    nhfEmployee: x.nhfEmployee, nsitfEmployer: x.nsitfEmployer, itfEmployer: x.itfEmployer,
    otherEmployerContributions: x.otherEmployerContributions,
    reportingRemittanceStatus: x.reportingRemittanceStatus, sourceType: x.sourceType, sourceId: x.sourceId,
  }));
  return { organizationId: String(organizationId), year: Number(year), rows, branches, unresolved, statutory, exceptions,
    totals: summarize(rows), branchTotals: Object.fromEntries(BRANCHES.map(b => [b, summarize(branches[b])])) };
}
module.exports = { BRANCHES, COMPONENTS, buildConsolidatedReport };
