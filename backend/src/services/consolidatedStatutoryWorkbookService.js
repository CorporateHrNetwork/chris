"use strict";
const XLSX = require("xlsx");
const { BRANCHES } = require("./consolidatedStatutoryReportService");

const SHEETS = ["Executive Summary", "Abuja", "Lagos", "Port Harcourt", "Combined", "PAYE Register", "Pension Register", "Other Statutories", "Gross & Net Salaries", "Monthly Reconciliation", "Exceptions & Audit Trail"];
function worksheet(rows) {
  // Keep empty worksheets structurally valid and clear about missing data.
  return XLSX.utils.json_to_sheet(rows.length ? rows : [{ note: "No matching records" }]);
}
function buildStatutoryWorkbook(report) {
  const book = XLSX.utils.book_new();
  function add(name, rows) { XLSX.utils.book_append_sheet(book, worksheet(rows), name.slice(0, 31)); }
  add(SHEETS[0], [
    { metric: "Organization ID", value: report.organizationId },
    { metric: "Reporting Year", value: report.year },
    { metric: "Employee-period records", value: report.totals.employeeRecords },
    { metric: "Verified historical source rows", value: report.sourceCoverage?.verifiedHistoricalRows ?? "Preview / unknown" },
    { metric: "Approved payroll source rows", value: report.sourceCoverage?.approvedPayrollRows ?? "Preview / unknown" },
    { metric: "Unresolved reporting findings", value: report.exceptions.length },
    ...Object.entries(report.totals).filter(([k]) => k !== "employeeRecords").map(([k,v]) => ({ metric: k, value: v })),
    { metric: "Unverified branch records", value: report.unresolved.length },
    { metric: "Exceptions", value: report.exceptions.length },
    { metric: "Remittance convention", value: "Approved payroll = deemed remitted for INTERNAL REPORTING only; not proof of settlement" },
  ]);
  for (const branch of BRANCHES) add(branch, report.branches[branch]);
  add("Combined", report.rows);
  add("PAYE Register", report.statutory.map(({ employeeNo,employeeName,branch,period,paye,taxPayerNumber,reportingRemittanceStatus,sourceId }) => ({ employeeNo,employeeName,branch,period,paye,taxPayerNumber,reportingRemittanceStatus,sourceId })));
  add("Pension Register", report.statutory.map(({ employeeNo,employeeName,branch,period,pensionEmployee,pensionEmployer,pensionTotal,pensionNumber,pensionProvider,reportingRemittanceStatus,sourceId }) => ({ employeeNo,employeeName,branch,period,pensionEmployee,pensionEmployer,pensionTotal,pensionNumber,pensionProvider,reportingRemittanceStatus,sourceId })));
  add("Other Statutories", report.statutory.map(({ employeeNo,employeeName,branch,period,nhfEmployee,nsitfEmployer,itfEmployer,otherEmployerContributions,sourceId }) => ({ employeeNo,employeeName,branch,period,nhfEmployee,nsitfEmployer,itfEmployer,otherEmployerContributions,sourceId })));
  add("Gross & Net Salaries", report.rows.map(({ employeeNo,employeeName,branch,period,grossSalary,netSalary,basicSalary,housingAllowance,transportAllowance,otherEarnings,sourceId }) => ({ employeeNo,employeeName,branch,period,grossSalary,netSalary,basicSalary,housingAllowance,transportAllowance,otherEarnings,sourceId })));
  // Historical aggregate periods stay as originally provided; never assign them to a fictitious month.
  const keyed = new Map();
  for (const row of report.rows) {
    const key = row.period;
    if (!keyed.has(key)) keyed.set(key, []);
    keyed.get(key).push(row);
  }
  const { buildConsolidatedReport } = require("./consolidatedStatutoryReportService");
  add("Monthly Reconciliation", [...keyed].map(([period,rows]) => {
    const totals = buildConsolidatedReport({ organizationId: report.organizationId, year: report.year, records: rows.map(r => ({ ...r, payrollStatus: r.payrollStatus })) }).totals;
    return { period, ...totals };
  }));
  add("Exceptions & Audit Trail", report.exceptions);
  return book;
}
module.exports = { buildStatutoryWorkbook, SHEETS };
