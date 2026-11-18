"use strict";
// Isolated CCA acceptance: real PostgreSQL + real pg pool + real CCA MFA.
// NEVER a service bootstrap. Requires explicit fictional-only opt-in.
// No production connection strings, CHRiS user records, external hosts or writes.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const cp=require("node:child_process");
const crypto=require("node:crypto");
const {createCcaPostgresTenantReader}=require("../../src/cca/postgresTenantReadAdapter");
const {createIdentityVault}=require("../../../tools/cca-local-demo/identityVault");
const {createAuditLedger}=require("../../../tools/cca-local-demo/auditLedger");
const {createStagingServer}=require("../../../tools/cca-local-demo/stagingAuthAdapter");
const {otpAt}=require("../../../tools/cca-local-demo/localIdentityLab");

const BLOCKED_ENV=["DATABASE_URL","DIRECT_URL","SUPABASE_URL","PGHOST","PGPORT","PGUSER",
  "PGPASSWORD","PGSERVICE","RENDER_SERVICE_ID","CHRIS_DOCUMENT_PRESENCE_AUDIT_ENABLED"];
function gate(){
 if(process.argv.slice(2).length!==1||process.argv[2]!=="--fictional-only"||
    process.env.CCA_FICTIONAL_PG_ACCEPTANCE!=="true"||
    process.env.NODE_ENV==="production"||process.env.RENDER==="true"||
    BLOCKED_ENV.some(k=>process.env[k])||process.platform!=="win32")
    throw Error("CCA_FICTIONAL_POSTGRES_ACCEPTANCE_DISABLED");
}
function runPg(bin,name,args,env,opts={}){
 const proc=cp.spawnSync(path.join(bin,name+".exe"),args,{env,encoding:"utf8",timeout:30000,...opts});
 if(proc.error||proc.status!==0)throw Error("CCA_PG_"+name+"_FAILED");
 return String(proc.stdout||"").trim();
}
async function main(){
 gate();
 const pgRoot=process.env.CCA_FICTIONAL_PG_MODULE_ROOT;
 const bin=process.env.CCA_FICTIONAL_PG_BIN;
 if(!pgRoot||!path.isAbsolute(pgRoot)||!bin||!path.isAbsolute(bin))throw Error("CCA_TEST_DEPENDENCIES_REQUIRED");
 const {Pool}=require(path.join(pgRoot,"pg"));
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"cca-mfa-pg-fixture-"));
 const data=path.join(tmp,"database"), pwfile=path.join(tmp,"pwfile");
 const port=55449, db="cca_fictional_mfa_integration", password=crypto.randomBytes(32).toString("hex");
 const readerPassword=crypto.randomBytes(32).toString("hex");
 const env={...process.env,PGHOST:"127.0.0.1",PGPORT:String(port),PGUSER:"cca_fictional_admin",PGPASSWORD:password,PGCONNECT_TIMEOUT:"3"};
 let started=false,server=null,pool=null;
 const auditDir=path.join(tmp,"vault");fs.mkdirSync(auditDir);
 let now=1800000030; const account="cca-staging-operator",secret=Buffer.from("12345678901234567890");
 try{
  fs.writeFileSync(pwfile,password+"\n",{flag:"wx",mode:0o600});
  runPg(bin,"initdb",["-D",data,"-U","cca_fictional_admin","--auth=scram-sha-256","--pwfile="+pwfile,"--encoding=UTF8","--locale=C"],env);
  fs.appendFileSync(path.join(data,"postgresql.conf"),"\nlisten_addresses='127.0.0.1'\nport="+port+"\n");
  runPg(bin,"pg_ctl",["-D",data,"-l",path.join(tmp,"postgres.log"),"-o","-h 127.0.0.1 -p "+port,"-w","start"],env,{stdio:"ignore"});
  started=true;
  const sql=(database,query)=>runPg(bin,"psql",["-X","-w","-qAt","-v","ON_ERROR_STOP=1","-d",database,"-c",query],env);
  sql("postgres","CREATE DATABASE "+db);
  // Exercise the exact proposed staging schema rather than a copied DDL
  // fixture; all execution remains inside the disposable fictional cluster.
  const schema=fs.readFileSync(path.join(__dirname,"../../sql/cca/001_fictional_staging_service_requests.sql"),"utf8");
  console.log("CCA_STAGE: Applying staging SQL schema in isolated cluster");
  const migration=cp.spawnSync(path.join(bin,"psql.exe"),
    ["-X","-w","-qAt","-v","ON_ERROR_STOP=1","-d",db,"-c",schema],
    {env,encoding:"utf8",timeout:30000});
  if(migration.error||migration.status!==0){
    // SQL text above contains no credentials, secrets, or client data.
    console.error("CCA_SCHEMA_SQL_ERROR:",String(migration.stderr||migration.error?.code||"unknown").slice(0,400));
    throw Error("CCA_STAGING_SCHEMA_MIGRATION_FAILED");
  }
  console.log("CCA_STAGE: Provisioning fictional restricted login and seed records");
  sql(db,[
    "CREATE ROLE cca_fictional_reader LOGIN PASSWORD '"+readerPassword+"'",
    "GRANT cca_staging_request_reader TO cca_fictional_reader",
    "GRANT CONNECT ON DATABASE "+db+" TO cca_fictional_reader",
    "INSERT INTO public.cca_service_requests(id,tenant_id,service_code,status) VALUES ('fictional-cedar-001','demo-cedar','MANAGED_POSTGRESQL','REQUEST_ONLY'),('fictional-atlas-001','demo-atlas','SSL_TLS_CERTIFICATE','REQUEST_ONLY')"
  ].join(";"));
  console.log("CCA_STAGE: Fictional staging schema and seeds applied");
  // Validate restored database, not just initial fixture. No original staging
  // database is involved: both source and destination live inside this
  // temporary isolated PostgreSQL cluster.
  const restoredDb="cca_fictional_mfa_restored";
  const dump=path.join(tmp,"fictional-restorable.dump");
  runPg(bin,"pg_dump",["-w","-Fc","-d",db,"-f",dump],env);
  sql("postgres","CREATE DATABASE "+restoredDb);
  runPg(bin,"pg_restore",["-w","--exit-on-error","--single-transaction","-d",restoredDb,dump],env);
  assert.equal(sql(restoredDb,"SELECT COUNT(*) FROM cca_service_requests"),"2");
  assert.equal(sql(db,"SELECT rolsuper::text||':'||rolbypassrls::text FROM pg_roles WHERE rolname='cca_fictional_reader'"),"false:false");
  pool=new Pool({host:"127.0.0.1",port,database:restoredDb,user:"cca_fictional_reader",
   password:readerPassword,ssl:false,max:2,connectionTimeoutMillis:3000,statement_timeout:3000});
  const reader=createCcaPostgresTenantReader(pool);
  const vault=createIdentityVault({directory:auditDir,encryptionKey:Buffer.alloc(32,31),clock:()=>now});
  vault.register({id:account,password:"Fictional-CCA-Stage-Only-Password-12345!",mfaSecret:secret,
   roles:["SERVICE_AGENT"],tenantIds:["demo-cedar"]});
  const auditLedger=createAuditLedger({file:path.join(auditDir,"audit.log"),key:Buffer.alloc(32,33)});
  server=createStagingServer({vault,account,auditLedger,stagingHost:"127.0.0.1",postgresReader:reader});
  await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve)});
  const base="http://127.0.0.1:"+server.address().port;
  assert.equal((await fetch(base+"/api/staging-postgres-requests")).status,401);
  const post=(url,payload,headers={})=>fetch(base+url,{method:"POST",
   headers:{Origin:base,"Content-Type":"application/json",...headers},body:JSON.stringify(payload)});
  const login=await post("/api/password",{account,password:"Fictional-CCA-Stage-Only-Password-12345!"});
  assert.equal(login.status,200);
  const challenge=(await login.json()).challenge;
  const mfa=await post("/api/mfa",{challenge,code:otpAt(secret,Math.floor(now/30))});
  assert.equal(mfa.status,200);
  const headers={Cookie:mfa.headers.get("set-cookie").split(";")[0]};
  assert.equal((await fetch(base+"/api/staging-postgres-requests?tenantId=demo-atlas",{headers})).status,400);
  const response=await fetch(base+"/api/staging-postgres-requests",{headers});
  assert.equal(response.status,200);
  assert.deepEqual((await response.json()).requests,[{id:"fictional-cedar-001",serviceCode:"MANAGED_POSTGRESQL",status:"REQUEST_ONLY"}]);
  const probe=await pool.connect();
  try{
   await probe.query("BEGIN READ ONLY");
   assert.equal((await probe.query("SELECT COUNT(*)::int AS n FROM cca_service_requests")).rows[0].n,0);
   await probe.query("SELECT set_config('cca.tenant_id',$1,true)",["demo-atlas"]);
   assert.deepEqual((await probe.query("SELECT id FROM cca_service_requests")).rows.map(x=>x.id),["fictional-atlas-001"]);
   await probe.query("COMMIT");
   await probe.query("BEGIN");
   await assert.rejects(probe.query("INSERT INTO cca_service_requests VALUES ('attack','demo-atlas','SSL_TLS_CERTIFICATE','REQUEST_ONLY')"));
   await probe.query("ROLLBACK");
  }finally{probe.release();}
  const logout=await post("/api/logout",{},headers);
  assert.equal(logout.status,200);
  assert.equal((await fetch(base+"/api/staging-postgres-requests",{headers})).status,401);
  // Simulate a real CCA staging restart: close HTTP server, terminate the
  // connection pool, and reopen the saved encrypted identity vault and an
  // entirely new PostgreSQL pool against the same restored test database.
  await new Promise(resolve=>server.close(resolve)); server=null;
  await pool.end(); pool=null;
  now+=60;
  pool=new Pool({host:"127.0.0.1",port,database:restoredDb,user:"cca_fictional_reader",
   password:readerPassword,ssl:false,max:2,connectionTimeoutMillis:3000,statement_timeout:3000});
  const reopenedVault=createIdentityVault({directory:auditDir,encryptionKey:Buffer.alloc(32,31),clock:()=>now});
  const reopenedAuditLedger=createAuditLedger({file:path.join(auditDir,"audit.log"),key:Buffer.alloc(32,33)});
  server=createStagingServer({vault:reopenedVault,account,auditLedger:reopenedAuditLedger,
   stagingHost:"127.0.0.1",postgresReader:createCcaPostgresTenantReader(pool)});
  await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve)});
  const restartedBase="http://127.0.0.1:"+server.address().port;
  assert.equal((await fetch(restartedBase+"/api/staging-postgres-requests",{headers})).status,401);
  const postRestart=(url,payload)=>fetch(restartedBase+url,{method:"POST",
   headers:{Origin:restartedBase,"Content-Type":"application/json"},body:JSON.stringify(payload)});
  const relogin=await postRestart("/api/password",{account,password:"Fictional-CCA-Stage-Only-Password-12345!"});
  assert.equal(relogin.status,200);
  const newChallenge=(await relogin.json()).challenge;
  const remfa=await postRestart("/api/mfa",{challenge:newChallenge,code:otpAt(secret,Math.floor(now/30))});
  assert.equal(remfa.status,200);
  const freshHeaders={Cookie:remfa.headers.get("set-cookie").split(";")[0]};
  const afterRestart=await fetch(restartedBase+"/api/staging-postgres-requests",{headers:freshHeaders});
  assert.equal(afterRestart.status,200);
  assert.deepEqual((await afterRestart.json()).requests,
   [{id:"fictional-cedar-001",serviceCode:"MANAGED_POSTGRESQL",status:"REQUEST_ONLY"}]);
  console.log("PASS: complete staging HTTP and real PostgreSQL pool restart; newly authenticated MFA session reads the restored fictional record, stale cookie denied.");
  console.log("PASS: isolated PostgreSQL dump/restore + restricted pg pool; MFA staging HTTP reads restored Cedar, Atlas isolated, unscoped zero, writes denied, logout denied.");
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  if(pool)await pool.end();
  if(started)try{runPg(bin,"pg_ctl",["-D",data,"-m","immediate","-w","stop"],env,{stdio:"ignore"})}catch{console.error("CCA_TEST_POSTGRES_STOP_FAILED");process.exitCode=1}
  try{fs.rmSync(tmp,{recursive:true,force:true,maxRetries:5,retryDelay:300})}
  catch{console.error("CCA_TEST_FIXTURE_CLEANUP_FAILED");process.exitCode=1}
  console.log("CLEANUP: isolated cluster, secrets, sessions, and fictional database removed.");
 }
}
main().catch(e=>{console.error("CCA_TEST_FAILED:"+e.message);process.exitCode=1;});
