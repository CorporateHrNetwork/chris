"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {resolveTimingRules, resolveTimingRulesForTenant}=require("../src/services/zermattLeaveRequestTimingService");

test("Zermatt permits past dates and zero-day notice even when a stored policy still says seven days",()=>{
 const policy={requestRules:{backdatedRequestsAllowed:false,minimumNotice:7,minimumDuration:2},noticeDays:7};
 const before=JSON.stringify(policy);
 assert.deepEqual(resolveTimingRules(policy,"zermatt-liquor-limited"),{backdatedRequestsAllowed:true,minimumNotice:0});
 assert.equal(JSON.stringify(policy),before,"Do not mutate published policy snapshots");
});

test("other tenants retain their own notice and backdating restrictions",()=>{
 assert.deepEqual(resolveTimingRules({requestRules:{minimumNotice:7},noticeDays:7},"other-tenant"),{
  backdatedRequestsAllowed:false,minimumNotice:7,emergencyRequestsAllowed:false
 });
 assert.deepEqual(resolveTimingRules({requestRules:{minimumNotice:5,emergencyRequestsAllowed:true,backdatedRequestsAllowed:true}},"other-tenant"),{
  backdatedRequestsAllowed:true,minimumNotice:5,emergencyRequestsAllowed:true
 });
 assert.equal(resolveTimingRules({requestRules:{minimumNotice:0},noticeDays:7},"other-tenant").minimumNotice,0);
});

test("tenant lookup fails closed and cannot be supplied by an ESS employee",async()=>{
 const tx={organization:{findUnique:async({where})=>where.id==="zermatt-id"?{slug:"zermatt-liquor-limited"}:null}};
 assert.equal((await resolveTimingRulesForTenant(tx,"zermatt-id",{noticeDays:7})).minimumNotice,0);
 await assert.rejects(()=>resolveTimingRulesForTenant(tx,"missing",{}),/ORGANIZATION_NOT_FOUND/);
});

test("actual timing validator accepts retrospective, same-day and short-notice Zermatt leave",()=>{
 const {assertTimingAllowed}=require("../src/services/zermattLeaveRequestTimingService");
 const rules=resolveTimingRules({requestRules:{minimumNotice:7,backdatedRequestsAllowed:false},noticeDays:7},"zermatt-liquor-limited");
 for(const notice of [-365,-30,-1,0,1,3,6,7])assert.doesNotThrow(()=>assertTimingAllowed(rules,notice));
});
test("other tenants still reject retrospective or insufficient-notice requests",()=>{
 const {assertTimingAllowed}=require("../src/services/zermattLeaveRequestTimingService");
 const rules=resolveTimingRules({requestRules:{minimumNotice:7,backdatedRequestsAllowed:false},noticeDays:7},"other-tenant");
 assert.throws(()=>assertTimingAllowed(rules,-1),/BACKDATED_LEAVE_NOT_ALLOWED/);
 assert.throws(()=>assertTimingAllowed(rules,3),/MINIMUM_NOTICE_NOT_MET/);
 assert.doesNotThrow(()=>assertTimingAllowed(rules,7));
});
