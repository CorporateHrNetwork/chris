"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {openStaging,ACCOUNT,STAGING_HOST} = require("../../tools/cca-local-demo/runStaging");
const {createCcaPostgresTenantReader} = require("../src/cca/postgresTenantReadAdapter");
const {otpAt} = require("../../tools/cca-local-demo/localIdentityLab");

const master = Buffer.alloc(32,41);
const secret = Buffer.from("12345678901234567890");
const password = "Fictional-persistent-CCA-staging-ONLY-4343!";

async function fixture(t,{reader, clock=()=>1800000030}={}){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),"cca-persistent-pg-"));
 t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 fs.mkdirSync(path.join(directory,"state"));
 fs.mkdirSync(path.join(directory,"host-security"));
 const opts={directory,master,clock};
 const setup=openStaging({...opts,initialize:true});
 try{setup.enroll(password,secret);}finally{setup.release();}
 return {...opts,postgresReader:reader};
}
async function withServer(options,fn){
 const runtime=openStaging(options);
 try{
  await new Promise((resolve,reject)=>{
   runtime.server.once("error",reject);
   runtime.server.listen(0,STAGING_HOST,resolve);
  });
  const origin="http://"+STAGING_HOST+":"+runtime.server.address().port;
  const post=(route,payload,headers={})=>fetch(origin+route,{method:"POST",headers:{Origin:origin,"Content-Type":"application/json",...headers},body:JSON.stringify(payload)});
  await fn({origin,post});
 }finally{
  await new Promise(ok=>runtime.server.close(ok));
  runtime.release();
 }
}
test("protected persistent staging remains disabled when database reader is not provisioned",async t=>{
 const opts=await fixture(t);
 await withServer(opts,async({origin,post})=>{
  const first=await(await post("/api/password",{account:ACCOUNT,password})).json();
  const second=await post("/api/mfa",{challenge:first.challenge,code:otpAt(secret,Math.floor(1800000030/30))});
  assert.equal(second.status,200);
  const headers={Cookie:second.headers.get("set-cookie").split(";")[0]};
  assert.equal((await fetch(origin+"/api/staging-postgres-requests",{headers})).status,404);
 });
});
test("explicit server-owned reader works after staging restart with new MFA; old session rejected",async t=>{
 let tick=1800000030;
 const calls=[];
 const reader=createCcaPostgresTenantReader({connect:async()=>({
  query:async(sql,args)=>{
   calls.push({sql,args});
   if(sql.startsWith("SELECT rolsuper"))return {rows:[{rolsuper:false,rolbypassrls:false}]};
   if(sql.startsWith("SELECT id"))return {rows:[{id:"fictional-cedar-persisted",
     tenant_id:"demo-cedar",service_code:"MANAGED_POSTGRESQL",status:"REQUEST_ONLY"}]};
   return {rows:[]};
  },
  release:()=>{}
 })});
 const opts=await fixture(t,{reader,clock:()=>tick});
 let staleCookie;
 await withServer(opts,async({origin,post})=>{
  const first=await(await post("/api/password",{account:ACCOUNT,password})).json();
  const mfa=await post("/api/mfa",{challenge:first.challenge,code:otpAt(secret,Math.floor(tick/30))});
  assert.equal(mfa.status,200);
  staleCookie=mfa.headers.get("set-cookie").split(";")[0];
  const result=await fetch(origin+"/api/staging-postgres-requests",{headers:{Cookie:staleCookie}});
  assert.equal(result.status,200);
  assert.equal((await result.json()).requests[0].id,"fictional-cedar-persisted");
 });
 tick+=60;
 await withServer(opts,async({origin,post})=>{
  assert.equal((await fetch(origin+"/api/staging-postgres-requests",{headers:{Cookie:staleCookie}})).status,401);
  const first=await(await post("/api/password",{account:ACCOUNT,password})).json();
  const mfa=await post("/api/mfa",{challenge:first.challenge,code:otpAt(secret,Math.floor(tick/30))});
  assert.equal(mfa.status,200);
  const headers={Cookie:mfa.headers.get("set-cookie").split(";")[0]};
  const response=await fetch(origin+"/api/staging-postgres-requests",{headers});
  assert.equal(response.status,200);
  assert.equal((await response.json()).requests[0].id,"fictional-cedar-persisted");
 });
 assert.equal(calls.filter(c=>c.sql?.startsWith("SELECT id")).length,2);
 assert.deepEqual(calls.filter(c=>c.sql?.startsWith("SELECT set_config")).map(c=>c.args),[["demo-cedar"],["demo-cedar"]]);
});
