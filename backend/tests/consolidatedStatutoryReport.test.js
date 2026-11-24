"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const XLSX = require("xlsx");
const { buildConsolidatedReport } = require("../src/services/consolidatedStatutoryReportService");
const { buildStatutoryWorkbook, annualEmployeeSummary, SHEETS } = require("../src/services/consolidatedStatutoryWorkbookService");

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
test("XLSX includes all 13 separate sheets without monthly invention", () => {
  const r = buildConsolidatedReport({ organizationId:"zll", year:2026, records:[approved,historical] });
  const book = buildStatutoryWorkbook(r);
  assert.deepEqual(book.SheetNames,SHEETS);
  const bytes = XLSX.write(book,{type:"buffer",bookType:"xlsx"});
  const parsed = XLSX.read(bytes,{type:"buffer"});
  assert.deepEqual(parsed.SheetNames,SHEETS);
  const reconciliation = XLSX.utils.sheet_to_json(parsed.Sheets["Monthly Reconciliation"]);
  assert.deepEqual(reconciliation.map(x=>x.period).sort(),["2026-10","9 Months"]);
});
test("historical sub-cent values retain source precision until annual totals are summed", () => {
  const template={organizationId:"zll",employeeNo:"ZLL01",employeeName:"Test",
    branch:"Abuja",year:2026,period:"9 Months",sourceType:"HISTORICAL_IMPORT",grossSalary:100};
  const r=buildConsolidatedReport({organizationId:"zll",year:2026,records:[
    {...template,sourceId:"paye1",paye:0.005,pensionEmployee:100.004},
    {...template,sourceId:"paye2",paye:0.005,pensionEmployee:100.004},
  ]});
  assert.equal(r.totals.paye,0.01);
  assert.equal(r.totals.pensionEmployee,200.01);
});
test("employee annual summary combines separate verified pension/PAYE sources by employee ID only", () => {
  const historic={organizationId:"zll",year:2026,sourceType:"HISTORICAL_IMPORT",
    employeeId:"e1",employeeName:"Employee One",employeeNo:"ZLL000001",branch:"Abuja",period:"9 Months"};
  const records=[
    {...historic,sourceId:"payefile:8",grossSalary:900000,paye:45000},
    {...historic,sourceId:"pensionfile:8",pensionEmployee:72000,pensionEmployer:90000},
    {...approved,sourceId:"oct:line1",grossSalary:100000,netSalary:82000,paye:6500,pensionEmployee:8000,pensionEmployer:10000},
    {...historic,sourceId:"another:8",employeeId:null,employeeNo:"LEGACYUNKNOWN",employeeName:"Duplicate Name",grossSalary:999999},
  ];
  const report=buildConsolidatedReport({organizationId:"zll",year:2026,records});
  const result=annualEmployeeSummary(report);
  assert.equal(result.length,1);
  assert.equal(result[0].employeeId,"e1");
  assert.equal(result[0].grossSalary,1000000);
  assert.equal(result[0].paye,51500);
  assert.equal(result[0].pensionEmployee,80000);
  assert.equal(result[0].pensionEmployer,100000);
  assert.equal(result[0].netSalary,82000);
  assert.match(result[0].netSalaryCoverage,/PARTIAL/);
  assert.match(result[0].periods,/9 Months/);
  assert.match(result[0].periods,/2026-10/);
});
test("exited historical employee without CHRiS ID stays in company totals and unassigned branch",()=>{
  const source={organizationId:"zll",year:2026,sourceType:"HISTORICAL_IMPORT",
    sourceId:"historical:STAFF PENSION:77",employeeId:null,employeeNo:"",
    employeeName:"Historical Exited Employee",period:"9 Months",
    identityDisposition:"EXITED_HISTORICAL",employmentStatus:"EXITED",branch:null,
    pensionEmployee:8000,pensionEmployer:10000,historicalReviewStatus:"VERIFIED"};
  const report=buildConsolidatedReport({organizationId:"zll",year:2026,records:[source]});
  assert.equal(report.rows.length,1);
  assert.equal(report.rows[0].employeeId,null);
  assert.equal(report.rows[0].employeeNo,"");
  assert.equal(report.rows[0].employmentStatus,"EXITED");
  assert.equal(report.totals.pensionTotal,18000);
  assert.equal(report.unresolved.length,1);
  assert.equal(report.branches.Abuja.length,0);
  const wb=buildStatutoryWorkbook(report);
  assert.ok(wb.SheetNames.includes("Exited Historical"));
  const exits=XLSX.utils.sheet_to_json(wb.Sheets["Exited Historical"]);
  assert.equal(exits.length,1);
  assert.equal(exits[0].historicalBranch,"UNVERIFIED — COMBINED ONLY");
  assert.ok(report.exceptions.some(e=>e.code==="EXITED_HISTORICAL_UNLINKED"));
  assert.ok(!report.exceptions.some(e=>e.code==="UNMATCHED_EMPLOYEE"));
});
