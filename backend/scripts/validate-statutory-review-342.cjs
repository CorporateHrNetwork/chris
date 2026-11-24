"use strict";
/**
 * Strict, offline HR-review file validation. Read-only: never posts matches
 * to CHRiS or modifies historical source/payroll. No employee PII in console.
 */
const fs=require("node:fs");
const XLSX=require("xlsx");
const {previewHistoricalWorkbook}=require("../src/services/consolidatedStatutoryHistoricalImportService");
const validBranches=new Set(["ABUJA","LAGOS","PORT HARCOURT"]);
const clean=v=>String(v??"").trim();
const uniqueKey=v=>clean(v).normalize("NFKC").toUpperCase();
function branchName(v) {
  const s=uniqueKey(v).replace(/[^A-Z]/g,"");
  if(["ABUJA","ABJ"].includes(s))return "ABUJA";
  if(["LAGOS","LGS"].includes(s))return "LAGOS";
  if(["PORTHARCOURT","PHC"].includes(s))return "PORT HARCOURT";
  return null;
}
function normalizeName(v) {return clean(v).normalize("NFKC").toUpperCase().replace(/[^\p{L}\p{N}]+/gu," ").replace(/\s+/g," ").trim();}
function parseRows(file) {
  const book=XLSX.readFile(file,{raw:true});
  const sheet=book.Sheets[book.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet,{defval:"",raw:false});
}
function validateReviews({queue,sourceRecords,employeeRows}) {
  const sources=new Map(sourceRecords.map(x=>[x.sourceSheet+":"+x.sourceRow,x]));
  const users=new Map(employeeRows.map(x=>[uniqueKey(x.employeeNo),x]));
  const visited=new Set(), errors=[],counts={pending:0,verified:0,rejected:0,exitedHistorical:0};
  for(let i=0;i<queue.length;i++){
    const r=queue[i],row=i+2;
    const sourceSheet=clean(r["Source Sheet"]).toUpperCase();
    const rowNo=Number(r["Original Row"]);
    const key=sourceSheet+":"+rowNo;
    const original=sources.get(key);
    const problem=(code)=>errors.push({queueRow:row,code});
    if(visited.has(key))problem("DUPLICATE_SOURCE_ROW");
    visited.add(key);
    if(!original){problem("UNKNOWN_SOURCE_ROW");continue;}
    if(normalizeName(r["Historical Employee Name"])!==normalizeName(original.name)||
       uniqueKey(r["Historical Employee No"])!==uniqueKey(original.employeeNo)||
       clean(r["Historical Period"])!==clean(original.period))problem("SOURCE_DETAILS_CHANGED");
    const decision=uniqueKey(r["HR Decision"]);
    if(decision==="PENDING"){counts.pending++;continue;}
    if(decision==="EXITED_HISTORICAL"){
      counts.exitedHistorical++;
      if(clean(r["HR Verified Employee No"]))problem("EXITED_HISTORICAL_MUST_NOT_INVENT_ID");
      if(clean(r["Evidence/HR Review Notes"]).length<12)problem("EXITED_CONFIRMATION_NOTE_REQUIRED");
      const branch=clean(r["HR Verified Historical Branch"]);
      if(branch && !branchName(branch))problem("INVALID_HISTORICAL_BRANCH");
      continue;
    }
    if(decision==="REJECTED"){
      counts.rejected++;
      if(clean(r["Evidence/HR Review Notes"]).length<12)problem("REJECTION_EVIDENCE_REQUIRED");
      continue;
    }
    if(decision!=="VERIFIED"){problem("INVALID_HR_DECISION");continue;}
    counts.verified++;
    const employeeNo=uniqueKey(r["HR Verified Employee No"]);
    const reviewerBranch=branchName(r["HR Verified Historical Branch"]);
    const notes=clean(r["Evidence/HR Review Notes"]);
    if(!employeeNo||!users.has(employeeNo))problem("VERIFIED_EMPLOYEE_NOT_FOUND_IN_SNAPSHOT");
    if(!reviewerBranch||!validBranches.has(reviewerBranch))problem("HISTORICAL_BRANCH_NOT_VERIFIED");
    if(notes.length<12)problem("VERIFICATION_EVIDENCE_REQUIRED");
    if(original.employeeNo && employeeNo!==uniqueKey(original.employeeNo) &&
       !/legacy|alias|renumber|employee number|rebase/i.test(notes))
      problem("EMPLOYEE_NUMBER_DIFFERENCE_NEEDS_EXPLANATION");
  }
  for(const key of sources.keys())if(!visited.has(key))errors.push({queueRow:null,code:"SOURCE_ROW_MISSING_FROM_QUEUE"});
  return {sourceCount:sources.size,queueCount:queue.length,counts,errorCount:errors.length,errors,
    readyForVerification:errors.length===0&&counts.pending===0&&counts.rejected===0&&counts.verified+counts.exitedHistorical===sources.size};
}
function validateFiles({reviewCsv,employeeExport,historicalWorkbook}) {
  const preview=previewHistoricalWorkbook({buffer:fs.readFileSync(historicalWorkbook),organizationId:"OFFLINE_REVIEW_ONLY",year:2026});
  const sourceRecords=preview.records.map(r=>{
    const parts=r.sourceId.split(":");
    return {sourceSheet:parts.at(-2)==="STAFF PAYE"?"PAYE":"PENSION",
      sourceRow:Number(parts.at(-1)),name:r.employeeName,employeeNo:r.employeeNo,period:r.period};
  });
  const employees=parseRows(employeeExport).map(x=>({employeeNo:x.EmployeeNO,name:x.FullName}));
  return validateReviews({queue:parseRows(reviewCsv),sourceRecords,employeeRows:employees});
}
if(require.main===module){
  const [reviewCsv,employeeExport,historicalWorkbook]=process.argv.slice(2);
  if(!reviewCsv||!employeeExport||!historicalWorkbook){console.error("Usage: node validate-statutory-review-342.cjs <review.csv> <employee-export.xlsx> <historical.xlsx>");process.exit(2);}
  const r=validateFiles({reviewCsv,employeeExport,historicalWorkbook});
  console.log(JSON.stringify({sourceRows:r.sourceCount,reviewRows:r.queueCount,decisions:r.counts,
    validationErrors:r.errorCount,errorCodes:[...new Set(r.errors.map(x=>x.code))],
    readyForVerification:r.readyForVerification},null,2));
  if(r.errorCount)process.exitCode=1;
}
module.exports={validateReviews,validateFiles,branchName};
