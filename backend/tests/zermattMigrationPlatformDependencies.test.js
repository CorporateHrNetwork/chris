"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {capturePlatformDependencies,evaluatePlatformDependencyGate}=require("../../tools/zermatt-migration/platformDependencyInventory.cjs");
function fixture(){return {schemaVersion:1,schemas:[{name:"public",tables:123,views:0},{name:"auth",tables:27,views:0},{name:"storage",tables:10,views:0},{name:"realtime",tables:3,views:0},{name:"vault",tables:1,views:1},{name:"extensions",tables:0,views:2}],extensions:[{name:"plpgsql",version:"1.0"},{name:"pg_stat_statements",version:"1.11"},{name:"supabase_vault",version:"0.3.1"}],publicRlsTables:14,publicPolicies:0,authUsers:0,storageObjects:0,storageBuckets:0}}
test("public-only restore never qualifies as production cutover",()=>{
 const r=evaluatePlatformDependencyGate(fixture());
 assert.equal(r.status,"BLOCKED");
 assert.equal(r.productionSwitchAuthorized,false);
 assert.ok(r.blockers.includes("SUPABASE_MANAGED_SCHEMAS_NOT_MAPPED"));
 assert.ok(r.blockers.includes("DATABASE_EXTENSIONS_NOT_VERIFIED"));
 assert.ok(r.blockers.includes("APPLICATION_AUTHORIZATION_RLS_NOT_VERIFIED"));
 assert.ok(r.blockers.includes("APPLICATION_LOGIN_ACCEPTANCE_REQUIRED"));
 assert.ok(r.blockers.includes("DOCUMENT_STORAGE_ACCEPTANCE_REQUIRED"));
 assert.ok(r.blockers.includes("PAYROLL_TSP_ACCEPTANCE_REQUIRED"));
 assert.ok(r.blockers.includes("ROLLBACK_TEST_REQUIRED"));
});
test("zero Supabase auth/storage rows do not bypass acceptance",()=>{
 const r=evaluatePlatformDependencyGate({...fixture(),authUsers:0,storageObjects:0,storageBuckets:0});
 assert.ok(r.blockers.includes("APPLICATION_LOGIN_ACCEPTANCE_REQUIRED"));
 assert.ok(r.blockers.includes("DOCUMENT_STORAGE_ACCEPTANCE_REQUIRED"));
});
test("only explicit independent acceptance unblocks platform gate; no implicit switch authorization",()=>{
 const r=evaluatePlatformDependencyGate(fixture(),{managedSchemaStrategyApproved:true,extensionCompatibilityVerified:true,authorizationAndRlsVerified:true,authenticationAccepted:true,documentsAccepted:true,payrollAndTspAccepted:true,rollbackTested:true});
 assert.equal(r.status,"PLATFORM_DEPENDENCIES_ACCEPTED");
 assert.deepEqual(r.blockers,[]);
 assert.equal(r.productionSwitchAuthorized,false);
});
test("invalid inventory fails closed",()=>assert.throws(()=>evaluatePlatformDependencyGate({schemaVersion:1}),/INVENTORY_REQUIRED/));
test("metadata capture uses read-only transaction; no record payloads",async()=>{
 const queries=[];const response=[
  {rows:[{name:"public",tables:123,views:0},{name:"auth",tables:27,views:0}]},
  {rows:[{name:"pg_stat_statements",version:"1.11"}]},
  {rows:[{tables:14}]},
  {rows:[{policies:0}]},
  {rows:[{auth_users:0,storage_objects:0,storage_buckets:0}]}
 ];
 const client={query:async(q)=>{queries.push(q);if(q.startsWith("BEGIN")||q==="COMMIT")return {rows:[]};return response.shift()}};
 const result=await capturePlatformDependencies(client);
 assert.equal(result.schemas.length,2);
 assert.equal(result.publicRlsTables,14);
 assert.equal(result.authUsers,0);
 assert.equal(queries[0],"BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
 assert.equal(queries.at(-1),"COMMIT");
 assert.ok(!JSON.stringify(result).includes("password"));
});
