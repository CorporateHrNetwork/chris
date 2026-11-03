"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {create,decide,hydrate}=require("../src/services/zermattEssApprovalPersistence");
const {ZERMATT,buildLoanStages}=require("../src/services/zermattEssApprovalPlan");
const stages=()=>buildLoanStages({organizationSlug:ZERMATT,requesterUserId:"employee",branchManagerUserId:"branch",headHrUserId:"hr",gmUserId:"gm",chiefAccountantUserId:"chief"});
test("persists workflow with tenant-scoped unique request key and audit-only observer",async()=>{
 const calls=[],tx={organization:{findUnique:async()=>({slug:ZERMATT})},employee:{findFirst:async()=>({id:"e"})},$queryRawUnsafe:async(...args)=>{calls.push(args);return [{id:"w"}]}};
 const p=await create(tx,{organizationId:"o",requestType:"LOAN",requestId:"l",employeeId:"e",requesterUserId:"employee",stages:stages(),observerUserIds:["audit"]});
 assert.equal(p.observers[0].authority,"VIEW_ONLY");
 assert.match(calls[0][0],/ON CONFLICT/);
 assert.match(calls[0][0],/RETURNING "id"/);
});
test("rejects non-Zermatt and missing employee",async()=>{
 await assert.rejects(()=>create({organization:{findUnique:async()=>({slug:"other"})}},{organizationId:"o"}),/ESS_WORKFLOW_TENANT_FORBIDDEN/);
 await assert.rejects(()=>create({organization:{findUnique:async()=>({slug:ZERMATT})},employee:{findFirst:async()=>null}},{organizationId:"o",requestType:"LOAN",requestId:"l",employeeId:"e",requesterUserId:"u",stages:stages()}),/WORKFLOW_EMPLOYEE_NOT_FOUND/);
});
test("row lock, active user and tenant required before any transition",async()=>{
 const calls=[];
 const db={$transaction:async fn=>fn({organization:{findUnique:async()=>({slug:ZERMATT})},user:{findFirst:async()=>({id:"branch"})},$queryRawUnsafe:async(...args)=>{calls.push(args);return []}})};
 await assert.rejects(()=>decide(db,{organizationId:"o",requestType:"LOAN",requestId:"l",actorUserId:"branch",decision:"APPROVE",expectedVersion:1}),/WORKFLOW_NOT_FOUND/);
 assert.match(calls[0][0],/FOR UPDATE/);
});
test("hydration preserves stages, audit observers and integer version",()=>{
 const p=hydrate({requestType:"LOAN",status:"PENDING",version:"2",currentIndex:1,requesterUserId:"u",stages:'[{"type":"LOAN_GM_APPROVAL"}]',observers:'[{"userId":"audit"}]',history:"[]"});
 assert.equal(p.version,2);assert.equal(p.observers[0].userId,"audit");
});
