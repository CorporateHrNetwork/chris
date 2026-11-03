"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),Module=require("node:module");
const original=Module._load;let sent=0;
Module._load=function(name,parent,...rest){if(name==="./loanWorkflowNotificationService")return {deliverNotification:async()=>{sent++;return {status:"SENT"}}};return original.call(this,name,parent,...rest)};
const {dispatch}=require("../src/services/zermattEssLoanNotificationDispatch");
function fixture(active=true){let consumed=false;const queries=[],writes=[];const tx={$queryRawUnsafe:async(sql,...args)=>{queries.push({sql,args});if(consumed)return [];consumed=true;return [{id:"n",recipientUserId:"u",toEmail:"u@example.invalid"}];},$executeRawUnsafe:async(...a)=>writes.push(a),user:{findFirst:async()=>active?{email:"u@example.invalid"}:null}};return {queries,writes,db:{organization:{findUnique:async()=>({slug:"zermatt-liquor-limited"})},$transaction:fn=>fn(tx)}};}
test.before(()=>{process.env.ZERMATT_ESS_APPROVALS_ENABLED="true"});test.after(()=>{Module._load=original;delete process.env.ZERMATT_ESS_APPROVALS_ENABLED});
test("dispatch scopes rows to tenant and marked loans, serializes sends and caps retries",async()=>{
 const f=fixture();const result=await dispatch(f.db,{organizationId:"o",notificationIds:["n"]});assert.equal(result[0].status,"SENT");assert.equal(sent,1);
 const q=f.queries[0];assert.deepEqual(q.args,["o",["n"]]);assert.match(q.sql,/FOR UPDATE OF n SKIP LOCKED/);assert.match(q.sql,/attempts"<5/);assert.match(q.sql,/power\(2/);assert.match(q.sql,/essApprovalRequired"=true/);
});
test("inactive or changed recipients are suppressed without email delivery",async()=>{
 const f=fixture(false),before=sent;await dispatch(f.db,{organizationId:"o"});assert.equal(sent,before);assert.match(f.writes[0][0],/RECIPIENT_CHANGED_OR_INACTIVE/);
});
test("disabled workflow never reads the outbox or sends",async()=>{
 process.env.ZERMATT_ESS_APPROVALS_ENABLED="false";try{assert.deepEqual(await dispatch({},{}),[]);}finally{process.env.ZERMATT_ESS_APPROVALS_ENABLED="true";}
});
