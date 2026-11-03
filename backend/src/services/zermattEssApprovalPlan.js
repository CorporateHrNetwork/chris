"use strict";

/**
 * Zermatt ESS workflow stage planning. No database writes, email delivery,
 * loan disbursement or payroll side effects are permitted in this module.
 * Every actionable stage is bound to one active user and one request version.
 */
const ZERMATT="zermatt-liquor-limited";
const LEAVE="LEAVE", LOAN="LOAN";
const AUDIT="HEAD_AUDIT_OBSERVER";
const LEAVE_ROLE="REPORTING_LINE_MANAGER";
const STAGES=Object.freeze({
 LEAVE_HR:"LEAVE_HR_VERIFICATION",
 LEAVE_MANAGER:"LEAVE_OPERATIONAL_APPROVAL",
 LEAVE_FINAL:"LEAVE_HR_CONFIRMATION",
 LOAN_BRANCH:"LOAN_BRANCH_MANAGER_APPROVAL",
 LOAN_HR:"LOAN_HEAD_HR_VERIFICATION",
 LOAN_GM:"LOAN_GM_APPROVAL",
 LOAN_PAYMENT:"LOAN_CHIEF_ACCOUNTANT_DISBURSEMENT",
});
function fail(code,statusCode=409){const e=new Error(code);e.code=code;e.statusCode=statusCode;throw e;}
function requireZermatt(slug){if(slug!==ZERMATT)fail("WORKFLOW_TENANT_NOT_ENABLED",403);}
function distinctActors(stages,requesterUserId){
 const seen=new Set();
 for(const s of stages){
  if(!s.userId||typeof s.userId!=="string")fail("APPROVER_NOT_ASSIGNED");
  if(s.userId===requesterUserId)fail("REQUESTER_CANNOT_APPROVE");
  if(seen.has(s.userId))fail("DUPLICATE_APPROVER_REQUIRES_HR_RESOLUTION");
  seen.add(s.userId);
 }
 return stages;
}
function stage(type,userId,role){return {type,userId,role,authority:"ACT"};}
function buildLeaveStages({organizationSlug,requesterUserId,hrUserId,managerChain,finalHrUserId}){
 requireZermatt(organizationSlug);
 if(!Array.isArray(managerChain)||!managerChain.length)fail("REPORTING_LINE_NOT_CONFIGURED");
 const stages=[
  stage(STAGES.LEAVE_HR,hrUserId,"BRANCH_OR_HEAD_HR"),
  ...managerChain.map((m,i)=>stage(STAGES.LEAVE_MANAGER,m.userId,m.designation||LEAVE_ROLE)),
  stage(STAGES.LEAVE_FINAL,finalHrUserId,"BRANCH_OR_HEAD_HR")
 ];
 // The HR verifier and confirmer may be the same user; the two stages are
 // intentionally separate actions at different points in the route.
 distinctActors(stages.slice(0,-1),requesterUserId);
 if(!finalHrUserId||finalHrUserId===requesterUserId)fail("FINAL_HR_NOT_ASSIGNED");
 if(managerChain.at(-1)?.isFinalBranchManager!==true)fail("FINAL_BRANCH_MANAGER_NOT_ASSIGNED");
 if(stages.slice(1,-1).some(s=>s.userId===finalHrUserId))fail("HR_AND_OPERATIONS_APPROVER_CONFLICT");
 return stages;
}
function buildLoanStages({organizationSlug,requesterUserId,branchManagerUserId,headHrUserId,gmUserId,chiefAccountantUserId}){
 requireZermatt(organizationSlug);
 return distinctActors([
  stage(STAGES.LOAN_BRANCH,branchManagerUserId,"BRANCH_BUSINESS_OPERATIONS_MANAGER"),
  stage(STAGES.LOAN_HR,headHrUserId,"HEAD_HR"),
  stage(STAGES.LOAN_GM,gmUserId,"GENERAL_MANAGER"),
  stage(STAGES.LOAN_PAYMENT,chiefAccountantUserId,"CHIEF_ACCOUNTANT"),
 ],requesterUserId);
}
function createPlan({type,requesterUserId,stages,observerUserIds=[]}){
 if(![LEAVE,LOAN].includes(type))fail("INVALID_WORKFLOW_TYPE",400);
 if(!Array.isArray(stages)||!stages.length)fail("WORKFLOW_STAGES_REQUIRED",400);
 const observers=[...new Set(observerUserIds.filter(Boolean))].filter(id=>id!==requesterUserId);
 return {
  type,status:"PENDING",version:1,currentIndex:0,requesterUserId,
  stages:stages.map((s,i)=>({...s,index:i,status:"PENDING",actedAt:null,decision:null})),
  observers:observers.map(userId=>({userId,role:AUDIT,authority:"VIEW_ONLY"})),
  history:[],
 };
}
function assertViewOnly(plan,userId){return plan.observers.some(x=>x.userId===userId);}
function transition(plan,{actorUserId,decision,expectedVersion,reason,paymentEvidence,at=new Date().toISOString()}){
 if(!plan||plan.status!=="PENDING")fail("WORKFLOW_NOT_PENDING");
 if(!Number.isInteger(expectedVersion)||plan.version!==expectedVersion)fail("WORKFLOW_VERSION_CONFLICT");
 if(assertViewOnly(plan,actorUserId))fail("AUDIT_OBSERVER_READ_ONLY",403);
 if(actorUserId===plan.requesterUserId)fail("REQUESTER_CANNOT_APPROVE",403);
 const current=plan.stages[plan.currentIndex];
 if(!current||current.userId!==actorUserId)fail("NOT_CURRENT_APPROVER",403);
 const command=String(decision||"").trim().toUpperCase();
 const finalLoanPayment=plan.type===LOAN&&current.type===STAGES.LOAN_PAYMENT;
 const finalLeaveConfirmation=plan.type===LEAVE&&current.type===STAGES.LEAVE_FINAL;
 const successCommand=finalLoanPayment?"DISBURSE":finalLeaveConfirmation?"CONFIRM":"APPROVE";
 if(![successCommand,"REJECT","RETURN"].includes(command))fail("INVALID_WORKFLOW_DECISION",400);
 if(command==="DISBURSE"){
  const amount=Number(paymentEvidence?.amount);
  const reference=String(paymentEvidence?.reference||"").trim();
  const paymentDate=String(paymentEvidence?.paymentDate||"").trim();
  if(!Number.isFinite(amount)||amount<=0||!reference||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(paymentDate)||Number.isNaN(new Date(paymentDate+"T00:00:00Z").getTime())||new Date(paymentDate+"T00:00:00Z").toISOString().slice(0,10)!==paymentDate)fail("DISBURSEMENT_EVIDENCE_REQUIRED",400);
 }
 if(![successCommand].includes(command)&&!String(reason||"").trim())fail("DECISION_REASON_REQUIRED",400);
 const next=structuredClone(plan);
 const row=next.stages[next.currentIndex];
 row.status=command===successCommand?(command==="DISBURSE"?"DISBURSED":command==="CONFIRM"?"CONFIRMED":"APPROVED"):command==="REJECT"?"REJECTED":"RETURNED";
 row.decision=command;row.actedAt=at;
 next.history.push({stage:row.type,actorUserId,decision:command,reason:String(reason||"").trim(),paymentEvidence:command==="DISBURSE"?{amount:Number(paymentEvidence.amount),reference:String(paymentEvidence.reference).trim(),paymentDate:String(paymentEvidence.paymentDate)}:null,at,version:plan.version});
 next.version+=1;
 if(command===successCommand){
  if(next.currentIndex===next.stages.length-1){next.status="COMPLETED";next.currentIndex=null;}
  else next.currentIndex+=1;
 }else{next.status=command==="REJECT"?"REJECTED":"RETURNED";next.currentIndex=null;}
 return next;
}
module.exports={ZERMATT,LEAVE,LOAN,AUDIT,STAGES,requireZermatt,buildLeaveStages,buildLoanStages,createPlan,transition,assertViewOnly};
