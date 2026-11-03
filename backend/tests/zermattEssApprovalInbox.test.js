"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {inbox}=require("../src/services/zermattEssApprovalInboxService");
function fixture(){const calls=[];const row={requestType:"LOAN",requestId:"r",requesterUserId:"employee",status:"PENDING",version:2,currentIndex:1,employeeNumber:"SYN-1",employeeName:"Synthetic Employee",principalAmount:100,installmentAmount:10,purpose:"Staff Loan",loanNotes:"Synthetic reason",stages:[{type:"LOAN_BRANCH_MANAGER_APPROVAL",userId:"branch",role:"BRANCH_MANAGER",status:"APPROVED"},{type:"LOAN_HEAD_HR_VERIFICATION",userId:"hr",role:"HEAD_HR",status:"PENDING"}],observers:[{userId:"audit"}],history:[{decision:"APPROVE",paymentEvidence:{reference:"private"}}]};return {row,calls,db:{organization:{findUnique:async()=>({slug:"zermatt-liquor-limited"})},user:{findFirst:async()=>({id:"active"})},$queryRawUnsafe:async(...args)=>{calls.push(args);return [row];}}};}
test.before(()=>{process.env.ZERMATT_ESS_APPROVALS_ENABLED="true"});test.after(()=>{delete process.env.ZERMATT_ESS_APPROVALS_ENABLED});
test("current approver sees financial terms; employee cannot approve their own application",async()=>{
 const f=fixture();const [hr]=await inbox(f.db,{organizationId:"org",userId:"hr"});assert.equal(hr.canAct,true);assert.equal(hr.details.principalAmount,100);
 const [employee]=await inbox(f.db,{organizationId:"org",userId:"employee"});assert.equal(employee.canAct,false);
 assert.deepEqual(f.calls[0].slice(1),["org","hr"]);assert.match(f.calls[0][0],/jsonb_array_elements/);assert.match(f.calls[0][0],/w\."organizationId"=\$1/);
});
test("audit receives read-only stage history without confidential financial evidence",async()=>{
 const f=fixture();const [audit]=await inbox(f.db,{organizationId:"org",userId:"audit"});assert.equal(audit.canAct,false);assert.equal(audit.details,null);assert.equal(audit.history[0].paymentEvidence,undefined);
});
test("terminal requests never expose an actionable control",async()=>{
 const f=fixture();f.row.status="CANCELLED";const [row]=await inbox(f.db,{organizationId:"org",userId:"hr"});assert.equal(row.canAct,false);assert.equal(row.currentStage,null);
});
test("supporting forms are available only to participants and never to Audit observers",async()=>{
 const {applicationForm}=require("../src/services/zermattEssApprovalInboxService"),f=fixture();
 const query=f.db.$queryRawUnsafe;
 f.db.$queryRawUnsafe=async(sql,...args)=>sql.includes('FROM "payroll_loan_attachments"')?[{fileName:"synthetic.pdf",mimeType:"application/pdf",content:Buffer.from("synthetic")}]:query(sql,...args);
 await assert.rejects(()=>applicationForm(f.db,{organizationId:"org",userId:"audit"},"r"),/AUDIT_OBSERVER_READ_ONLY/);
 await assert.rejects(()=>applicationForm(f.db,{organizationId:"org",userId:"outsider"},"r"),/WORKFLOW_ACCESS_DENIED/);
 const form=await applicationForm(f.db,{organizationId:"org",userId:"hr"},"r");assert.equal(Buffer.from(form.contentBase64,"base64").toString(),"synthetic");
});
