"use strict";
const fs=require("node:fs");
const {previewHistoricalWorkbook}=require("../src/services/consolidatedStatutoryHistoricalImportService");
const {buildConsolidatedReport}=require("../src/services/consolidatedStatutoryReportService");
const source=process.argv[2];
if(!source) throw new Error("Provide path to authorized historical workbook");
const preview=previewHistoricalWorkbook({buffer:fs.readFileSync(source),organizationId:"STAGING_PREVIEW_ONLY",year:2026});
const report=buildConsolidatedReport({organizationId:"STAGING_PREVIEW_ONLY",year:2026,records:preview.records});
const paye=preview.diagnostics.find(x=>x.sheet==="STAFF PAYE");
const pension=preview.diagnostics.find(x=>x.sheet==="STAFF PENSION");
const result={
  pensionEmployeeRows:pension?.accepted,
  payeEmployeeRows:paye?.accepted,
  sourceMonths:paye?.sourceTotals?.length,
  sourceGrossDelta:paye?.sourceReconciliation?.grossDelta,
  sourcePayeDelta:paye?.sourceReconciliation?.payeDelta,
  grossSalary:report.totals.grossSalary,paye:report.totals.paye,
  employeePension:report.totals.pensionEmployee,employerPension:report.totals.pensionEmployer,
  exceptionCounts:preview.exceptions.reduce((a,e)=>(a[e.code]=(a[e.code]||0)+1,a),{})
};
console.log(JSON.stringify(result,null,2));
const expected={pensionEmployeeRows:163,payeEmployeeRows:181,sourceMonths:9,sourceGrossDelta:0,sourcePayeDelta:0,
  grossSalary:175524868.12,paye:6305163.04,employeePension:8554745.81,employerPension:10693432.26};
const failures=Object.entries(expected).filter(([key,value])=>Math.abs(result[key]-value)>0.009);
if(failures.length){ console.error("FAIL: source import validation differences:",failures.map(([key,v])=>({key,expected:v,actual:result[key]})));process.exitCode=1; }
else console.log("PASS: historical import balances with source workbook totals and employee row counts.");
