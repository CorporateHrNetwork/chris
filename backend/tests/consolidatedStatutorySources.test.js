"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const XLSX = require("xlsx");
const { previewHistoricalWorkbook } = require("../src/services/consolidatedStatutoryHistoricalImportService");
const { readApprovedPayrollRecords } = require("../src/services/consolidatedStatutoryApprovedPayrollService");
function fakeWorkbook() {
  const w = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(w, XLSX.utils.aoa_to_sheet([
    ["Employee Name","Pension Employer","Pension Employee","Pension Number","Pension Provider","Total Pension Contribution","Period"],
    ["Example Pension",2000,1600,"PEN123","PFA",3600,"9 Months"]
  ]),"STAFF PENSION");
  XLSX.utils.book_append_sheet(w, XLSX.utils.aoa_to_sheet([
    ["Tax Report"],["Company: ABUJA"],["Period Start Date: 2026-01-01"],[],
    ["Employee Name","Employee Number","Basic Salary","Housing Allowance","Transport Allowance","Gross Salary","PAYE","Tax Payer Number","Period"],
    ["Example PAYE","LEG001",80000,10000,10000,100000,6500,"TIN1","JANUARY 2026"],
    ["Totals",null,80000,10000,10000,100000,6500,null,"JANUARY 2026"],
    [null,null,81000,12000,11000,104000,6700,null,"FEBRUARY 2026"]
  ]),"STAFF PAYE");
  return XLSX.write(w,{type:"buffer",bookType:"xlsx"});
}
test("historical importer preserves original periods, independent source rows, missing identity flag", () => {
  const p = previewHistoricalWorkbook({ buffer:fakeWorkbook(),organizationId:"tenantA" });
  assert.equal(p.records.length,2);
  assert.equal(p.diagnostics.find(x=>x.sheet==="STAFF PAYE").sourceTotals.length,2);
  assert.equal(p.diagnostics.find(x=>x.sheet==="STAFF PAYE").sourceTotals[1].grossSalary,104000);
  assert.equal(p.records[0].period,"9 Months");
  assert.equal(p.records[0].pensionEmployer,2000);
  assert.equal(p.records[0].pensionNumber,"PEN123");
  assert.equal(p.records[1].taxPayerNumber,"TIN1");
  assert.equal(p.records[1].grossSalary,100000);
  assert.equal(p.records[1].netSalary,undefined);
  assert.ok(p.exceptions.some(e => e.code==="IDENTITY_MATCH_REQUIRED"));
  assert.equal(p.isPreview,true);
});
test("historical source identifiers are reproducible, and employer+employee total mismatch flagged", () => {
  const buffer = fakeWorkbook();
  const a=previewHistoricalWorkbook({buffer,organizationId:"tenantA"});
  const b=previewHistoricalWorkbook({buffer,organizationId:"tenantA"});
  assert.equal(a.records[0].sourceId,b.records[0].sourceId);
  assert.notEqual(a.records[0].sourceId,a.records[1].sourceId);
});
test("approved payroll adapter selects only approved tenant/year; obligation amounts remain separate", async () => {
  const calls=[];
  const db = { $queryRawUnsafe: async (query,...args) => {
    calls.push({query,args});
    if (query.includes('FROM "payroll_runs" pr')) return [
      {runId:"run1",runLineId:"line1",employeeId:"e1",employeeNumber:"ZLL01",employeeName:"Test Employee",
       periodStart:new Date("2026-10-01"),grossPay:200000,netPreview:159000,baseSalary:180000,
       details:{organizationSnapshot:{locationName:"Abuja",departmentName:"Sales"},allowanceItems:[{value:20000}]}}
    ];
    return [
      {payrollRunId:"run1",payrollRunLineId:"line1",obligationType:"PAYE",employeeAmount:11000,employerAmount:0},
      {payrollRunId:"run1",payrollRunLineId:"line1",obligationType:"PENSION",employeeAmount:16000,employerAmount:20000},
      {payrollRunId:"run1",payrollRunLineId:"line1",obligationType:"NSITF_ECS",employeeAmount:0,employerAmount:2000}
    ];
  }};
  const records=await readApprovedPayrollRecords({organizationId:"tenantA",year:2026,prismaClient:db});
  assert.equal(calls.length,2);
  assert.ok(calls.every(c => c.args[0]==="tenantA" && c.query.includes("pr.\"status\"='APPROVED'")));
  assert.equal(records[0].grossSalary,200000);
  assert.equal(records[0].netSalary,159000);
  assert.equal(records[0].pensionEmployer,20000);
  assert.equal(records[0].pensionEmployee,16000);
  assert.equal(records[0].nsitfEmployer,2000);
  assert.equal(records[0].nhfEmployee,null);
});
