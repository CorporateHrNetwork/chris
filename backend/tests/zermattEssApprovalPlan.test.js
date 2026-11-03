"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {ZERMATT,STAGES,buildLeaveStages,buildLoanStages,createPlan,transition}=require("../src/services/zermattEssApprovalPlan");
const leave=()=>buildLeaveStages({organizationSlug:ZERMATT,requesterUserId:"employee",hrUserId:"hr",finalHrUserId:"hr",managerChain:[{userId:"leader",designation:"TEAM_LEADER"},{userId:"supervisor",designation:"SUPERVISOR"},{userId:"manager",designation:"BRANCH_MANAGER",isFinalBranchManager:true}]});
const loan=()=>buildLoanStages({organizationSlug:ZERMATT,requesterUserId:"employee",branchManagerUserId:"branch",headHrUserId:"hr",gmUserId:"gm",chiefAccountantUserId:"chief"});
test("leave requires HR verification then actual reporting line then HR confirmation",()=>{
 const s=leave();assert.deepEqual(s.map(x=>x.type),[STAGES.LEAVE_HR,STAGES.LEAVE_MANAGER,STAGES.LEAVE_MANAGER,STAGES.LEAVE_MANAGER,STAGES.LEAVE_FINAL]);
 assert.deepEqual(s.map(x=>x.userId),["hr","leader","supervisor","manager","hr"]);
});
test("loan requires branch manager before HR and GM; chief accountant last",()=>{
 assert.deepEqual(loan().map(x=>x.type),[STAGES.LOAN_BRANCH,STAGES.LOAN_HR,STAGES.LOAN_GM,STAGES.LOAN_PAYMENT]);
});
test("other tenants, absent managers, duplicates and self approval fail closed",()=>{
 assert.throws(()=>buildLoanStages({organizationSlug:"other",requesterUserId:"x"}),/WORKFLOW_TENANT_NOT_ENABLED/);
 assert.throws(()=>buildLoanStages({organizationSlug:ZERMATT,requesterUserId:"employee",branchManagerUserId:"same",headHrUserId:"same",gmUserId:"gm",chiefAccountantUserId:"chief"}),/DUPLICATE_APPROVER/);
 assert.throws(()=>buildLeaveStages({organizationSlug:ZERMATT,requesterUserId:"employee",hrUserId:"hr",finalHrUserId:"hr",managerChain:[]}),/REPORTING_LINE_NOT_CONFIGURED/);
 assert.throws(()=>buildLeaveStages({organizationSlug:ZERMATT,requesterUserId:"employee",hrUserId:"hr",finalHrUserId:"hr",managerChain:[{userId:"manager"}]}),/FINAL_BRANCH_MANAGER_NOT_ASSIGNED/);
 assert.throws(()=>buildLoanStages({organizationSlug:ZERMATT,requesterUserId:"employee",branchManagerUserId:"employee",headHrUserId:"hr",gmUserId:"gm",chiefAccountantUserId:"chief"}),/REQUESTER_CANNOT_APPROVE/);
});
test("audit is strictly read only and never a blocking approval stage",()=>{
 const plan=createPlan({type:"LOAN",requesterUserId:"employee",stages:loan(),observerUserIds:["audit"]});
 assert.equal(plan.observers[0].authority,"VIEW_ONLY");
 assert.equal(plan.stages.some(x=>x.userId==="audit"),false);
 assert.throws(()=>transition(plan,{actorUserId:"audit",decision:"APPROVE",expectedVersion:1}),/AUDIT_OBSERVER_READ_ONLY/);
 assert.throws(()=>transition(plan,{actorUserId:"employee",decision:"APPROVE",expectedVersion:1}),/REQUESTER_CANNOT_APPROVE/);
});
test("loan cannot skip branch manager, cannot replay a decision, and cannot release before payment stage",()=>{
 let p=createPlan({type:"LOAN",requesterUserId:"employee",stages:loan(),observerUserIds:["audit"]});
 assert.throws(()=>transition(p,{actorUserId:"gm",decision:"APPROVE",expectedVersion:1}),/NOT_CURRENT_APPROVER/);
 p=transition(p,{actorUserId:"branch",decision:"APPROVE",expectedVersion:1});
 assert.equal(p.stages[0].status,"APPROVED");assert.equal(p.status,"PENDING");
 assert.throws(()=>transition(p,{actorUserId:"branch",decision:"APPROVE",expectedVersion:1}),/WORKFLOW_VERSION_CONFLICT/);
 p=transition(p,{actorUserId:"hr",decision:"APPROVE",expectedVersion:2});
 p=transition(p,{actorUserId:"gm",decision:"APPROVE",expectedVersion:3});
 assert.equal(p.status,"PENDING");assert.equal(p.stages[3].status,"PENDING");
 p=transition(p,{actorUserId:"chief",decision:"APPROVE",expectedVersion:4});
 assert.equal(p.status,"COMPLETED");assert.equal(p.history.length,4);
});
test("rejection and return require reasons, never auto-advance",()=>{
 const plan=createPlan({type:"LEAVE",requesterUserId:"employee",stages:leave()});
 assert.throws(()=>transition(plan,{actorUserId:"hr",decision:"RETURN",expectedVersion:1}),/DECISION_REASON_REQUIRED/);
 const returned=transition(plan,{actorUserId:"hr",decision:"RETURN",expectedVersion:1,reason:"Missing handover"});
 assert.equal(returned.status,"RETURNED");assert.equal(returned.currentIndex,null);
 assert.equal(plan.status,"PENDING");
});
