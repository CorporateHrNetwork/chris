"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {createCcaHostedApp} = require("../src/cca/hostedApp");
const {PERMISSIONS} = require("../src/cca/controlPlanePolicy");

const context=Object.freeze({
 platformIdentityVerified:true, platformScope:"CCA",
 platformGrants:[PERMISSIONS.TICKETS_READ],
 tenantGrants:{"demo-cedar":[PERMISSIONS.TICKETS_READ]}
});
function makeApp({verified=true,session=null,readerError=false}={}) {
 const calls=[];
 const db={
  verify:async()=>verified,
  reader:{listServiceRequests:async opts=>{
   calls.push(opts);
   if(readerError)throw Error("PRIVATE_SQL_SECRET");
   return [{id:"fictional-01",serviceCode:"MANAGED_POSTGRESQL",status:"REQUEST_ONLY"}];
  }},
  close:async()=>{}
 };
 return {app:createCcaHostedApp({database:db,resolveOperatorSession:async()=>session}),calls};
}
test("CCA private hosted app refuses missing verified dependencies and public listener",async()=>{
 assert.throws(()=>createCcaHostedApp({}),/CCA_HOSTED_APP_VERIFIED_DEPENDENCIES_REQUIRED/);
 const {app}=makeApp();
 await assert.rejects(()=>app.start({host:"0.0.0.0"}),/CCA_HOSTED_PUBLIC_LISTENER_DISABLED/);
 await app.stop();
});
test("CCA hosted readiness fails closed unless DB role has been verified",async()=>{
 const {app}=makeApp({verified:false});
 await assert.rejects(()=>app.start(),/CCA_HOSTED_DATABASE_NOT_VERIFIED/);
 assert.equal(app.server.listening,false);
 await app.stop();
});
test("CCA hosted app enforces verified CCA operator and server-owned tenant scope",async()=>{
 const valid={accepted:true,context,tenantId:"demo-cedar"};
 const {app,calls}=makeApp({session:valid});
 try {
  const address=await app.start();
  const base="http://127.0.0.1:"+address.port;
  const get=(p,headers)=>fetch(base+p,{headers});
  assert.equal((await get("/health/live")).status,200);
  assert.equal((await get("/health/ready")).status,200);
  assert.equal((await get("/api/cca/service-requests?tenantId=demo-atlas")).status,400);
  assert.equal((await get("/api/cca/service-requests",{"x-tenant-id":"demo-atlas"})).status,400);
  assert.equal((await get("/api/cca/service-requests",{"x-user-id":"cca-operator"})).status,400);
  assert.equal((await fetch(base+"/api/cca/service-requests",{method:"POST"})).status,405);
  const response=await get("/api/cca/service-requests");
  assert.equal(response.status,200);
  assert.deepEqual((await response.json()).requests,[{id:"fictional-01",serviceCode:"MANAGED_POSTGRESQL",status:"REQUEST_ONLY"}]);
  assert.equal(calls.length,1);
  assert.equal(calls[0].tenantId,"demo-cedar");
  assert.equal(calls[0].limit,20);
 }finally{await app.stop();}
});
test("CCA hosted app rejects absent, CHRiS and other-tenant sessions",async()=>{
 for(const session of [
  null,
  {accepted:true,context:{...context,platformScope:"CHRIS"},tenantId:"demo-cedar"},
  {accepted:true,context,tenantId:"demo-atlas"},
  {accepted:true,context:{...context,platformIdentityVerified:false},tenantId:"demo-cedar"}
 ]){
  const {app,calls}=makeApp({session});
  try {
   const addr=await app.start();
   const response=await fetch("http://127.0.0.1:"+addr.port+"/api/cca/service-requests");
   assert.equal(response.status,403);
   assert.equal(calls.length,0);
  }finally{await app.stop();}
 }
});
test("CCA hosted app never exposes database errors",async()=>{
 const {app}=makeApp({readerError:true,session:{accepted:true,context,tenantId:"demo-cedar"}});
 try{
  const addr=await app.start();
  const response=await fetch("http://127.0.0.1:"+addr.port+"/api/cca/service-requests");
  assert.equal(response.status,503);
  assert.doesNotMatch(await response.text(),/PRIVATE_SQL_SECRET/);
 }finally{await app.stop();}
});
