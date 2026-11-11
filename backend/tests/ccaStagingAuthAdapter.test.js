"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {createIdentityVault}=require("../../tools/cca-local-demo/identityVault");
const {createAuditLedger}=require("../../tools/cca-local-demo/auditLedger");
const {createSourceThrottle}=require("../../tools/cca-local-demo/sourceThrottle");
const {createStagingServer}=require("../../tools/cca-local-demo/stagingAuthAdapter");
const {otpAt}=require("../../tools/cca-local-demo/localIdentityLab");
const now=1800000030,secret=Buffer.from("12345678901234567890"),account="cca-demo-operator";
const password="Staging-Only-Synthetic-Password-748!";
async function withFixture(callback,limiter){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"cca-stage-login-"));
 let server;
 try{
  const key=Buffer.alloc(32,6),ledgerKey=Buffer.alloc(32,7);
  const vault=createIdentityVault({directory:dir,encryptionKey:key,clock:()=>now});
  vault.register({id:account,password,mfaSecret:secret,roles:["SERVICE_AGENT"],tenantIds:["demo-cedar"]});
  const ledger=createAuditLedger({file:path.join(dir,"ledger.log"),key:ledgerKey});
  server=createStagingServer({vault,account,auditLedger:ledger,
    sourceThrottle:limiter||createSourceThrottle({clock:()=>now,maxAttempts:10})});
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const base="http://127.0.0.1:"+server.address().port;
  const post=(route,body,headers={})=>fetch(base+route,{method:"POST",
   headers:{Origin:base,"Content-Type":"application/json",...headers},
   body:JSON.stringify(body)});
  await callback({base,post,dir,ledger,key,ledgerKey,vault});
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  fs.rmSync(dir,{recursive:true,force:true});
 }
}
test("staging login uses encrypted persistent vault with same protected role-scoped browser",async()=>{
 await withFixture(async({base,post,ledger,dir,key})=>{
  assert.equal((await fetch(base+"/protected-centre")).status,401);
  const step=await post("/api/password",{account,password});
  assert.equal(step.status,200);
  const pending=await step.json();
  assert.equal((await fetch(base+"/api/access")).status,401);
  const second=await post("/api/mfa",{challenge:pending.challenge,
   code:otpAt(secret,Math.floor(now/30))});
  assert.equal(second.status,200);
  const cookie=second.headers.get("set-cookie").split(";")[0];
  const headers={Cookie:cookie};
  assert.equal((await fetch(base+"/protected-centre",{headers})).status,200);
  const access=await(await fetch(base+"/api/access",{headers})).json();
  assert.deepEqual(access.modules,["support"]);
  assert.equal((await fetch(base+"/api/workspace?module=billing",{headers})).status,403);
  assert.equal(ledger.verify().count,1);
  assert.equal((await post("/api/logout",{},headers)).status,200);
  assert.equal((await fetch(base+"/api/access",{headers})).status,401);
  const afterRestart=createIdentityVault({directory:dir,encryptionKey:key,clock:()=>now});
  assert.equal(afterRestart.passwordStep(account,password).ok,true);
 });
});
test("staging server throttles repeated failures from verified direct socket address",async()=>{
 await withFixture(async({post})=>{
  for(let i=0;i<2;i++)assert.equal((await post("/api/password",
   {account,password:"wrong"})).status,401);
  assert.equal((await post("/api/password",{account,password})).status,429);
 },createSourceThrottle({clock:()=>now,maxAttempts:2}));
});
test("staging server rejects damaged external audit chain at startup",async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"cca-stage-audit-"));
 try{
  const vault=createIdentityVault({directory:dir,encryptionKey:Buffer.alloc(32,8),clock:()=>now});
  vault.register({id:account,password,mfaSecret:secret,roles:["SERVICE_AGENT"],tenantIds:["demo-cedar"]});
  const file=path.join(dir,"ledger.log"),ledger=createAuditLedger({file,key:Buffer.alloc(32,9)});
  ledger.append({event:"CCA_MFA_VERIFIED",actor:account,target:account});
  fs.writeFileSync(file,fs.readFileSync(file,"utf8").replace("CCA_MFA_VERIFIED","CCA_MFA_REJECTED"));
  assert.throws(()=>createStagingServer({vault,account,auditLedger:ledger}),/CCA_AUDIT_SIGNATURE_INVALID/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
