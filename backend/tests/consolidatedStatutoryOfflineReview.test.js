"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {validateReviews}=require("../scripts/validate-statutory-review-342.cjs");
const sourceRecords=[
 {sourceSheet:"PAYE",sourceRow:8,name:"Example One",employeeNo:"OLD001",period:"9 Months"},
 {sourceSheet:"PENSION",sourceRow:2,name:"Another Two",employeeNo:"",period:"5 Months"},
];
const employees=[{employeeNo:"ZLL001",name:"Example One"},{employeeNo:"ZLL002",name:"Another Two"}];
const first={
 "Source Sheet":"PAYE","Original Row":8,"Historical Employee Name":"Example One",
 "Historical Employee No":"OLD001","Historical Period":"9 Months",
 "HR Verified Employee No":"ZLL001","HR Verified Historical Branch":"ABUJA",
 "Evidence/HR Review Notes":"Legacy number confirmed against HR employee register",
 "HR Decision":"VERIFIED"
};
const second={...first,"Source Sheet":"PENSION","Original Row":2,
 "Historical Employee Name":"Another Two","Historical Employee No":"","Historical Period":"5 Months",
 "HR Verified Employee No":"ZLL002","HR Verified Historical Branch":"PORT HARCOURT",
 "Evidence/HR Review Notes":"Historical branch confirmed from employment record"};
const check=(queue)=>validateReviews({queue,sourceRecords,employeeRows:employees});
test("only complete independently reviewed source rows clear the offline gate",()=>{
 const r=check([first,second]);
 assert.equal(r.readyForVerification,true);
 assert.equal(r.counts.verified,2);
 assert.equal(r.errorCount,0);
});
test("pending or rejected rows prevent certification but aren't errors",()=>{
 const pending=check([{...first,"HR Decision":"PENDING"},second]);
 assert.equal(pending.errorCount,0);
 assert.equal(pending.readyForVerification,false);
 const rejected=check([{...first,"HR Decision":"REJECTED"},second]);
 assert.equal(rejected.errorCount,0);
 assert.equal(rejected.readyForVerification,false);
});
test("unknown employee, missing branch and weak evidence fail verification",()=>{
 const r=check([{...first,"HR Verified Employee No":"FOREIGN","HR Verified Historical Branch":"",
 "Evidence/HR Review Notes":"bad"},second]);
 assert.deepEqual(new Set(r.errors.map(x=>x.code)),
  new Set(["VERIFIED_EMPLOYEE_NOT_FOUND_IN_SNAPSHOT","HISTORICAL_BRANCH_NOT_VERIFIED",
 "VERIFICATION_EVIDENCE_REQUIRED","EMPLOYEE_NUMBER_DIFFERENCE_NEEDS_EXPLANATION"]));
});
test("missing rows, duplicate rows, source tampering and invalid decisions fail",()=>{
 const r=check([{...first,"Historical Employee Name":"Changed","HR Decision":"APPROVED"},first]);
 assert.ok(r.errors.some(x=>x.code==="SOURCE_DETAILS_CHANGED"));
 assert.ok(r.errors.some(x=>x.code==="INVALID_HR_DECISION"));
 assert.ok(r.errors.some(x=>x.code==="DUPLICATE_SOURCE_ROW"));
 assert.ok(r.errors.some(x=>x.code==="SOURCE_ROW_MISSING_FROM_QUEUE"));
 assert.equal(r.readyForVerification,false);
});
test("exited historical record needs no employee ID and may retain unknown branch",()=>{
 const exited={...second,"HR Verified Employee No":"","HR Verified Historical Branch":"",
  "HR Decision":"EXITED_HISTORICAL",
  "Evidence/HR Review Notes":"HR confirms exited employee from historical statutory workbook"};
 const r=check([first,exited]);
 assert.equal(r.counts.exitedHistorical,1);
 assert.equal(r.counts.verified,1);
 assert.equal(r.errorCount,0);
 assert.equal(r.readyForVerification,true);
});
