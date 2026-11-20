"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {evaluateMigrationPreflight}=require("../tools/zermatt-migration/migrationPreflight.cjs");
const tools=()=>({pg_dump:{major:17},pg_restore:{major:17},psql:{major:17}});
const good={tools:tools(),source:{hostConfigured:true,credentialsConfigured:true,identity:"source.example/postgres"},
 target:{hostConfigured:true,credentialsConfigured:true,identity:"target.example/chris"},
 destinationApproved:true};
test("migration preflight passes only distinct confirmed Postgres 17 source and target",()=>{
 const result=evaluateMigrationPreflight(good);
 assert.equal(result.status,"READY_FOR_AUTHORIZED_REHEARSAL");
 assert.equal(result.sourceDataTransferred,false);
 assert.equal(result.productionSwitchAuthorized,false);
});
test("migration preflight blocks incomplete or older PostgreSQL tooling",()=>{
 for(const value of [null,{}, {pg_dump:{major:16},pg_restore:{major:17},psql:{major:17}}]){
  const result=evaluateMigrationPreflight({...good,tools:value});
  assert.equal(result.status,"BLOCKED");
  assert.ok(result.blockers.includes("POSTGRESQL_17_CLIENT_TOOLS_REQUIRED"));
 }
});
test("migration preflight refuses unapproved or identical source and target",()=>{
 const cases=[
  {...good,destinationApproved:false},
  {...good,target:{...good.target,identity:good.source.identity}},
  {...good,source:{...good.source,credentialsConfigured:false}},
  {...good,target:{...good.target,hostConfigured:false}},
 ];
 for(const c of cases)assert.equal(evaluateMigrationPreflight(c).status,"BLOCKED");
});
test("migration preflight returns only categorical evidence, not credentials",()=>{
 const r=evaluateMigrationPreflight({source:{password:"SECRET123",identity:"private",hostConfigured:false},
  target:{password:"OTHER_SECRET"},tools:{}});
 assert.doesNotMatch(JSON.stringify(r),/SECRET|private/);
});
