"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const XLSX = require("xlsx");
const { buildConsolidatedReport } = require("../src/services/consolidatedStatutoryReportService");
const { buildStatutoryWorkbook, SHEETS } = require("../src/services/consolidatedStatutoryWorkbookService");

const approved = { organizationId:"zll", employeeId:"e1", employeeNo:"ZLL000001", employeeName:"Employee One", branch:"Abuja", year:2026,
  period:"2026-10", sourceType:"APPROVED_PAYROLL", sourceId:"run-1:line-1", payrollStatus:"APPROVED",
  grossSalary:200000, netSalary:165000, paye:12000, pensionEmployee:16000, pensionEmployer:20000, nhfEmployee:5000, nsitfEmployer:2000 };
const historical = { organizationId:"zll", employeeId:"e2", employeeNo:"ZLL000002", employeeName:"Employee Two", branch:"Lagos", year:2026,
  period:"9 Months", sourceType:"HISTORICAL_IMPORT", sourceId:"file-hash:row-1", paye:"25,000" };
test("approved payroll uses deemed remitted convention; missing historical salary is not fabricated", () => {
  const r = buildConsolidatedReport({ organizationId:"zll", year:2026, records:[approved,historical] });
  assert.equal(r.rows.length, 2);
  assert.equal(r.rows[0].reportingRemittanceStatus, "DEEMED_REMITTED_BY_APPROVAL_POLICY");
  assert.equal(r.rows[1].reportingRemittanceStatus, "NOT_DETERMINED_FROM_IMPORT");
  assert.equal(r.rows[1].netSalary, null);
  assert.equal(r.rows[1].period, "9 Months");
  assert.equal(r.totals.grossSalary, 200000);
  assert.equal(r.totals.pensionTotal, 36000);
  assert.ok(r.exceptions.some(x => x.code === "HISTORICAL_SALARY_MISSING"));
});
test("no cross-tenant leaks, no unapproved payroll, duplicate source is flagged", () => {
  const r = buildConsolidatedReport({ organizationId:"zll", year:2026, records:[
    approved, approved, { ...approved, organizationId:"tenant2", sourceId:"another" },
    { ...approved, sourceId:"draft-run", payrollStatus:"DRAFT" }] });
  assert.equal(r.rows.length, 1);
  assert.equal(r.exceptions.filter(x => x.code === "DUPLICATE_SOURCE").length, 1);
});
test("unverified branch kept in Combined but not falsely assigned", () => {
  const r = buildConsolidatedReport({ organizationId:"zll", year:2026, records:[approved,{ ...historical, branch:"" }] });
  assert.equal(r.branches.Abuja.length, 1);
  assert.equal(r.branches.Lagos.length, 0);
  assert.equal(r.unresolved.length, 1);
  assert.equal(r.rows.length, 2);
  assert.ok(r.exceptions.some(x => x.code === "BRANCH_UNVERIFIED"));
});
test("XLSX includes all 11 separate sheets without monthly invention", () => {
  const r = buildConsolidatedReport({ organizationId:"zll", year:2026, records:[approved,historical] });
  const book = buildStatutoryWorkbook(r);
  assert.deepEqual(book.SheetNames,SHEETS);
  const bytes = XLSX.write(book,{type:"buffer",bookType:"xlsx"});
  const parsed = XLSX.read(bytes,{type:"buffer"});
  assert.deepEqual(parsed.SheetNames,SHEETS);
  const reconciliation = XLSX.utils.sheet_to_json(parsed.Sheets["Monthly Reconciliation"]);
  assert.deepEqual(reconciliation.map(x=>x.period).sort(),["2026-10","9 Months"]);
});
