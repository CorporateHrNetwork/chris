"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {captureInventory,compareInventories}=require("../../tools/zermatt-migration/databaseInventory.cjs");

function evidence(label,overrides={}){
 return {schemaVersion:1,label,versionMajor:17,tableCounts:[
  {table:"public.employees",rows:"342"},
  {table:"public.payroll_runs",rows:"4"},
  {table:"public.leave_requests",rows:"25"},
 ],constraintsCount:319,functionsCount:15,triggersCount:15,
 constraintsSha256:"x",functionsSha256:"y",triggersSha256:"z",...overrides};
}
test("identical PostgreSQL 17 inventories pass without reading employee details",()=>{
 const match=compareInventories(evidence("source"),evidence("target"));
 assert.equal(match.status,"COUNTS_AND_DEFINITIONS_MATCH");
 assert.equal(match.issues.length,0);
});
test("any missing table, row count, function, foreign key or trigger blocks cutover",()=>{
 for(const changes of [
  {tableCounts:[{table:"public.employees",rows:"341"},{table:"public.payroll_runs",rows:"4"},{table:"public.leave_requests",rows:"25"}]},
  {tableCounts:[]},{constraintsCount:318},{functionsSha256:"changed"},
  {triggersCount:14},{triggersSha256:"changed"},{versionMajor:16}
 ]){
  assert.equal(compareInventories(evidence("source"),evidence("target",changes)).status,"BLOCKED");
 }
});
test("capture inventory runs in consistent READ ONLY transaction and returns metadata only",async()=>{
 const queries=[];
 const client={query:async sql=>{
  queries.push(sql);
  if(sql.startsWith("SELECT current_setting"))return {rows:[{version_num:170006,database_bytes:"66000000"}]};
  if(sql.startsWith("SELECT n.nspname"))return {rows:[{schema_name:"public",table_name:"employees"}]};
  if(sql.startsWith("SELECT count(*)"))return {rows:[{n:"342"}]};
  if(sql.startsWith("SELECT c.conrelid"))return {rows:[{rel:"employees",name:"employees_pkey",type:"p",definition:"PRIMARY KEY (id)"}]};
  if(sql.startsWith("SELECT p.proname"))return {rows:[]};
  if(sql.startsWith("SELECT t.tgrelid"))return {rows:[]};
  return {rows:[]};
 }};
 const snapshot=await captureInventory(client,{label:"source"});
 assert.equal(queries[0],"BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
 assert.equal(queries.at(-1),"COMMIT");
 assert.equal(snapshot.tableCounts[0].rows,"342");
 assert.equal(JSON.stringify(snapshot).includes("PRIMARY KEY (id)"),false);
 assert.equal(JSON.stringify(snapshot).includes("email"),false);
});
test("reconciliation rejects mislabeled evidence",()=>{
 assert.throws(()=>compareInventories(evidence("source"),evidence("source")),/ZERMATT_INVENTORY_SCOPE_INVALID/);
});
