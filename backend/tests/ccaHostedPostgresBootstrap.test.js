"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildCcaHostedPostgresOptions, createCcaHostedPostgres } =
  require("../src/cca/hostedPostgresBootstrap");

const valid = () => ({
  CCA_HOSTED_DATABASE_MODE:"isolated-hosted",
  CCA_HOSTED_DATABASE_SCOPE:"CCA_ONLY",
  CCA_PG_HOST:"db.cca-pilot.example.org",
  CCA_PG_PORT:"5432",
  CCA_PG_DATABASE:"cca_pilot_main",
  CCA_PG_READER:"cca_reader_pilot",
  CCA_PG_PASSWORD:"fictional-secret-not-a-real-password-12345678",
  CCA_PG_CA_PEM:"-----BEGIN CERTIFICATE-----\nfictional-ca-fixture\n-----END CERTIFICATE-----"
});
test("CCA hosted database requires explicit CCA isolation and verified TLS",()=>{
 const config=buildCcaHostedPostgresOptions(valid());
 assert.equal(config.database,"cca_pilot_main");
 assert.equal(config.ssl.rejectUnauthorized,true);
 assert.equal(config.max,5);
 assert.equal(config.statement_timeout,5000);
 assert.equal(Object.isFrozen(config),true);
 assert.equal(Object.isFrozen(config.ssl),true);
});
test("CCA hosted DB fails closed for CHRiS/Supabase settings or insecure destinations",()=>{
 for(const [field,value] of [
  ["CCA_HOSTED_DATABASE_MODE",""],["CCA_HOSTED_DATABASE_SCOPE","OTHER"],
  ["CCA_PG_HOST","localhost"],["CCA_PG_HOST","127.0.0.1"],
  ["CCA_PG_HOST","zermatt.example.org"],["CCA_PG_DATABASE","chris_main"],
  ["CCA_PG_READER","postgres"],["CCA_PG_PORT","99999"],
  ["CCA_PG_PASSWORD","short"],["CCA_PG_CA_PEM",""],
  ["DATABASE_URL","postgresql://someone:secret@elsewhere/main"],
  ["SUPABASE_URL","https://example.supabase.co"],
  ["CCA_PG_SSL_REJECT_UNAUTHORIZED","false"]]) {
  assert.throws(()=>buildCcaHostedPostgresOptions({...valid(),[field]:value}), {code:/^CCA_/},field);
 }
});
test("CCA hosted reader refuses an elevated DB role", async()=>{
 let released=false,closed=false;
 class FakePool {
  constructor(options){assert.equal(options.ssl.rejectUnauthorized,true);}
  async connect(){
   return {query:async()=>({rows:[{role:"cca_reader_pilot",database:"cca_pilot_main",rolsuper:true,rolbypassrls:false}]}),
   release:()=>{released=true}};
  }
  async end(){closed=true;}
 }
 const session=createCcaHostedPostgres({env:valid(),Pool:FakePool});
 await assert.rejects(()=>session.verify(),{code:"CCA_HOSTED_DATABASE_ROLE_INVALID"});
 assert.equal(released,true);
 await session.close();
 assert.equal(closed,true);
});
test("CCA hosted reader requires explicit injected Pool; no default deployment",()=>{
 assert.throws(()=>createCcaHostedPostgres({env:valid()}),{code:"CCA_HOSTED_PG_POOL_REQUIRED"});
});
