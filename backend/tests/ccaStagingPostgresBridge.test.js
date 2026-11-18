"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {createIdentityVault}=require("../../tools/cca-local-demo/identityVault");
const {createAuditLedger}=require("../../tools/cca-local-demo/auditLedger");
const {createStagingServer}=require("../../tools/cca-local-demo/stagingAuthAdapter");
const {createCcaPostgresTenantReader}=require("../src/cca/postgresTenantReadAdapter");
const {otpAt}=require("../../tools/cca-local-demo/localIdentityLab");
const now=1800000030,secret=Buffer.from("12345678901234567890");
async function fixture(t,{reader,roles=["SERVICE_AGENT"]}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"cca-stage-pg-"));
 const vault=createIdentityVault({directory:dir,encryptionKey:Buffer.alloc(32,14),clock:()=>now});
 vault.register({id:"cca-demo-operator",password:"FICTIONAL-STAGING-ONLY-PASSWORD-123!",
  mfaSecret:secret,roles,tenantIds:["demo-cedar"]});
 const auditLedger=createAuditLedger({file:path.join(dir,"ledger.log"),key:Buffer.alloc(32,15)});
 const server=createStagingServer({vault,account:"cca-demo-operator",auditLedger,postgresReader:reader,stagingHost:"127.0.0.1"});
 await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
 const origin="http://127.0.0.1:"+server.address().port;
 t.after(async()=>{await new Promise(ok=>server.close(ok));fs.rmSync(dir,{recursive:true,force:true});});
 const post=(url,payload)=>fetch(origin+url,{method:"POST",headers:{Origin:origin,"Content-Type":"application/json"},body:JSON.stringify(payload)});
 const session=async()=>{
  const first=await(await post("/api/password",{account:"cca-demo-operator",password:"FICTIONAL-STAGING-ONLY-PASSWORD-123!"})).json();
  const second=await post("/api/mfa",{challenge:first.challenge,code:otpAt(secret,Math.floor(now/30))});
  assert.equal(second.status,200);
  return {Cookie:second.headers.get("set-cookie").split(";")[0]};
 };
 return {origin,session};
}
test("database staging API disabled when no server-owned reader supplied",async t=>{
 const x=await fixture(t);
 assert.equal((await fetch(x.origin+"/api/staging-postgres-requests")).status,404);
 const headers=await x.session();
 assert.equal((await fetch(x.origin+"/api/staging-postgres-requests",{headers})).status,404);
});
test("verified MFA staging session reads only server-owned fictional tenant",async t=>{
 const calls=[];
 const pool={connect:async()=>({
  query:async(sql,args)=>{calls.push({sql,args});
   if(sql.startsWith("SELECT id"))return {rows:[
    {id:"fictional-request",tenant_id:"demo-cedar",service_code:"MANAGED_POSTGRESQL",status:"REQUEST_ONLY"}
   ]};return {rows:[]};},
  release:()=>{calls.push({release:true});}
 })};
 const x=await fixture(t,{reader:createCcaPostgresTenantReader(pool)});
 assert.equal((await fetch(x.origin+"/api/staging-postgres-requests")).status,401);
 assert.equal(calls.length,0);
 const headers=await x.session();
 assert.equal((await fetch(x.origin+"/api/staging-postgres-requests?tenantId=demo-atlas",{headers})).status,400);
 const response=await fetch(x.origin+"/api/staging-postgres-requests",{headers});
 assert.equal(response.status,200);
 const out=await response.json();
 assert.deepEqual(out.requests,[{id:"fictional-request",serviceCode:"MANAGED_POSTGRESQL",status:"REQUEST_ONLY"}]);
 assert.equal(out.source,"ISOLATED_POSTGRESQL");
 assert.deepEqual(calls.find(q=>q.sql?.startsWith("SELECT set_config")).args,["demo-cedar"]);
 assert.deepEqual(calls.find(q=>q.sql?.startsWith("SELECT id")).args,["demo-cedar",20]);
 assert.equal(calls.at(-2).sql,"COMMIT");
 assert.equal(calls.at(-1).release,true);
});
test("cross-tenant database rows never reach authenticated staging response",async t=>{
 const reader={listServiceRequests:async()=>{throw Error("fictional secret database failure");}};
 const x=await fixture(t,{reader});
 const headers=await x.session();
 const response=await fetch(x.origin+"/api/staging-postgres-requests",{headers});
 assert.equal(response.status,503);
 assert.deepEqual(await response.json(),{ok:false,code:"CCA_STAGING_POSTGRES_UNAVAILABLE"});
});
test("read route is absent from non-staging local demo regardless of injected reader",async t=>{
 const {createAuthServer,createDemoAuth}=require("../../tools/cca-local-demo/localAuthServer");
 const {createLocalIdentityLab}=require("../../tools/cca-local-demo/localIdentityLab");
 const lab=createLocalIdentityLab({clock:()=>now});
 const auth=createDemoAuth({lab,password:"FICTIONAL-ONLY-PASSWORD-123!",secret});
 const server=createAuthServer(auth,{postgresReader:{listServiceRequests:async()=>{throw Error("not called");}}});
 await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
 t.after(()=>new Promise(ok=>server.close(ok)));
 assert.equal((await fetch("http://127.0.0.1:"+server.address().port+"/api/staging-postgres-requests")).status,404);
});
