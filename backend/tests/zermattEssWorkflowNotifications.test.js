"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {createPlan,buildLoanStages,ZERMATT,transition}=require("../src/services/zermattEssApprovalPlan");
const {notificationPlan}=require("../src/services/zermattEssWorkflowNotifications");
const stages=buildLoanStages({organizationSlug:ZERMATT,requesterUserId:"employee",branchManagerUserId:"branch",headHrUserId:"hr",gmUserId:"gm",chiefAccountantUserId:"chief"});
test("current owner gets action required; managers and audit get only status notifications",()=>{
 const plan=createPlan({type:"LOAN",requesterUserId:"employee",stages,observerUserIds:["audit"]});
 const n=notificationPlan({requestId:"loan-1",plan,participantUserIds:["branch","hr","gm","chief"],baseUrl:"https://chris.crnetwork.com.ng"});
 assert.equal(n.length,6);
 assert.equal(n.find(x=>x.userId==="branch").notificationType,"ACTION_REQUIRED");
 assert.equal(n.find(x=>x.userId==="audit").notificationType,"FOR_INFORMATION");
 assert.equal(n.find(x=>x.userId==="audit").recipientRole,"HEAD_AUDIT_OBSERVER");
 assert.equal(n.find(x=>x.userId==="employee").notificationType,"FOR_INFORMATION");
 assert.ok(n.every(x=>!x.message.includes("principalAmount")&&!x.message.includes("medical")));
 assert.equal(new Set(n.map(x=>x.idempotencyKey)).size,n.length);
});
test("after transition, current owner changes and retry keys change",()=>{
 const first=createPlan({type:"LOAN",requesterUserId:"employee",stages,observerUserIds:["audit"]});
 const second=transition(first,{actorUserId:"branch",decision:"APPROVE",expectedVersion:1});
 const a=notificationPlan({requestId:"loan-1",plan:first,baseUrl:"https://chris.crnetwork.com.ng"});
 const b=notificationPlan({requestId:"loan-1",plan:second,baseUrl:"https://chris.crnetwork.com.ng"});
 assert.equal(b.find(x=>x.userId==="hr").notificationType,"ACTION_REQUIRED");
 assert.equal(b.find(x=>x.userId==="audit").notificationType,"FOR_INFORMATION");
 assert.equal(a.some(x=>b.some(y=>x.idempotencyKey===y.idempotencyKey)),false);
});
test("insecure link and invalid request ID rejected",()=>{
 const plan=createPlan({type:"LOAN",requesterUserId:"employee",stages});
 assert.throws(()=>notificationPlan({requestId:"loan",plan,baseUrl:"http://localhost:3000"}),/HTTPS_CHRIS_LINK_REQUIRED/);
 assert.throws(()=>notificationPlan({requestId:"",plan,baseUrl:"https://example.org"}),/INVALID_WORKFLOW_NOTIFICATION_CONTEXT/);
});
