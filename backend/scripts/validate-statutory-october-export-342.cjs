"use strict";
/** Read-only October 2026 exported payroll control comparison. No employee PII logged. */
const XLSX=require("xlsx");
const path=process.argv[2];
if(!path)throw Error("Provide existing approved payroll export path");
const book=XLSX.readFile(path,{cellDates:false});
function data(sheet){return XLSX.utils.sheet_to_json(book.Sheets[sheet],{defval:null,raw:true});}
const rows=data("Payroll Register"),summaries=data("Branch Statutory Summary");
const fields=["Gross Pay","Net Pay","PAYE","Employee Pension","Employer Pension","NHF","NSITF Employer","ITF Employer"];
const norm=v=>{const s=String(v??"").toUpperCase().replace(/[^A-Z]/g,"");return s.includes("ABUJA")?"Abuja":s.includes("LAGOS")?"Lagos":s==="PHC"||s.includes("PORTHARCOURT")?"PHC":"Unknown";};
const num=v=>v==null||v===""?0:Number(v);
const final=v=>Math.round((v+Number.EPSILON)*100)/100;
const buckets=new Map();
for(const row of rows){
 if(!row["Employee No"])continue;
 const b=norm(row.Branch);
 if(!buckets.has(b))buckets.set(b,{employees:0,amounts:Object.fromEntries(fields.map(f=>[f,0]))});
 const x=buckets.get(b);x.employees++;
 for(const f of fields)x.amounts[f]+=num(row[f]);
}
const comparisons=[];
for(const summary of summaries){
 const b=norm(summary.Branch);
 if(b==="Unknown")continue;
 const actual=buckets.get(b);
 const compare={
  branch:b,employees:actual?.employees||0,sourceEmployees:summary.Employees||0,
  gross:final(actual?.amounts["Gross Pay"]||0),net:final(actual?.amounts["Net Pay"]||0),
  paye:final(actual?.amounts.PAYE||0),payeFromSummary:num(summary["Total PAYE Charge"]),
  employeePension:final(actual?.amounts["Employee Pension"]||0),
  employeePensionFromSummary:num(summary["Employee Pension"]),
  employerPension:final(actual?.amounts["Employer Pension"]||0),
  employerPensionFromSummary:num(summary["Employer Pension"]),
  nhf:final(actual?.amounts.NHF||0),
  nsitf:final(actual?.amounts["NSITF Employer"]||0),
  itf:final(actual?.amounts["ITF Employer"]||0),
 };
 compare.exceptions=[];
 if(compare.employees!==compare.sourceEmployees)compare.exceptions.push("EMPLOYEE_COUNT_DIFFERENCE");
 for(const [key,key2] of [["paye","payeFromSummary"],["employeePension","employeePensionFromSummary"],["employerPension","employerPensionFromSummary"]])
  if(Math.abs(compare[key]-compare[key2])>0.02)compare.exceptions.push(key.toUpperCase()+"_DIFFERENCE");
 comparisons.push(compare);
}
const total={employees:comparisons.reduce((n,x)=>n+x.employees,0)};
for(const f of ["gross","net","paye","employeePension","employerPension","nhf","nsitf","itf"])
 total[f]=final(comparisons.reduce((n,x)=>n+x[f],0));
console.log(JSON.stringify({period:"2026-10",exportLabel:"CHRiS APPROVED payout pack — local copy, not a live database confirmation",
  branchComparison:comparisons,overall:total,pass:comparisons.every(x=>x.exceptions.length===0)},null,2));
if(comparisons.some(x=>x.exceptions.length))process.exitCode=1;
