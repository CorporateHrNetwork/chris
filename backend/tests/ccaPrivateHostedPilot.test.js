"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const {createCcaPrivatePilot}=require("../src/cca/privateHostedPilot");
const key=crypto.generateKeyPairSync("rsa",{modulusLength:2048});
const now=Date.now();
const env=()=>({
 CCA_PILOT_ENABLED:"true",CCA_HOSTED_DATABASE_MODE:"isolated-hosted",CCA_HOSTED_DATABASE_SCOPE:"CCA_ONLY",
 CCA_PG_HOST:"db.cca.example.org",CCA_PG_PORT:"5432",
 CCA_PG_DATABASE:"cca_testpilot",CCA_PG_READER:"cca_hosted_reader",
 CCA_PG_PASSWORD:"fictional-password-123456789123456789",
 CCA_PG_CA_PEM:"-----BEGIN CERTIFICATE-----\nFICTIONAL\n-----END CERTIFICATE-----",
 CCA_OPERATOR_PUBLIC_KEY_PEM:key.publicKey.export({type:"spki",format:"pem"}),
 CCA_OPERATOR_ISSUER:"https://identity.cca.example.test",
 CCA_OPERATOR_AUDIENCE:"cca-hosted-pilot",CCA_OPERATOR_KEY_ID:"cca-pilot-1"
});
const sign=(tenantId="demo-cedar")=>{
 const claims={iss:env().CCA_OPERATOR_ISSUER,aud:env().CCA_OPERATOR_AUDIENCE,
  iat:Math.floor(now/1000)-10,nbf:Math.floor(now/1000)-10,
  exp:Math.floor(now/1000)+300,jti:"fictional-jti-000001",
  sub:"cca-fictional-operator",scope:"CCA",subjectType:"OPERATOR",
  tenantId,roles:["SERVICE_AGENT"]};
 const encode=x=>Buffer.from(JSON.stringify(x)).toString("base64url");
 const input=encode({alg:"RS256",typ:"JWT",kid:"cca-pilot-1"})+"."+encode(claims);
 return input+"."+crypto.sign("RSA-SHA256",Buffer.from(input),key.privateKey).toString("base64url");
};
class FakePool {
 async connect(){return {query:async sql=>{
  if(sql.startsWith("SELECT current_user"))return {rows:[{role:"cca_hosted_reader",database:"cca_testpilot",rolsuper:false,rolbypassrls:false}]};
  if(sql.startsWith("SELECT rolsuper"))return {rows:[{rolsuper:false,rolbypassrls:false}]};
  if(sql.startsWith("SELECT id"))return {rows:[{id:"fictional-cedar",tenant_id:"demo-cedar",service_code:"MANAGED_POSTGRESQL",status:"REQUEST_ONLY"}]};
  return {rows:[]};
 },release(){}};}
 async end(){}
}
test("CCA private pilot requires explicit enabled mode, separate verifier, revocation and DB dependencies",()=>{
 for(const overrides of [
  {CCA_PILOT_ENABLED:"false"},{CCA_HOSTED_DATABASE_SCOPE:"CHRIS"},
  {CCA_OPERATOR_PUBLIC_KEY_PEM:""},{CCA_OPERATOR_ISSUER:"http://invalid.example"},
 ])assert.throws(()=>createCcaPrivatePilot({env:{...env(),...overrides},Pool:FakePool,isRevoked:async()=>false}));
 assert.throws(()=>createCcaPrivatePilot({env:env(),Pool:FakePool}),/CCA_PILOT_SECURITY_DEPENDENCIES_REQUIRED/);
 assert.throws(()=>createCcaPrivatePilot({env:env(),isRevoked:async()=>false}),/CCA_PILOT_SECURITY_DEPENDENCIES_REQUIRED/);
});
test("CCA private pilot verifies real RS256 token and tenant-scoped DB read end-to-end",async()=>{
 let revocationChecks=0;
 const runtime=createCcaPrivatePilot({
  env:env(),Pool:FakePool,isRevoked:async()=>{revocationChecks++;return false;}
 });
 try{
  const address=await runtime.start();
  const base="http://127.0.0.1:"+address.port;
  assert.equal((await fetch(base+"/health/ready")).status,200);
  assert.equal((await fetch(base+"/api/cca/service-requests")).status,403);
  const token=sign();
  const response=await fetch(base+"/api/cca/service-requests",
   {headers:{Cookie:"cca_hosted_sid="+token}});
  assert.equal(response.status,200);
  assert.deepEqual((await response.json()).requests,
   [{id:"fictional-cedar",serviceCode:"MANAGED_POSTGRESQL",status:"REQUEST_ONLY"}]);
  assert.equal(revocationChecks,1);
  assert.equal((await fetch(base+"/api/cca/service-requests?tenantId=demo-atlas",
   {headers:{Cookie:"cca_hosted_sid="+token}})).status,400);
 }finally{await runtime.stop();}
});
test("CCA private pilot fails closed when token revoked or revocation backend unavailable",async()=>{
 for(const isRevoked of [async()=>true,async()=>{throw Error("private failure")}]){
  const runtime=createCcaPrivatePilot({env:env(),Pool:FakePool,isRevoked});
  try{
   const address=await runtime.start();
   const response=await fetch("http://127.0.0.1:"+address.port+"/api/cca/service-requests",
    {headers:{Cookie:"cca_hosted_sid="+sign()}});
   assert.equal(response.status,403);
  }finally{await runtime.stop();}
 }
});
