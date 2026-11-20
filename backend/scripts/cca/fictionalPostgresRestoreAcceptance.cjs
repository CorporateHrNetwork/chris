"use strict";
// CCA fictional-only independent PostgreSQL backup/restore smoke test.
// Creates a separate loopback PostgreSQL cluster and removes it in finally.
const cp=require("node:child_process");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const crypto=require("node:crypto");
const bin="C:\\Program Files\\PostgreSQL\\16\\bin";
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"cca-fictional-pg-"));
const data=path.join(dir,"data");
const dump=path.join(dir,"fictional.dump");
const passFile=path.join(dir,"password");
const port=55447;
const secret=crypto.randomBytes(36).toString("base64");
const env={...process.env,PGHOST:"127.0.0.1",PGPORT:String(port),PGUSER:"cca_fictional_admin",PGPASSWORD:secret,PGCONNECT_TIMEOUT:"3"};
let started=false;
function command(name,args,opts={}){
 const result=cp.spawnSync(path.join(bin,name+".exe"),args,{encoding:"utf8",env,timeout:30000,...opts});
 if(result.error || result.status!==0){
  throw Error("REHEARSAL_"+name+"_FAILED:"+String(result.stderr||result.error?.code||result.status).slice(0,230));
 }
 return (result.stdout||"").trim();
}
function sql(database,query){return command("psql",["-X","-w","-qAt","-v","ON_ERROR_STOP=1","-d",database,"-c",query]);}
try{
 if(process.env.DATABASE_URL || process.env.SUPABASE_URL || process.env.RENDER_SERVICE_ID || process.env.NODE_ENV==="production")throw Error("PRODUCTION_ENV_REJECTED");
 fs.writeFileSync(passFile,secret+"\n",{encoding:"utf8",flag:"wx"});
 command("initdb",["-D",data,"-U","cca_fictional_admin","--auth=scram-sha-256","--pwfile="+passFile,"--encoding=UTF8","--locale=C"]);
 fs.appendFileSync(path.join(data,"postgresql.conf"),"\nlisten_addresses = '127.0.0.1'\nport = "+port+"\n");
 command("pg_ctl",["-D",data,"-l",path.join(dir,"postgres.log"),"-o","-h 127.0.0.1 -p "+port,"-w","start"],{stdio:"ignore"});
 started=true;
 sql("postgres","CREATE DATABASE cca_fictional_source");
 const setup=[
  "CREATE TABLE fictional_tenants(id text PRIMARY KEY, label text NOT NULL)",
  "CREATE TABLE fictional_requests(id text PRIMARY KEY,tenant_id text REFERENCES fictional_tenants(id),service text NOT NULL,status text NOT NULL CHECK(status='REQUEST_ONLY'))",
  "INSERT INTO fictional_tenants VALUES ('fictional-a','Fictional Tenant A'),('fictional-b','Fictional Tenant B')",
  "INSERT INTO fictional_requests VALUES ('test-1','fictional-a','MANAGED_POSTGRESQL','REQUEST_ONLY'),('test-2','fictional-b','SSL_TLS_CERTIFICATE','REQUEST_ONLY')",
  "CREATE ROLE cca_test_reader NOLOGIN",
  "GRANT USAGE ON SCHEMA public TO cca_test_reader",
  "GRANT SELECT ON fictional_requests TO cca_test_reader",
  "ALTER TABLE fictional_requests ENABLE ROW LEVEL SECURITY",
  "ALTER TABLE fictional_requests FORCE ROW LEVEL SECURITY",
  "CREATE POLICY fictional_tenant_scope ON fictional_requests FOR SELECT TO cca_test_reader USING(tenant_id=current_setting('cca.tenant_id',true))"
 ].join(";");
 sql("cca_fictional_source",setup);
 command("pg_dump",["-w","-Fc","-d","cca_fictional_source","-f",dump]);
 sql("postgres","CREATE DATABASE cca_fictional_restored");
 command("pg_restore",["-w","--exit-on-error","--single-transaction","-d","cca_fictional_restored",dump]);
 const count=sql("cca_fictional_restored","SELECT COUNT(*) FROM fictional_tenants")+":"+sql("cca_fictional_restored","SELECT COUNT(*) FROM fictional_requests");
 const a=sql("cca_fictional_restored","BEGIN; SET LOCAL ROLE cca_test_reader;SET LOCAL cca.tenant_id='fictional-a'; SELECT COUNT(*) FROM fictional_requests;COMMIT;");
 const b=sql("cca_fictional_restored","BEGIN; SET LOCAL ROLE cca_test_reader;SET LOCAL cca.tenant_id='fictional-b'; SELECT COUNT(*) FROM fictional_requests;COMMIT;");
 const none=sql("cca_fictional_restored","BEGIN; SET LOCAL ROLE cca_test_reader; SELECT COUNT(*) FROM fictional_requests;COMMIT;");
 if(count!=="2:2"||a!=="1"||b!=="1"||none!=="0")throw Error("RESTORE_RLS_ASSERTIONS_FAILED");
 console.log("PASS: PostgreSQL 16 independent fictional dump and restore; 2 fictional tenants; 2 service requests; RLS (tenant A=1, tenant B=1, no tenant=0).");
 console.log("PASS: Original staging database, production systems, and customer records not accessed.");
}catch(e){console.error("FAIL: "+e.message);process.exitCode=1;
}finally{
 if(started){try{command("pg_ctl",["-D",data,"-m","immediate","-w","stop"],{stdio:"ignore"})}catch(e){console.error("CLEANUP_STOP_FAILED: "+e.message);process.exitCode=1;}}
 try{fs.rmSync(dir,{recursive:true,force:true,maxRetries:4,retryDelay:250});console.log("CLEANUP: isolated cluster, dump, credential file and fictional records removed.");}catch(e){console.error("CLEANUP_DIRECTORY_FAILED: "+e.code);process.exitCode=1;}
}