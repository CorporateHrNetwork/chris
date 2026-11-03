"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),Module=require("node:module");
const oldLoad=Module._load;
let revalidate=async()=>{};
Module._load=function(name,parent,...rest){
 if(name==="../config/prisma")return {};
 if(name==="./payrollDraftFreshnessService")return {markDraftRunsRecalculationRequired:async({prismaClient})=>prismaClient.freshness()};
 if(name==="./loanWorkflowNotificationService")return {};
 if(name==="./loanCollateralWorkflowService")return {revalidateExistingLoan:args=>revalidate(args)};
 return oldLoad.call(this,name,parent,...rest);
};
const financial=require("../src/services/loanOriginationWorkflowService");
const integration=require("../src/services/zermattEssLoanIntegration");
// Keep infrastructure interception in this isolated test process: some financial
// dependencies load only during the real transaction, never at module import.
const roles={employee:"Employee",branch:"Branch Operations Manager",hr:"Head of HR & Admin",gm:"General Manager",chief:"Chief Accountant",audit:"Head of Audit & Internal Controls"};
function fixture(){
 let state={loan:{id:"loan",organizationId:"org",employeeId:"employee-id",createdByUserId:"employee",essApprovalRequired:true,status:"DRAFT",principalAmount:100,installmentAmount:10,applicationVersion:1,loanNumber:"LN-SYN-1"},workflow:null,outbox:[],events:[],audits:[],freshness:0};
 const users=Object.entries(roles).map(([id,name])=>({id,email:id+"@example.invalid",employeeId:id==="employee"?"employee-id":id==="branch"?"manager-id":null,isActive:true,locationScope:"ALL_LOCATIONS",userRoles:[{role:{name}}]}));
 const tx={organization:{findUnique:async()=>({slug:"zermatt-liquor-limited"})},employee:{findFirst:async()=>({id:"employee-id",status:"ACTIVE",locationId:"a"})},user:{findFirst:async({where})=>users.find(u=>u.id===where.id&&u.isActive&&(!where.employeeId||u.employeeId===where.employeeId)),findMany:async({where})=>users.filter(u=>u.isActive&&(!where.id||where.id.in.includes(u.id)))},employeeLineManagerAssignment:{findMany:async()=>[{manager:{id:"manager-id",locationId:"a",status:"ACTIVE",designation:{name:"Branch Operations Manager"}}}]},organizationAudit:{create:async({data})=>{state.audits.push(data);}},freshness:async()=>{state.freshness++;},$queryRawUnsafe:async(sql,...args)=>{
  if(sql.startsWith('SELECT COUNT'))return [{count:1}];
  if(sql.startsWith('SELECT * FROM "ess_approval_workflows"'))return state.workflow?[structuredClone(state.workflow)]:[];
  if(sql.startsWith('SELECT * FROM "payroll_loans"')){
   if(args.length===3&&args[1]!==state.loan.employeeId)return [];
   return [structuredClone(state.loan)];
  }
  if(sql.startsWith('SELECT l.*'))return [structuredClone(state.loan)];
  if(sql.startsWith('INSERT INTO "ess_approval_workflows"')){
   if(state.workflow)return [];
   state.workflow={id:"w",organizationId:args[1],requestType:args[2],requestId:args[3],employeeId:args[4],requesterUserId:args[5],status:args[6],version:args[7],currentIndex:args[8],stages:JSON.parse(args[9]),observers:JSON.parse(args[10]),history:JSON.parse(args[11])};return [{id:"w"}];
  }
  if(sql.startsWith('UPDATE "ess_approval_workflows"')){
   if(state.workflow.version!==args[9])return [];
   Object.assign(state.workflow,{status:args[3],version:args[4],currentIndex:args[5],stages:JSON.parse(args[6]),observers:JSON.parse(args[7]),history:JSON.parse(args[8])});return [{id:"w"}];
  }
  throw Error("UNEXPECTED_QUERY: "+sql);
 },$executeRawUnsafe:async(sql,...args)=>{
  if(sql.startsWith('UPDATE "payroll_loans"')){
   if(sql.includes("'PENDING_BRANCH_MANAGER_APPROVAL'"))state.loan.status="PENDING_BRANCH_MANAGER_APPROVAL";
   else if(sql.includes("'ACTIVE'")){state.loan.status="ACTIVE";state.loan.disbursedDate=args[2];state.loan.recoveryStartDate=args[3];state.loan.disbursementReference=args[4];}
   else state.loan.status=args[2];
  }else if(sql.startsWith('INSERT INTO "payroll_loan_notification_outbox"')){if(!state.outbox.some(n=>n.id===args[0]))state.outbox.push({id:args[0],user:args[3],body:args[7]});}
  else if(sql.startsWith('INSERT INTO "payroll_loan_workflow_events"'))state.events.push(args);
  else if(!sql.startsWith('UPDATE "payroll_loan_email_approval_tokens"'))throw Error("UNEXPECTED_EXECUTE: "+sql);
  return 1;
 }};
 const db={$transaction:async fn=>{const before=structuredClone(state);try{return await fn(tx);}catch(e){state=before;throw e;}},$queryRawUnsafe:(...args)=>tx.$queryRawUnsafe(...args)};
 return {db,tx,users,state:()=>state};
}
const scope={organizationId:"org",employeeId:"employee-id",userId:"employee"};
const args={organizationId:"org",loanId:"loan"};
async function throughBranch(f){await integration.submit(f.db,scope,"loan");await integration.branchDecision(f.db,{...args,actorUserId:"branch",decision:"APPROVE",expectedVersion:1});}
async function throughGm(f){await throughBranch(f);await financial.hrVerificationDecision({...args,actorUserId:"hr",decision:"VERIFY",expectedVersion:2,prismaClient:f.db});await financial.gmDecision({...args,actorUserId:"gm",decision:"APPROVE",expectedVersion:3,prismaClient:f.db});}
test.before(()=>{process.env.ZERMATT_ESS_APPROVALS_ENABLED="true";});
test.after(()=>{Module._load=oldLoad;delete process.env.ZERMATT_ESS_APPROVALS_ENABLED;});
test("ESS submission follows branch -> HR -> GM -> existing payment/recovery activation",async()=>{
 const f=fixture();await throughGm(f);
 assert.equal(f.state().loan.status,"AWAITING_DISBURSEMENT");assert.equal(f.state().freshness,0);
 await financial.disburseApprovedLoan({...args,actorUserId:"chief",expectedVersion:4,input:{disbursedDate:"2026-11-03",recoveryStartDate:"2026-12-01",disbursementReference:"SYN-REF"},prismaClient:f.db});
 assert.equal(f.state().loan.status,"ACTIVE");assert.equal(f.state().workflow.status,"COMPLETED");assert.equal(f.state().freshness,1);
 assert.equal(f.state().loan.principalAmount,100);assert.equal(f.state().loan.disbursementReference,"SYN-REF");
 assert.equal(new Set(f.state().outbox.map(n=>n.id)).size,f.state().outbox.length);
});
test("HR cannot skip branch and broad permissions cannot replace current assigned actor",async()=>{
 const f=fixture();await integration.submit(f.db,scope,"loan");
 await assert.rejects(()=>financial.hrVerificationDecision({...args,actorUserId:"hr",decision:"VERIFY",expectedVersion:1,prismaClient:f.db}),/ESS_LOAN_STAGE_MISMATCH/);
 await assert.rejects(()=>integration.branchDecision(f.db,{...args,actorUserId:"hr",decision:"APPROVE",expectedVersion:1}),/WORKFLOW_AUTHORITY_CHANGED/);
 await assert.rejects(()=>integration.branchDecision(f.db,{...args,actorUserId:"audit",decision:"APPROVE",expectedVersion:1}),/WORKFLOW_AUTHORITY_CHANGED/);
 assert.equal(f.state().workflow.version,1);
});
test("wrong employee, duplicate submission, stale decision and revoked role fail closed",async()=>{
 const f=fixture();await assert.rejects(()=>integration.submit(f.db,{...scope,employeeId:"other"},"loan"),/ESS_EMPLOYEE_SESSION_REQUIRED/);
 await integration.submit(f.db,scope,"loan");await assert.rejects(()=>integration.submit(f.db,scope,"loan"),/ESS_LOAN_NOT_DRAFT/);
 await assert.rejects(()=>integration.branchDecision(f.db,{...args,actorUserId:"branch",decision:"APPROVE",expectedVersion:0}),/WORKFLOW_VERSION_CONFLICT/);
 f.users.find(u=>u.id==="branch").isActive=false;
 await assert.rejects(()=>integration.branchDecision(f.db,{...args,actorUserId:"branch",decision:"APPROVE",expectedVersion:1}),/WORKFLOW_ACTOR_NOT_ACTIVE/);
});
test("outbox or audit failures roll back financial state and stage together",async()=>{
 const f=fixture();await throughBranch(f);const execute=f.tx.$executeRawUnsafe;
 f.tx.$executeRawUnsafe=async(sql,...values)=>{if(sql.includes('INSERT INTO "payroll_loan_notification_outbox"'))throw Error("OUTBOX_FAILED");return execute(sql,...values);};
 await assert.rejects(()=>financial.hrVerificationDecision({...args,actorUserId:"hr",decision:"VERIFY",expectedVersion:2,prismaClient:f.db}),/OUTBOX_FAILED/);
 assert.equal(f.state().loan.status,"PENDING_HR_VERIFICATION");assert.equal(f.state().workflow.version,2);
});
test("payment requires actual reference, correct accountant and is recorded only once",async()=>{
 const f=fixture();await throughGm(f);
 const payment={...args,actorUserId:"chief",expectedVersion:4,input:{disbursedDate:"2026-11-03",recoveryStartDate:"2026-12-01"},prismaClient:f.db};
 await assert.rejects(()=>financial.disburseApprovedLoan(payment),/DISBURSEMENT_EVIDENCE_REQUIRED/);
 payment.input.disbursementReference="SYN-PAYMENT";
 await assert.rejects(()=>financial.disburseApprovedLoan({...payment,actorUserId:"gm"}),/WORKFLOW_AUTHORITY_CHANGED/);
 await financial.disburseApprovedLoan(payment);await assert.rejects(()=>financial.disburseApprovedLoan(payment),/ESS_LOAN_STAGE_MISMATCH/);
 assert.equal(f.state().freshness,1);assert.equal(f.state().loan.status,"ACTIVE");
});
test("rejection releases application without financial activation; reasons are mandatory",async()=>{
 const f=fixture();await integration.submit(f.db,scope,"loan");
 await assert.rejects(()=>integration.branchDecision(f.db,{...args,actorUserId:"branch",decision:"REJECT",expectedVersion:1}),/DECISION_REASON_REQUIRED/);
 await integration.branchDecision(f.db,{...args,actorUserId:"branch",decision:"REJECT",expectedVersion:1,reason:"Not eligible"});
 assert.equal(f.state().loan.status,"REJECTED");assert.equal(f.state().workflow.status,"REJECTED");assert.equal(f.state().freshness,0);
});
test("gate off blocks ESS decisions, without imposing ESS stages on historical loans",async()=>{
 process.env.ZERMATT_ESS_APPROVALS_ENABLED="false";
 try{
  const f=fixture();await assert.rejects(()=>integration.submit(f.db,scope,"loan"),/ESS_LOAN_WORKFLOW_DISABLED/);
  assert.equal(await integration.prepare({}, {loan:{essApprovalRequired:false}}),null);
 }finally{process.env.ZERMATT_ESS_APPROVALS_ENABLED="true";}
});
