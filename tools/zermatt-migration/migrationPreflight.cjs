"use strict";
// Non-invasive migration preflight. Does not connect, copy or read data.
// NEVER prints credentials, connection URLs, workstation paths, or employee data.
const {execFileSync}=require("node:child_process");
const path=require("node:path");
const fs=require("node:fs");
function evaluateMigrationPreflight({source,target,tools,destinationApproved=false}={}){
 const blockers=[];
 if(!tools || !["pg_dump","pg_restore","psql"].every(x=>tools[x]?.major===17))
  blockers.push("POSTGRESQL_17_CLIENT_TOOLS_REQUIRED");
 if(!source || source.hostConfigured!==true || source.credentialsConfigured!==true)
  blockers.push("SOURCE_CONNECTION_NOT_CONFIGURED");
 if(!target || target.hostConfigured!==true || target.credentialsConfigured!==true)
  blockers.push("TARGET_CONNECTION_NOT_CONFIGURED");
 if(!source || !target || !source.identity || !target.identity ||
    source.identity===target.identity)blockers.push("DISTINCT_DATABASE_DESTINATIONS_REQUIRED");
 if(destinationApproved!==true)blockers.push("SECURE_DESTINATION_APPROVAL_REQUIRED");
 return {status:blockers.length?"BLOCKED":"READY_FOR_AUTHORIZED_REHEARSAL",
   blockers,productionSwitchAuthorized:false,sourceDataTransferred:false};
}
function readVersion(binary) {
 if(!binary || !path.isAbsolute(binary) || !fs.existsSync(binary))return {major:null};
 try {
  const result=execFileSync(binary,["--version"],{
   timeout:5000,encoding:"utf8",windowsHide:true,stdio:["ignore","pipe","ignore"]
  });
  const m=result.match(/PostgreSQL\)?\s+(\d+)\./i) || result.match(/PostgreSQL\)?\s+(\d+)/i);
  return {major:m?Number(m[1]):null};
 }catch{return {major:null};}
}
function main(){
 const base=process.env.ZERMATT_PG17_BIN;
 const bin=name=>base?path.join(base,name+(process.platform==="win32"?".exe":"")):"";
 const tools=Object.fromEntries(["pg_dump","pg_restore","psql"].map(name=>[name,readVersion(bin(name))]));
 const identity=prefix=>{
  const host=process.env[prefix+"_HOST"],database=process.env[prefix+"_DATABASE"];
  return host&&database?host.toLowerCase()+"/"+database.toLowerCase():null;
 };
 const configured=prefix=>({
  identity:identity(prefix),
  hostConfigured:Boolean(process.env[prefix+"_HOST"]&&process.env[prefix+"_DATABASE"]),
  credentialsConfigured:Boolean(process.env[prefix+"_USER"]&&process.env[prefix+"_PASSWORD"])
 });
 const report=evaluateMigrationPreflight({
  tools,source:configured("ZERMATT_SOURCE_PG"),target:configured("ZERMATT_TARGET_PG"),
  destinationApproved:process.env.ZERMATT_REHEARSAL_DESTINATION_APPROVED==="true"
 });
 console.log(JSON.stringify(report,null,2));
 if(report.status!=="READY_FOR_AUTHORIZED_REHEARSAL")process.exitCode=2;
}
module.exports={evaluateMigrationPreflight,readVersion};
if(require.main===module)main();
