"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),Module=require("node:module");
// Isolate infrastructure only; execute the real ledger and leave posting services.
const originalLoad=Module._load;
Module._load=function(name,parent,...rest){
 if(parent?.filename.endsWith("/leaveService.js")&&["../config/prisma","./leaveDayCalculator","./leaveBalanceService","./serviceEligibility"].includes(name))return {};
 return originalLoad.call(this,name,parent,...rest);
};
const leave=require("../src/services/leaveService");
Module._load=originalLoad;
const {decide}=require("../src/services/zermattEssApprovalPersistence");
function fixture({status="PENDING",available=20,auditFails=false}={}){
 let state={row:{requestType:"LEAVE",employeeId:"e",status:"PENDING",version:3,currentIndex:2,requesterUserId:"employee",stages:[{type:"LEAVE_HR_VERIFICATION",userId:"hr",status:"APPROVED"},{type:"LEAVE_OPERATIONAL_APPROVAL",userId:"manager",status:"APPROVED"},{type:"LEAVE_HR_CONFIRMATION",userId:"hr",status:"PENDING"}],observers:[{userId:"audit"}],history:[]},request:{id:"r",employeeId:"e",status,startDate:new Date("2026-11-10"),leaveTypeId:"type",leavePolicyId:"policy",requestedUnits:5},balance:{id:"balance",openingBalance:available,used:0}};
 const locks=[];
 const tx={organization:{findUnique:async()=>({slug:"zermatt-liquor-limited"})},user:{findFirst:async()=>({id:"active"})},leaveRequest:{findFirst:async()=>state.request,update:async({data})=>Object.assign(state.request,data)},leavePolicy:{findFirst:async()=>({entitlementDays:available,allowNegativeBalance:false})},leaveBalance:{findUnique:async()=>state.balance,update:async({data})=>{state.balance.used+=Number(data.used.increment);return state.balance;}},organizationAudit:{create:async()=>{if(auditFails)throw Error("AUDIT_WRITE_FAILED");}},$queryRawUnsafe:async(sql,...args)=>{
  if(sql.startsWith('SELECT e.')){locks.push("employee");return [{id:"e"}];}
  if(sql.startsWith('SELECT *')){if(sql.includes("FOR UPDATE"))locks.push("workflow");return [state.row];}
  if(sql.startsWith('UPDATE "ess_approval_workflows"')){state.row={...state.row,status:args[3],version:args[4],currentIndex:args[5],stages:JSON.parse(args[6]),observers:JSON.parse(args[7]),history:JSON.parse(args[8])};return [{id:"w"}];}
  throw Error("UNEXPECTED_SQL");
 }};
 return {tx,locks,state:()=>state,db:{$transaction:async fn=>{const before=structuredClone(state);try{return await fn(tx);}catch(e){state=before;throw e;}}}};
}
const command={organizationId:"o",requestType:"LEAVE",requestId:"r",actorUserId:"hr",decision:"CONFIRM",expectedVersion:3};
test("final HR confirmation posts existing leave balance and ledger atomically, once",async()=>{
 const f=fixture();const result=await decide(f.db,command);
 assert.equal(result.status,"COMPLETED");assert.equal(f.state().request.status,"APPROVED");assert.equal(f.state().balance.used,5);
 assert.deepEqual(f.locks.slice(0,2),["employee","workflow"]);
 await assert.rejects(()=>decide(f.db,command),/WORKFLOW_NOT_PENDING/);assert.equal(f.state().balance.used,5);
});
test("audit failure rolls back balance, request and workflow together",async()=>{
 const f=fixture({auditFails:true});await assert.rejects(()=>decide(f.db,command),/AUDIT_WRITE_FAILED/);
 assert.equal(f.state().balance.used,0);assert.equal(f.state().request.status,"PENDING");assert.equal(f.state().row.version,3);
});
test("insufficient balance, cancellation, stale version and audit observer cannot approve",async()=>{
 for(const [settings,patch,code] of [[{available:2},{},/INSUFFICIENT_LEAVE_BALANCE/],[{status:"CANCELLED"},{},/LEAVE_REQUEST_NOT_PENDING/],[{},{expectedVersion:2},/WORKFLOW_VERSION_CONFLICT/],[{},{actorUserId:"audit"},/AUDIT_OBSERVER_READ_ONLY/]]){
  const f=fixture(settings);await assert.rejects(()=>decide(f.db,{...command,...patch}),code);assert.equal(f.state().balance.used,0);
 }
});
test("legacy review cannot bypass routed approval even with feature disabled",async()=>{
 const f=fixture();await assert.rejects(()=>leave.reviewLeaveRequestInTransaction({organizationId:"o",leaveRequestId:"r",reviewerUserId:"hr",decision:"APPROVE"},f.tx),/ESS_LEAVE_ROUTED_APPROVAL_REQUIRED/);
 assert.equal(f.state().balance.used,0);
});
test("rejection releases reservation; unsupported return leaves both records unchanged",async()=>{
 const f=fixture();const next=await decide(f.db,{...command,decision:"REJECT",reason:"Not eligible"});
 assert.equal(next.status,"REJECTED");assert.equal(f.state().request.status,"REJECTED");assert.equal(f.state().balance.used,0);
 const returned=fixture();await assert.rejects(()=>decide(returned.db,{...command,decision:"RETURN",reason:"Correct dates"}),/LEAVE_RETURN_NOT_READY/);
 assert.equal(returned.state().request.status,"PENDING");assert.equal(returned.state().row.version,3);
});
