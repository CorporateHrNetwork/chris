"use strict";
// Run locally with Node and backend's installed pg dependency. The source and
// destination credentials must be set in local process environment, never CLI,
// chat, GitHub, or unencrypted report files. This script does not transfer data.
const path=require("node:path");
const fs=require("node:fs");
const {captureInventory}=require("./databaseInventory.cjs");

async function main(){
 const [label,out]=process.argv.slice(2);
 if(!["source","target"].includes(label) || !out ||
    !path.isAbsolute(out) || fs.existsSync(out))
   throw Error("ZERMATT_INVENTORY_OUTPUT_INVALID");
 const host=process.env.ZERMATT_MIGRATION_PG_HOST;
 const db=process.env.ZERMATT_MIGRATION_PG_DATABASE;
 const user=process.env.ZERMATT_MIGRATION_PG_USER;
 const password=process.env.ZERMATT_MIGRATION_PG_PASSWORD;
 const port=Number(process.env.ZERMATT_MIGRATION_PG_PORT||5432);
 if(!host || !db || !user || !password || !Number.isInteger(port) ||
    port<1 || port>65535)throw Error("ZERMATT_MIGRATION_LOCAL_CREDENTIALS_REQUIRED");
 const {Client}=require("../../backend/node_modules/pg");
 const connection=new Client({
  host,port,database:db,user,password,
  ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10000,
  statement_timeout:60000,application_name:"zermatt_migration_inventory"
 });
 try{
  await connection.connect();
  const evidence=await captureInventory(connection,{label});
  fs.writeFileSync(out,JSON.stringify(evidence,null,2),{encoding:"utf8",flag:"wx",mode:0o600});
  console.log(JSON.stringify({status:"EVIDENCE_CAPTURED",label,
    tables:evidence.tableCounts.length,file:path.basename(out)}));
 }finally{await connection.end().catch(()=>{});}
}
if(require.main===module)main().catch(()=>{
 console.error("ZERMATT_INVENTORY_CAPTURE_BLOCKED");
 process.exitCode=2;
});
