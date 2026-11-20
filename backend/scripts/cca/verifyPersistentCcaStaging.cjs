"use strict";
// Internal-only CCA persistent PostgreSQL + fictional MFA smoke test.
// Never opens the legacy CCA vault, external hosts, CHRiS tenants or production.
const fs=require("node:fs");
const path=require("node:path");
const os=require("node:os");
const crypto=require("node:crypto");
const assert=require("node:assert/strict");
const {openStaging,ACCOUNT,STAGING_HOST}=require("../../../tools/cca-local-demo/runStaging");
const {otpAt}=require("../../../tools/cca-local-demo/localIdentityLab");
const {createPersistentStagingPostgres}=require("../../../tools/cca-local-demo/persistentPostgresReader");
const root=path.join(process.env.LOCALAPPDATA||"","CRNETWORK-CCA-ManagedPostgres-Staging");
if(process.platform!=="win32"||process.argv.slice(2).join(" ")!=="--fictional-only"||
   process.env.CCA_PERSISTENT_PILOT_ACCEPTANCE!=="true"||
   process.env.DATABASE_URL||process.env.SUPABASE_URL||process.env.NODE_ENV==="production"||
   process.env.RENDER_SERVICE_ID){
 console.error("CCA_PERSISTENT_ACCEPTANCE_DISABLED");process.exit(1);
}
async function main(password){
 const db=createPersistentStagingPostgres({
  password,clientRoot:path.join(root,"pg-client","node_modules")
 });
 let dir,server;
 try {
  assert.equal(await db.verify(),true);
  dir=fs.mkdtempSync(path.join(os.tmpdir(),"cca-persistent-mfa-"));
  for(const name of ["state","host-security"])fs.mkdirSync(path.join(dir,name));
  const master=crypto.randomBytes(32),secret=crypto.randomBytes(20);
  const operatorPassword=crypto.randomBytes(35).toString("base64url");
  let now=1800000030;
  const options={directory:dir,master,clock:()=>now,postgresReader:db.reader};
  const enroll=openStaging({...options,initialize:true});
  try{enroll.enroll(operatorPassword,secret)}finally{enroll.release()}
  async function runSession(stale){
   const {server:next,release}=openStaging(options);
   server=next;
   try {
    await new Promise((res,rej)=>{server.once("error",rej);server.listen(0,STAGING_HOST,res)});
    const origin="http://"+STAGING_HOST+":"+server.address().port;
    if(stale) assert.equal((await fetch(origin+"/api/staging-postgres-requests",
      {headers:{Cookie:stale}})).status,401);
    assert.equal((await fetch(origin+"/api/staging-postgres-requests")).status,401);
    const post=(route,payload)=>fetch(origin+route,{method:"POST",
      headers:{Origin:origin,"Content-Type":"application/json"},body:JSON.stringify(payload)});
    const first=await post("/api/password",{account:ACCOUNT,password:operatorPassword});
    assert.equal(first.status,200);
    const second=await post("/api/mfa",{challenge:(await first.json()).challenge,
      code:otpAt(secret,Math.floor(now/30))});
    assert.equal(second.status,200);
    const cookie=second.headers.get("set-cookie").split(";")[0];
    assert.equal((await fetch(origin+"/api/staging-postgres-requests?tenantId=demo-atlas",
      {headers:{Cookie:cookie}})).status,400);
    const response=await fetch(origin+"/api/staging-postgres-requests",
      {headers:{Cookie:cookie}});
    assert.equal(response.status,200);
    assert.deepEqual((await response.json()).requests,
      [{id:"fictional-cca-cedar-01",serviceCode:"MANAGED_POSTGRESQL",status:"REQUEST_ONLY"}]);
    return cookie;
   } finally {
    await new Promise(resolve=>server.close(resolve));server=null;release();
   }
  }
  const stale=await runSession(null);
  now+=60;
  await runSession(stale);
  console.log("PASS: persistent CCA PostgreSQL real restricted login + protected MFA HTTP + restart, old session denied; fictional Cedar tenant record survives.");
  master.fill(0);secret.fill(0);
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  await db.close();
  if(dir)fs.rmSync(dir,{recursive:true,force:true,maxRetries:4,retryDelay:200});
  console.log("CLEANUP: fictional isolated authentication fixture removed; persistent PostgreSQL database preserved.");
 }
}
let input="";
process.stdin.setEncoding("utf8");
process.stdin.on("data",chunk=>{input+=chunk;if(input.length>512){console.error("CCA_PERSISTENT_INPUT_TOO_LARGE");process.exit(1)}});
process.stdin.on("end",()=>{
 let request;try{request=JSON.parse(input)}catch{console.error("CCA_PERSISTENT_INPUT_INVALID");process.exitCode=1;return}
 input="";
 if(!request||typeof request.password!=="string"){console.error("CCA_PERSISTENT_SECRET_REQUIRED");process.exitCode=1;return}
 const password=request.password;request.password=null;
 main(password).catch(()=>{console.error("CCA_PERSISTENT_ACCEPTANCE_FAILED");process.exitCode=1});
});
