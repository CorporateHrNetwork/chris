"use strict";
// Read-only migration inventory; prints no employee records or credentials.
// Designed for a complete CHRiS PostgreSQL database comparison.
const crypto=require("node:crypto");
const fs=require("node:fs");

function sqlIdentifier(value) {
 if(typeof value!=="string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(value))
   throw Error("ZERMATT_INVENTORY_IDENTIFIER_INVALID");
 return '"'+value.replaceAll('"','""')+'"';
}
function fingerprint(value){
 return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
async function captureInventory(client,{label}={}) {
 if(!/^(source|target)$/.test(label))throw Error("ZERMATT_INVENTORY_LABEL_REQUIRED");
 await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
 try {
  const meta=await client.query(
   "SELECT current_setting('server_version_num')::int AS version_num, " +
   "pg_database_size(current_database())::bigint::text AS database_bytes"
  );
  const tables=await client.query(
   "SELECT n.nspname AS schema_name, c.relname AS table_name " +
   "FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace " +
   "WHERE c.relkind IN ('r','p') AND n.nspname='public' " +
   "ORDER BY n.nspname,c.relname"
  );
  const counts=[];
  for(const row of tables.rows){
   const table=sqlIdentifier(row.schema_name)+"."+sqlIdentifier(row.table_name);
   const result=await client.query("SELECT count(*)::bigint::text AS n FROM "+table);
   counts.push({table:row.schema_name+"."+row.table_name,rows:result.rows[0].n});
  }
  const constraints=await client.query(
   "SELECT c.conrelid::regclass::text AS rel, c.conname AS name, " +
   "c.contype AS type, pg_get_constraintdef(c.oid) AS definition " +
   "FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace " +
   "WHERE n.nspname='public' ORDER BY 1,2"
  );
  const functions=await client.query(
   "SELECT p.proname AS name,pg_get_function_identity_arguments(p.oid) AS args," +
   "pg_get_functiondef(p.oid) AS definition FROM pg_proc p " +
   "JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' " +
   "ORDER BY 1,2"
  );
  const triggers=await client.query(
   "SELECT t.tgrelid::regclass::text AS rel,t.tgname AS name," +
   "pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t " +
   "JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace " +
   "WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY 1,2"
  );
  const inventory={
   schemaVersion:1,label,versionMajor:Math.floor(Number(meta.rows[0].version_num)/10000),
   databaseBytes:meta.rows[0].database_bytes,
   tableCounts:counts,
   constraintsCount:constraints.rows.length,
   functionsCount:functions.rows.length,
   triggersCount:triggers.rows.length,
   constraintsSha256:fingerprint(constraints.rows),
   functionsSha256:fingerprint(functions.rows),
   triggersSha256:fingerprint(triggers.rows),
   capturedAt:new Date().toISOString(),
  };
  await client.query("COMMIT");
  return inventory;
 }catch(err){
  try{await client.query("ROLLBACK");}catch{}
  throw err;
 }
}
function compareInventories(source,target){
 if(source?.label!=="source" || target?.label!=="target" ||
    source.schemaVersion!==1 || target.schemaVersion!==1)
  throw Error("ZERMATT_INVENTORY_SCOPE_INVALID");
 const issues=[];
 if(source.versionMajor!==17 || target.versionMajor!==17)issues.push("POSTGRES_17_REQUIRED");
 const a=new Map(source.tableCounts.map(x=>[x.table,x.rows]));
 const b=new Map(target.tableCounts.map(x=>[x.table,x.rows]));
 for(const table of new Set([...a.keys(),...b.keys()])){
  if(!a.has(table)||!b.has(table))issues.push("TABLE_MISSING:"+table);
  else if(a.get(table)!==b.get(table))issues.push("ROW_COUNT_MISMATCH:"+table);
 }
 for(const kind of ["constraints","functions","triggers"]){
  if(source[kind+"Count"]!==target[kind+"Count"])issues.push(kind.toUpperCase()+"_COUNT_MISMATCH");
  if(source[kind+"Sha256"]!==target[kind+"Sha256"])issues.push(kind.toUpperCase()+"_DEFINITION_MISMATCH");
 }
 return {status:issues.length?"BLOCKED":"COUNTS_AND_DEFINITIONS_MATCH",
  sourceTables:a.size,targetTables:b.size,issues,
  reminder:"Counts and schema fingerprints do not replace transactional, tenant, authentication, document or payroll acceptance tests."};
}
module.exports={captureInventory,compareInventories};
if(require.main===module){
 try{
  const [sourcePath,targetPath]=process.argv.slice(2);
  if(!sourcePath||!targetPath)throw Error("SOURCE_TARGET_JSON_REQUIRED");
  const outcome=compareInventories(
   JSON.parse(fs.readFileSync(sourcePath,"utf8")),
   JSON.parse(fs.readFileSync(targetPath,"utf8"))
  );
  console.log(JSON.stringify(outcome,null,2));
  if(outcome.status!=="COUNTS_AND_DEFINITIONS_MATCH")process.exitCode=2;
 }catch{
  console.error("ZERMATT_RECONCILIATION_BLOCKED");
  process.exitCode=2;
 }
}
