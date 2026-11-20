"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {createCcaHostedRuntime}=require("../src/cca/hostedRuntime");
const {PERMISSIONS}=require("../src/cca/controlPlanePolicy");
const env={
 CCA_HOSTED_DATABASE_MODE:"isolated-hosted",CCA_HOSTED_DATABASE_SCOPE:"CCA_ONLY",
 CCA_PG_HOST:"db.cca.example.org",CCA_PG_PORT:"5432",
 CCA_PG_DATABASE:"cca_testpilot",CCA_PG_READER:"cca_hosted_reader",
 CCA_PG_PASSWORD:"fictional-password-123456789123456789",
 CCA_PG_CA_PEM:"-----BEGIN CERTIFICATE-----\nFICTIONAL\n-----END CERTIFICATE-----"
};
test("CCA composition refuses absent operator identity before instantiating a pool",()=>{
 let built=0;
 class Pool{constructor(){built++;}}
 assert.throws(()=>createCcaHostedRuntime({env,Pool}),/CCA_HOSTED_OPERATOR_IDENTITY_NOT_CONFIGURED/);
 assert.equal(built,0);
});
test("CCA hosted runtime composes verified DB and operator identity on private listener",async()=>{
 let closed=0;
 class Pool{
  async connect(){
   return {query:async sql=>{
    if(sql.startsWith("SELECT current_user"))return {rows:[{role:"cca_hosted_reader",database:"cca_testpilot",rolsuper:false,rolbypassrls:false}]};
    if(sql.startsWith("SELECT rolsuper"))return {rows:[{rolsuper:false,rolbypassrls:false}]};
    if(sql.startsWith("SELECT id"))return {rows:[{id:"fictional-1",tenant_id:"demo-cedar",service_code:"MANAGED_POSTGRESQL",status:"REQUEST_ONLY"}]};
    return {rows:[]};
   },release:()=>{}};
  }
  async end(){closed++;}
 }
 const context={
  platformIdentityVerified:true,platformScope:"CCA",
  platformGrants:[PERMISSIONS.TICKETS_READ],
  tenantGrants:{"demo-cedar":[PERMISSIONS.TICKETS_READ]}
 };
 const runtime=createCcaHostedRuntime({env,Pool,resolveOperatorSession:async()=>({accepted:true,context,tenantId:"demo-cedar"})});
 try{
  const address=await runtime.start();
  const response=await fetch("http://127.0.0.1:"+address.port+"/api/cca/service-requests");
  assert.equal(response.status,200);
  assert.deepEqual((await response.json()).requests,[{id:"fictional-1",serviceCode:"MANAGED_POSTGRESQL",status:"REQUEST_ONLY"}]);
 }finally{await runtime.stop();}
 assert.equal(closed,1);
});
