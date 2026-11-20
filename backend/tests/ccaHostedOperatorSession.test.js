"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {createCcaHostedSessionResolver}=require("../src/cca/hostedOperatorSession");
const {PERMISSIONS}=require("../src/cca/controlPlanePolicy");
const token="X".repeat(48);
const verified=()=>({
 verified:true,revoked:false,scope:"CCA",subjectType:"OPERATOR",
 expiresAtMs:Date.now()+60000,tenantId:"demo-cedar",roles:["SERVICE_AGENT"],
 context:{platformIdentityVerified:true,platformScope:"CCA",
 platformGrants:[PERMISSIONS.TICKETS_READ],
 tenantGrants:{"demo-cedar":[PERMISSIONS.TICKETS_READ]}}
});
const req=(cookie,other={})=>({headers:{cookie,...other}});
test("CCA hosted session adapter requires independent verifier",()=>{
 assert.throws(()=>createCcaHostedSessionResolver(),/CCA_HOSTED_SESSION_VERIFIER_REQUIRED/);
});
test("CCA session accepted only for independently verified unexpired CCA operator and assigned tenant",async()=>{
 let count=0;
 const resolve=createCcaHostedSessionResolver({verifyToken:async received=>{
  count++;assert.equal(received,token);return verified();
 }});
 const session=await resolve(req("cca_hosted_sid="+token));
 assert.equal(session.accepted,true);
 assert.equal(session.tenantId,"demo-cedar");
 assert.equal(count,1);
 assert.equal(Object.isFrozen(session),true);
});
test("CCA session denies missing, duplicate, malformed and client-overridden cookies",async()=>{
 let count=0;
 const resolve=createCcaHostedSessionResolver({verifyToken:async()=>{count++;return verified();}});
 for(const input of [
  req(""),req("other=x"),req("cca_hosted_sid=short"),
  req("cca_hosted_sid="+token+"; cca_hosted_sid="+token),
  req("cca_hosted_sid="+token,{"x-tenant-id":"demo-atlas"}),
  req("cca_hosted_sid="+token,{"x-user-id":"admin"}),
  req("cca_hosted_sid="+token,{authorization:"Bearer untrusted"})
 ])assert.equal(await resolve(input),null);
 assert.equal(count,0);
});
test("CCA session denies expired, revoked, CHRiS, cross-tenant and unsigned assertions",async()=>{
 for(const change of [
  {expiresAtMs:0},{revoked:true},{scope:"CHRIS"},
  {subjectType:"CUSTOMER"},{verified:false},{tenantId:"demo-atlas"},
  {roles:[]},{context:{...verified().context,platformIdentityVerified:false}}
 ]){
  const resolve=createCcaHostedSessionResolver({
   verifyToken:async()=>({...verified(),...change})
  });
  assert.equal(await resolve(req("cca_hosted_sid="+token)),null);
 }
});
test("CCA session verifier failures are denied without revealing token or error",async()=>{
 const resolve=createCcaHostedSessionResolver({verifyToken:async()=>{throw Error("SECRET_IDP_ERROR");}});
 assert.equal(await resolve(req("cca_hosted_sid="+token)),null);
});
